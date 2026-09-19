const SATELLITE_SERVICE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
const BLUE_MARBLE_URL =
  "https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_8192.png";

const RECORD_FPS = 30;
const PRE_ROLL_MS = 500;
const POST_ROLL_MS = 500;

const REALISM_FRAGMENT_SHADER = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;

void main() {
  vec4 source = texture(colorTexture, v_textureCoordinates);
  vec3 color = max(source.rgb, vec3(0.0));

  color = (color - vec3(0.5)) * 1.04 + vec3(0.5);
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, 0.94);
  color = pow(max(color, vec3(0.0)), vec3(1.02));

  out_FragColor = vec4(clamp(color, 0.0, 1.0), source.a);
}
`;

const elements = {
  app: document.getElementById("app"),
  cesiumContainer: document.getElementById("cesiumContainer"),
  name: document.getElementById("nameInput"),
  lat: document.getElementById("latInput"),
  lon: document.getElementById("lonInput"),
  height: document.getElementById("heightInput"),
  duration: document.getElementById("durationInput"),
  outputWidth: document.getElementById("widthInput"),
  outputHeight: document.getElementById("heightOutputInput"),
  video: document.getElementById("videoInput"),
  play: document.getElementById("playButton"),
  home: document.getElementById("homeButton"),
  status: document.getElementById("status"),
  overlay: document.getElementById("videoOverlay"),
  storyVideo: document.getElementById("storyVideo"),
  videoTitle: document.getElementById("videoTitle"),
  closeVideo: document.getElementById("closeVideoButton"),
};

let viewer;
let destinationMarker;
let globalImageryLayer;
let detailImageryLayer;
let satelliteReady = false;

function setStatus(message) {
  elements.status.textContent = message;
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function waitForAnimationFrames(count = 2) {
  return new Promise((resolve) => {
    function next(remaining) {
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => next(remaining - 1));
    }
    next(count);
  });
}

function readNumber(input, label) {
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    throw new Error(label + "が正しくありません");
  }
  return value;
}

function readPositiveInteger(input, label) {
  const value = readNumber(input, label);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(label + "は1以上の整数で指定してください");
  }
  return value;
}

function readStory() {
  const latitude = readNumber(elements.lat, "緯度");
  const longitude = readNumber(elements.lon, "経度");
  const height = readNumber(elements.height, "到着高度");
  const duration = readNumber(elements.duration, "移動時間");
  const outputWidth = readPositiveInteger(elements.outputWidth, "出力幅");
  const outputHeight = readPositiveInteger(elements.outputHeight, "出力高さ");

  if (latitude < -90 || latitude > 90) {
    throw new Error("緯度は -90〜90 で指定してください");
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error("経度は -180〜180 で指定してください");
  }
  if (height < 1000) {
    throw new Error("到着高度は 1000m 以上で指定してください");
  }
  if (duration < 0.5 || duration > 30) {
    throw new Error("移動時間は 0.5〜30秒で指定してください");
  }

  return {
    name: elements.name.value.trim() || "Story location",
    latitude,
    longitude,
    height,
    duration,
    outputWidth,
    outputHeight,
    videoUrl: elements.video.value.trim(),
  };
}

function setHomeView(animated = true) {
  if (!viewer) {
    return;
  }

  const options = {
    destination: Cesium.Cartesian3.fromDegrees(20, 18, 22000000),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
    duration: animated ? 2.2 : 0,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
  };

  if (animated) {
    viewer.camera.flyTo(options);
  } else {
    viewer.camera.setView(options);
  }

  setStatus("地球全景");
}

function showMarker(story) {
  if (destinationMarker) {
    viewer.entities.remove(destinationMarker);
  }

  destinationMarker = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(story.longitude, story.latitude),
    point: {
      pixelSize: 11,
      color: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: story.name,
      font: "600 15px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -28),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

async function openVideo(story) {
  if (!story.videoUrl) {
    return;
  }

  elements.videoTitle.textContent = story.name;
  elements.storyVideo.src = story.videoUrl;
  elements.overlay.classList.add("visible");
  elements.overlay.setAttribute("aria-hidden", "false");

  try {
    await elements.storyVideo.play();
  } catch {
    setStatus("動画を表示しました。再生ボタンを押してください");
  }
}

function closeVideo() {
  elements.storyVideo.pause();
  elements.storyVideo.removeAttribute("src");
  elements.storyVideo.load();
  elements.overlay.classList.remove("visible");
  elements.overlay.setAttribute("aria-hidden", "true");
}

function getNadirCameraView(story) {
  const target = Cesium.Cartesian3.fromDegrees(
    story.longitude,
    story.latitude,
    0
  );
  const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    target,
    new Cesium.Cartesian3()
  );
  const offset = Cesium.Cartesian3.multiplyByScalar(
    normal,
    story.height,
    new Cesium.Cartesian3()
  );
  const destination = Cesium.Cartesian3.add(
    target,
    offset,
    new Cesium.Cartesian3()
  );
  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(
      target,
      destination,
      new Cesium.Cartesian3()
    ),
    new Cesium.Cartesian3()
  );
  const localFrame = Cesium.Transforms.eastNorthUpToFixedFrame(target);
  const northColumn = Cesium.Matrix4.getColumn(
    localFrame,
    1,
    new Cesium.Cartesian4()
  );
  const up = Cesium.Cartesian3.normalize(
    new Cesium.Cartesian3(
      northColumn.x,
      northColumn.y,
      northColumn.z
    ),
    new Cesium.Cartesian3()
  );

  return {
    target,
    destination,
    direction,
    up,
  };
}

function flyToStory(story) {
  return new Promise((resolve) => {
    const view = getNadirCameraView(story);

    viewer.camera.flyTo({
      destination: view.destination,
      orientation: {
        direction: view.direction,
        up: view.up,
      },
      duration: story.duration,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      complete: () => {
        viewer.camera.setView({
          destination: view.destination,
          orientation: {
            direction: view.direction,
            up: view.up,
          },
        });
        showMarker(story);
        viewer.scene.requestRender();
        resolve();
      },
      cancel: resolve,
    });
  });
}

function getMp4MimeType() {
  if (
    !window.MediaRecorder ||
    typeof MediaRecorder.isTypeSupported !== "function" ||
    typeof HTMLCanvasElement.prototype.captureStream !== "function"
  ) {
    return null;
  }

  const candidates = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4;codecs=avc1",
    "video/mp4;codecs=h264",
    "video/mp4",
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || null;
}

function applyRecordingViewport(outputWidth, outputHeight) {
  const aspect = outputWidth / outputHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const viewportAspect = viewportWidth / viewportHeight;

  let cssWidth;
  let cssHeight;

  if (viewportAspect > aspect) {
    cssHeight = viewportHeight;
    cssWidth = cssHeight * aspect;
  } else {
    cssWidth = viewportWidth;
    cssHeight = cssWidth / aspect;
  }

  Object.assign(elements.cesiumContainer.style, {
    inset: "auto",
    left: "50%",
    top: "50%",
    width: cssWidth + "px",
    height: cssHeight + "px",
    transform: "translate(-50%, -50%)",
  });

  viewer.resize();
  viewer.scene.requestRender();
}

function restoreViewerViewport() {
  elements.cesiumContainer.removeAttribute("style");
  viewer.resize();
  viewer.scene.requestRender();
}

function getVisibleCreditText() {
  const container = viewer?.cesiumWidget?.creditContainer;
  if (!container) {
    return "Esri World Imagery";
  }

  const text = container.innerText.replace(/\s+/g, " ").trim();
  return text || "Esri World Imagery";
}

function drawAttribution(context, canvas) {
  const text = getVisibleCreditText();
  const fontSize = Math.max(14, Math.round(canvas.height * 0.014));
  const padding = Math.max(8, Math.round(fontSize * 0.55));

  context.save();
  context.font = fontSize + "px sans-serif";
  context.textBaseline = "bottom";

  const maxWidth = canvas.width * 0.92;
  let displayText = text;
  while (
    displayText.length > 8 &&
    context.measureText(displayText).width > maxWidth
  ) {
    displayText = displayText.slice(0, -5);
  }
  if (displayText !== text) {
    displayText += "…";
  }

  const textWidth = context.measureText(displayText).width;
  const x = canvas.width - textWidth - padding;
  const y = canvas.height - padding;

  context.fillStyle = "rgba(0, 0, 0, 0.52)";
  context.fillRect(
    x - padding,
    y - fontSize - padding / 2,
    textWidth + padding * 2,
    fontSize + padding
  );

  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  context.fillText(displayText, x, y);
  context.restore();
}

function sanitizeFileName(name) {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned || "storyglobe";
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function recordFlightAsMp4(story, mimeType) {
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = story.outputWidth;
  outputCanvas.height = story.outputHeight;

  const context = outputCanvas.getContext("2d", {
    alpha: false,
  });
  if (!context) {
    throw new Error("録画用Canvasを作成できませんでした");
  }

  viewer.scene.render();
  context.drawImage(
    viewer.canvas,
    0,
    0,
    outputCanvas.width,
    outputCanvas.height
  );
  drawAttribution(context, outputCanvas);

  const stream = outputCanvas.captureStream(RECORD_FPS);
  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType });

  let animationFrameId = null;
  let drawing = true;

  function drawFrame() {
    if (!drawing) {
      return;
    }

    context.fillStyle = "#000";
    context.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
    context.drawImage(
      viewer.canvas,
      0,
      0,
      outputCanvas.width,
      outputCanvas.height
    );
    drawAttribution(context, outputCanvas);
    animationFrameId = window.requestAnimationFrame(drawFrame);
  }

  const finished = new Promise((resolve, reject) => {
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    });

    recorder.addEventListener("stop", () => {
      resolve(new Blob(chunks, { type: mimeType }));
    });

    recorder.addEventListener("error", (event) => {
      reject(event.error || new Error("MP4録画に失敗しました"));
    });
  });

  drawFrame();
  recorder.start(250);

  try {
    await wait(PRE_ROLL_MS);
    await flyToStory(story);
    await wait(POST_ROLL_MS);
    recorder.stop();
    return await finished;
  } finally {
    drawing = false;
    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId);
    }
    stream.getTracks().forEach((track) => track.stop());
  }
}

async function runStory() {
  let story;
  try {
    story = readStory();
  } catch (error) {
    setStatus(error.message);
    return;
  }

  if (!satelliteReady) {
    setStatus("衛星写真の読み込みが完了していません");
    return;
  }

  const mimeType = getMp4MimeType();
  if (!mimeType) {
    setStatus("このブラウザはCanvasのMP4録画に対応していません");
    return;
  }

  elements.play.disabled = true;
  closeVideo();
  elements.app.classList.add("recording");

  try {
    applyRecordingViewport(story.outputWidth, story.outputHeight);
    setHomeView(false);
    await waitForAnimationFrames(3);
    await wait(350);

    const mp4 = await recordFlightAsMp4(story, mimeType);
    const fileName = sanitizeFileName(story.name) + ".mp4";
    downloadBlob(mp4, fileName);

    setStatus(
      fileName +
        " を " +
        story.outputWidth +
        "×" +
        story.outputHeight +
        " で出力しました"
    );
  } catch (error) {
    console.error(error);
    setStatus(error.message || "MP4出力に失敗しました");
  } finally {
    restoreViewerViewport();
    elements.app.classList.remove("recording");
    elements.play.disabled = false;
  }

  await openVideo(story);
}

function applyQueryParameters() {
  const params = new URLSearchParams(window.location.search);

  const mappings = [
    ["name", elements.name],
    ["lat", elements.lat],
    ["lon", elements.lon],
    ["height", elements.height],
    ["duration", elements.duration],
    ["width", elements.outputWidth],
    ["heightPx", elements.outputHeight],
    ["video", elements.video],
  ];

  for (const [key, input] of mappings) {
    if (params.has(key)) {
      input.value = params.get(key);
    }
  }

  return params.get("autoplay") === "1";
}

function updateImageryBlend() {
  if (!detailImageryLayer) {
    return;
  }

  if (!globalImageryLayer) {
    detailImageryLayer.alpha = 1;
    return;
  }

  const height = viewer.camera.positionCartographic.height;
  const globalAlpha = Cesium.Math.clamp(
    (height - 3500000) / 6500000,
    0,
    1
  );

  globalImageryLayer.alpha = globalAlpha;
  detailImageryLayer.alpha = 1 - globalAlpha;
}

async function addSatelliteImagery() {
  try {
    const globalProvider = Cesium.SingleTileImageryProvider.fromUrl
      ? await Cesium.SingleTileImageryProvider.fromUrl(
          BLUE_MARBLE_URL,
          { credit: "NASA Visible Earth / Blue Marble" }
        )
      : new Cesium.SingleTileImageryProvider({
          url: BLUE_MARBLE_URL,
          credit: "NASA Visible Earth / Blue Marble",
        });

    globalImageryLayer =
      viewer.imageryLayers.addImageryProvider(globalProvider);
    globalImageryLayer.brightness = 0.86;
    globalImageryLayer.contrast = 1.12;
    globalImageryLayer.saturation = 0.86;
    globalImageryLayer.gamma = 0.98;
  } catch (error) {
    console.warn("Blue Marble load failed:", error);
  }

  const detailProvider =
    await Cesium.ArcGisMapServerImageryProvider.fromUrl(
      SATELLITE_SERVICE_URL
    );

  detailImageryLayer =
    viewer.imageryLayers.addImageryProvider(detailProvider);
  detailImageryLayer.brightness = 0.86;
  detailImageryLayer.contrast = 1.16;
  detailImageryLayer.saturation = 0.86;
  detailImageryLayer.gamma = 0.98;

  updateImageryBlend();
  viewer.camera.changed.addEventListener(updateImageryBlend);

  satelliteReady = true;
  setStatus("衛星写真を読み込みました");
}

async function initialize() {
  if (!window.Cesium) {
    setStatus("CesiumJSを読み込めませんでした");
    return;
  }

  viewer = new Cesium.Viewer("cesiumContainer", {
    animation: false,
    timeline: false,
    geocoder: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    homeButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    baseLayer: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    contextOptions: {
      webgl: {
        preserveDrawingBuffer: true,
      },
    },
  });

  viewer.scene.highDynamicRange = true;
  viewer.scene.backgroundColor = Cesium.Color.BLACK;
  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.dynamicAtmosphereLighting = false;
  viewer.scene.globe.dynamicAtmosphereLightingFromSun = false;
  viewer.scene.globe.showGroundAtmosphere = false;
  viewer.scene.fog.enabled = false;

  viewer.scene.skyAtmosphere.show = false;
  if (viewer.scene.skyBox) {
    viewer.scene.skyBox.show = false;
  }
  if (viewer.scene.moon) {
    viewer.scene.moon.show = false;
  }

  if (viewer.scene.postProcessStages.fxaa) {
    viewer.scene.postProcessStages.fxaa.enabled = true;
  }

  viewer.scene.postProcessStages.add(
    new Cesium.PostProcessStage({
      name: "storyglobe-realism",
      fragmentShader: REALISM_FRAGMENT_SHADER,
    })
  );

  setHomeView(false);

  try {
    await addSatelliteImagery();
  } catch (error) {
    console.error("Satellite imagery load failed:", error);
    setStatus("衛星写真の読み込みに失敗しました");
  }

  const autoplay = applyQueryParameters();

  elements.play.addEventListener("click", runStory);
  elements.home.addEventListener("click", () => {
    closeVideo();
    setHomeView(true);
  });
  elements.closeVideo.addEventListener("click", closeVideo);

  if (autoplay) {
    window.setTimeout(runStory, 500);
  }
}

initialize().catch((error) => {
  console.error(error);
  setStatus("初期化に失敗しました");
});
