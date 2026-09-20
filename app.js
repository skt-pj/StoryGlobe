const SATELLITE_SERVICE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
const BLUE_MARBLE_URL =
  "https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_8192.png";
const NESSIE_IMAGE_URL =
  "./assets/loch-ness-monster.png?v=20260920-3";
const NESSIE_DESTINATION = Object.freeze({
  name: "ネッシー",
  latitude: 57.2741223,
  longitude: -4.4849684,
});
const SETTINGS_COOKIE_NAME = "storyglobeSettings";
const SETTINGS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const DEFAULT_FORM_SETTINGS = Object.freeze({
  previousPreviousName: NESSIE_DESTINATION.name,
  previousPreviousLatitude: NESSIE_DESTINATION.latitude,
  previousPreviousLongitude: NESSIE_DESTINATION.longitude,
  previousName: NESSIE_DESTINATION.name,
  previousLatitude: NESSIE_DESTINATION.latitude,
  previousLongitude: NESSIE_DESTINATION.longitude,
  name: NESSIE_DESTINATION.name,
  latitude: NESSIE_DESTINATION.latitude,
  longitude: NESSIE_DESTINATION.longitude,
  height: 350000,
  duration: 5,
  outputWidth: 1920,
  outputHeight: 1080,
  videoUrl: "",
  filename: "",
});

const RECORD_FPS = 30;
const KEYFRAME_INTERVAL_FRAMES = RECORD_FPS;
const MP4_MUXER_MODULE_URL =
  "./vendor/mp4-muxer.mjs?v=5.2.2";
const PRE_ROLL_MS = 500;
const ARRIVAL_HOLD_MS = 2000;
const WORMHOLE_DIVE_MS = 1700;
const WHITEOUT_HOLD_MS = 350;
const PORTAL_TEXTURE_SIZE = 768;
const ROUTE_PRELOAD_SAMPLES_PER_SECOND = 18;
const ROUTE_PRELOAD_MIN_SAMPLES = 72;
const ROUTE_PRELOAD_MAX_SAMPLES = 180;
const ROUTE_PRELOAD_STEP_TIMEOUT_MS = 6000;
const ROUTE_PRELOAD_FINAL_TIMEOUT_MS = 18000;
const ROUTE_TILE_CACHE_SIZE = 3072;
const TILE_QUEUE_START_GRACE_MS = 350;
const TILE_QUEUE_QUIET_MS = 250;
const TRAIL_SAMPLE_COUNT = 96;
const TRAIL_HEIGHT_METERS = 12000;
const MAX_FLIGHT_PEAK_HEIGHT = 6500000;


const elements = {
  app: document.getElementById("app"),
  cesiumContainer: document.getElementById("cesiumContainer"),
  previousPreviousName: document.getElementById(
    "previousPreviousNameInput"
  ),
  previousPreviousLat: document.getElementById(
    "previousPreviousLatInput"
  ),
  previousPreviousLon: document.getElementById(
    "previousPreviousLonInput"
  ),
  previousName: document.getElementById("previousNameInput"),
  previousLat: document.getElementById("previousLatInput"),
  previousLon: document.getElementById("previousLonInput"),
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
  preloadOverlay: document.getElementById("preloadOverlay"),
  preloadText: document.getElementById("preloadText"),
  transitionFlash: document.getElementById("transitionFlash"),
  overlay: document.getElementById("videoOverlay"),
  storyVideo: document.getElementById("storyVideo"),
  videoTitle: document.getElementById("videoTitle"),
  closeVideo: document.getElementById("closeVideoButton"),
};

let viewer;
let destinationMarker;
let historicalTrailEntity;
let currentTrailEntity;
let portalImageEntity;
let portalRingEntityA;
let portalRingEntityB;
let globalImageryLayer;
let detailImageryLayer;
let satelliteReady = false;
let recordingViewportState = null;
let nessieImageReady = false;
let nessieImageElement = null;
let transitionWhiteAlpha = 0;
let mp4MuxerModulePromise = null;
let requestedFileName = "";

function setStatus(message) {
  elements.status.textContent = message;
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function preloadNessieImage() {
  if (nessieImageReady && nessieImageElement) {
    return Promise.resolve(nessieImageElement);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();

    image.addEventListener(
      "load",
      async () => {
        try {
          if (typeof image.decode === "function") {
            await image.decode();
          }
        } catch {
          // The image is already loaded; decoding failure should not block display.
        }

        nessieImageElement = image;
        nessieImageReady = true;
        resolve(image);
      },
      { once: true }
    );

    image.addEventListener(
      "error",
      () => {
        reject(new Error("ネッシー画像を読み込めませんでした"));
      },
      { once: true }
    );

    image.src = NESSIE_IMAGE_URL;
  });
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

function readLocation(
  nameInput,
  latInput,
  lonInput,
  label
) {
  const latitude = readNumber(latInput, label + "の緯度");
  const longitude = readNumber(lonInput, label + "の経度");

  if (latitude < -90 || latitude > 90) {
    throw new Error(label + "の緯度は -90〜90 で指定してください");
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error(label + "の経度は -180〜180 で指定してください");
  }

  return {
    name: nameInput.value.trim() || label,
    latitude,
    longitude,
  };
}

function readStory() {
  const previousPrevious = readLocation(
    elements.previousPreviousName,
    elements.previousPreviousLat,
    elements.previousPreviousLon,
    "前々回"
  );
  const previous = readLocation(
    elements.previousName,
    elements.previousLat,
    elements.previousLon,
    "前回"
  );
  const current = readLocation(
    elements.name,
    elements.lat,
    elements.lon,
    "今回"
  );

  const height = readNumber(elements.height, "到着高度");
  const duration = readNumber(elements.duration, "移動時間");
  const outputWidth = readPositiveInteger(elements.outputWidth, "出力幅");
  const outputHeight = readPositiveInteger(elements.outputHeight, "出力高さ");

  if (outputWidth % 2 !== 0 || outputHeight % 2 !== 0) {
    throw new Error("MP4出力幅・高さは偶数で指定してください");
  }
  if (height < 1000) {
    throw new Error("到着高度は 1000m 以上で指定してください");
  }
  if (duration < 0.5 || duration > 30) {
    throw new Error("移動時間は 0.5〜30秒で指定してください");
  }

  return {
    name: current.name,
    latitude: current.latitude,
    longitude: current.longitude,
    previousPrevious,
    previous,
    current,
    height,
    duration,
    outputWidth,
    outputHeight,
    videoUrl: elements.video.value.trim(),
  };
}

function locationsDiffer(a, b) {
  return (
    Math.abs(a.latitude - b.latitude) > 1e-8 ||
    Math.abs(a.longitude - b.longitude) > 1e-8
  );
}

function createLocationGeodesic(from, to) {
  return new Cesium.EllipsoidGeodesic(
    Cesium.Cartographic.fromDegrees(
      from.longitude,
      from.latitude,
      0
    ),
    Cesium.Cartographic.fromDegrees(
      to.longitude,
      to.latitude,
      0
    ),
    Cesium.Ellipsoid.WGS84
  );
}

function buildTrailPositions(geodesic, progress = 1) {
  const clamped = Cesium.Math.clamp(progress, 0, 1);
  const sampleCount = Math.max(
    2,
    Math.ceil(TRAIL_SAMPLE_COUNT * clamped) + 1
  );
  const positions = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const localProgress =
      sampleCount <= 1 ? 0 : index / (sampleCount - 1);
    const fraction = clamped * localProgress;
    const point = geodesic.interpolateUsingFraction(fraction);

    positions.push(
      Cesium.Cartesian3.fromRadians(
        point.longitude,
        point.latitude,
        TRAIL_HEIGHT_METERS
      )
    );
  }

  return positions;
}

function clearTravelTrails() {
  if (historicalTrailEntity) {
    viewer.entities.remove(historicalTrailEntity);
    historicalTrailEntity = null;
  }
  if (currentTrailEntity) {
    viewer.entities.remove(currentTrailEntity);
    currentTrailEntity = null;
  }
}

function createTrailEntity(positions, isCurrent) {
  return viewer.entities.add({
    polyline: {
      positions,
      width: isCurrent ? 7 : 5,
      arcType: Cesium.ArcType.NONE,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: isCurrent ? 0.28 : 0.16,
        taperPower: isCurrent ? 0.8 : 0.45,
        color: isCurrent
          ? Cesium.Color.fromCssColorString("#baf3ff").withAlpha(0.96)
          : Cesium.Color.fromCssColorString("#77d8ee").withAlpha(0.58),
      }),
    },
  });
}

function showTravelTrails(story, currentProgress = 0) {
  clearTravelTrails();

  if (
    locationsDiffer(
      story.previousPrevious,
      story.previous
    )
  ) {
    const historyGeodesic = createLocationGeodesic(
      story.previousPrevious,
      story.previous
    );
    historicalTrailEntity = createTrailEntity(
      buildTrailPositions(historyGeodesic, 1),
      false
    );
  }

  if (locationsDiffer(story.previous, story.current)) {
    const currentGeodesic = createLocationGeodesic(
      story.previous,
      story.current
    );
    currentTrailEntity = createTrailEntity(
      buildTrailPositions(
        currentGeodesic,
        currentProgress
      ),
      true
    );
  }
}

function updateCurrentTrail(path, progress) {
  if (!currentTrailEntity) {
    return;
  }

  currentTrailEntity.polyline.positions =
    buildTrailPositions(path.geodesic, progress);
}

function setHomeView(animated = true, story = null) {
  if (!viewer) {
    return;
  }

  let activeStory = story;
  if (!activeStory) {
    try {
      activeStory = readStory();
    } catch (error) {
      setStatus(error.message);
      return;
    }
  }

  clearDestinationMarker();
  showTravelTrails(activeStory, 0);

  const view = getLocationCameraView(
    activeStory.previous,
    activeStory.height
  );

  const options = {
    destination: view.destination,
    orientation: {
      direction: view.direction,
      up: view.up,
    },
    duration: animated ? 1.6 : 0,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
  };

  if (animated) {
    viewer.camera.flyTo(options);
  } else {
    viewer.camera.setView(options);
  }

  updateImageryBlend();
  viewer.scene.requestRender();
  setStatus("前回位置: " + activeStory.previous.name);
}

function setTransitionWhiteout(alpha) {
  transitionWhiteAlpha = Cesium.Math.clamp(alpha, 0, 1);

  if (!elements.transitionFlash) {
    return;
  }

  elements.transitionFlash.style.opacity =
    String(transitionWhiteAlpha);
  elements.transitionFlash.classList.toggle(
    "visible",
    transitionWhiteAlpha > 0.001
  );
  elements.transitionFlash.setAttribute(
    "aria-hidden",
    transitionWhiteAlpha > 0.001 ? "false" : "true"
  );
}

function clearDestinationMarker() {
  for (const entity of [
    destinationMarker,
    portalImageEntity,
    portalRingEntityA,
    portalRingEntityB,
  ]) {
    if (entity) {
      viewer.entities.remove(entity);
    }
  }

  destinationMarker = null;
  portalImageEntity = null;
  portalRingEntityA = null;
  portalRingEntityB = null;
}

function getPortalLayout(story) {
  const outputWidth = story.outputWidth;
  const outputHeight = story.outputHeight;
  const shortSide = Math.min(outputWidth, outputHeight);
  const margin = Math.max(24, Math.round(shortSide * 0.045));
  const gap = Math.max(30, Math.round(shortSide * 0.045));

  const maxDiameter = Math.min(
    outputWidth - margin * 2,
    outputHeight - margin * 2
  );
  const diameter = Math.max(
    120,
    Math.min(
      Math.round(shortSide * 0.32),
      Math.round(maxDiameter * 0.46)
    )
  );

  const offsetY = -Math.round(diameter / 2 + gap);
  const finalDiameter = Math.ceil(
    Math.hypot(outputWidth, outputHeight) * 1.48
  );

  return {
    diameter,
    offsetX: 0,
    offsetY,
    finalDiameter,
    labelOffsetY: Math.max(
      58,
      Math.round(shortSide * 0.055)
    ),
  };
}

function drawNessieCover(context, size, radius) {
  if (!nessieImageElement) {
    return;
  }

  const sourceWidth = nessieImageElement.naturalWidth || 1024;
  const sourceHeight = nessieImageElement.naturalHeight || 1536;
  const cropSize = Math.min(sourceWidth, sourceHeight);
  const sourceX = Math.round((sourceWidth - cropSize) / 2);
  const sourceY = 0;
  const center = size / 2;

  context.save();
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.clip();

  context.drawImage(
    nessieImageElement,
    sourceX,
    sourceY,
    cropSize,
    cropSize,
    center - radius,
    center - radius,
    radius * 2,
    radius * 2
  );

  const vignette = context.createRadialGradient(
    center,
    center,
    radius * 0.45,
    center,
    center,
    radius
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(0.78, "rgba(0, 0, 0, 0.02)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.48)");
  context.fillStyle = vignette;
  context.fillRect(
    center - radius,
    center - radius,
    radius * 2,
    radius * 2
  );
  context.restore();
}

function createPortalPhotoTexture() {
  const size = PORTAL_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    return nessieImageElement || NESSIE_IMAGE_URL;
  }

  const center = size / 2;
  const radius = size * 0.355;

  context.clearRect(0, 0, size, size);
  drawNessieCover(context, size, radius);

  context.save();
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.strokeStyle = "rgba(238, 251, 255, 0.96)";
  context.lineWidth = size * 0.012;
  context.shadowColor = "rgba(150, 230, 255, 0.9)";
  context.shadowBlur = size * 0.045;
  context.stroke();
  context.restore();

  return canvas;
}

function createPortalEnergyTexture(variant = 0) {
  const size = PORTAL_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  const center = size / 2;
  const baseRadius = size * (variant === 0 ? 0.405 : 0.435);
  const phaseOffset = variant * 1.73;

  context.clearRect(0, 0, size, size);
  context.save();
  context.translate(center, center);
  context.globalCompositeOperation = "lighter";

  const halo = context.createRadialGradient(
    0,
    0,
    baseRadius * 0.74,
    0,
    0,
    baseRadius * 1.18
  );
  halo.addColorStop(0, "rgba(70, 180, 255, 0)");
  halo.addColorStop(
    0.72,
    variant === 0
      ? "rgba(105, 220, 255, 0.18)"
      : "rgba(210, 245, 255, 0.12)"
  );
  halo.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = halo;
  context.beginPath();
  context.arc(0, 0, baseRadius * 1.2, 0, Math.PI * 2);
  context.fill();

  for (let index = 0; index < 14; index += 1) {
    const start =
      phaseOffset +
      (index / 14) * Math.PI * 2 +
      Math.sin(index * 1.91) * 0.16;
    const span = 0.16 + (index % 4) * 0.055;
    const radius =
      baseRadius +
      Math.sin(index * 2.17 + phaseOffset) * size * 0.018;

    context.beginPath();
    context.arc(0, 0, radius, start, start + span);
    context.lineCap = "round";
    context.lineWidth =
      size * (variant === 0 ? 0.018 : 0.011);
    context.strokeStyle =
      variant === 0
        ? "rgba(120, 225, 255, 0.88)"
        : "rgba(245, 252, 255, 0.82)";
    context.shadowColor =
      variant === 0
        ? "rgba(90, 205, 255, 0.98)"
        : "rgba(220, 250, 255, 0.96)";
    context.shadowBlur = size * (variant === 0 ? 0.04 : 0.028);
    context.stroke();
  }

  const particleCount = variant === 0 ? 48 : 34;
  for (let index = 0; index < particleCount; index += 1) {
    const angle =
      phaseOffset +
      index * 2.399963229728653 +
      Math.sin(index * 0.73) * 0.12;
    const radialBand =
      baseRadius +
      size * (0.035 + (index % 7) * 0.006);
    const length = size * (0.016 + (index % 5) * 0.006);
    const width = size * (0.0022 + (index % 3) * 0.0009);

    const x1 = Math.cos(angle) * radialBand;
    const y1 = Math.sin(angle) * radialBand;
    const x2 = Math.cos(angle) * (radialBand + length);
    const y2 = Math.sin(angle) * (radialBand + length);

    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.lineWidth = width;
    context.lineCap = "round";
    context.strokeStyle =
      variant === 0
        ? "rgba(145, 230, 255, 0.68)"
        : "rgba(255, 255, 255, 0.58)";
    context.stroke();
  }

  context.restore();
  return canvas;
}

function setPortalOpacity(alpha) {
  const clamped = Cesium.Math.clamp(alpha, 0, 1);

  if (destinationMarker) {
    destinationMarker.point.color =
      Cesium.Color.WHITE.withAlpha(clamped);
    destinationMarker.point.outlineColor =
      Cesium.Color.BLACK.withAlpha(clamped);
    destinationMarker.label.fillColor =
      Cesium.Color.WHITE.withAlpha(clamped);
    destinationMarker.label.outlineColor =
      Cesium.Color.BLACK.withAlpha(clamped);
  }
}

function updatePortalAnimation(
  story,
  elapsedMs,
  diveProgress = 0
) {
  if (
    !portalImageEntity ||
    !portalRingEntityA ||
    !portalRingEntityB
  ) {
    return;
  }

  const layout = getPortalLayout(story);
  const progress = Cesium.Math.clamp(diveProgress, 0, 1);
  const eased = 1 - Math.pow(1 - progress, 4);
  const pulse =
    1 +
    Math.sin(elapsedMs * 0.0065) *
      (progress > 0 ? 0.035 : 0.025);

  const diameter =
    layout.diameter +
    (layout.finalDiameter - layout.diameter) * eased;
  const offsetY = Math.round(layout.offsetY * (1 - eased));
  const imageDiameter = diameter * 0.72;

  portalImageEntity.billboard.width = imageDiameter;
  portalImageEntity.billboard.height = imageDiameter;
  portalImageEntity.billboard.pixelOffset =
    new Cesium.Cartesian2(0, offsetY);

  portalRingEntityA.billboard.width = diameter * pulse;
  portalRingEntityA.billboard.height = diameter * pulse;
  portalRingEntityA.billboard.pixelOffset =
    new Cesium.Cartesian2(0, offsetY);
  portalRingEntityA.billboard.rotation =
    elapsedMs * (0.00042 + progress * 0.00092);

  portalRingEntityB.billboard.width =
    diameter * 1.08 * (2 - pulse);
  portalRingEntityB.billboard.height =
    diameter * 1.08 * (2 - pulse);
  portalRingEntityB.billboard.pixelOffset =
    new Cesium.Cartesian2(0, offsetY);
  portalRingEntityB.billboard.rotation =
    -elapsedMs * (0.00031 + progress * 0.00078);

  setPortalOpacity(1 - eased);

  const whiteProgress = Cesium.Math.clamp(
    (progress - 0.58) / 0.42,
    0,
    1
  );
  setTransitionWhiteout(Math.pow(whiteProgress, 1.65));

  viewer.scene.requestRender();
}

function showMarker(story) {
  clearDestinationMarker();
  setTransitionWhiteout(0);

  const layout = getPortalLayout(story);
  const markerScale = Math.max(1, story.outputHeight / 1080);
  const pointSize = Math.round(20 * markerScale);
  const outlineWidth = Math.max(4, Math.round(4 * markerScale));
  const fontSize = Math.round(36 * markerScale);
  const position = Cesium.Cartesian3.fromDegrees(
    story.longitude,
    story.latitude
  );

  destinationMarker = viewer.entities.add({
    position,
    point: {
      pixelSize: pointSize,
      color: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: story.name,
      font: "600 " + fontSize + "px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: Math.max(5, Math.round(5 * markerScale)),
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(
        0,
        layout.labelOffsetY
      ),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  portalImageEntity = viewer.entities.add({
    position,
    billboard: {
      image: createPortalPhotoTexture(),
      width: layout.diameter * 0.72,
      height: layout.diameter * 0.72,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      pixelOffset: new Cesium.Cartesian2(
        layout.offsetX,
        layout.offsetY
      ),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  portalRingEntityA = viewer.entities.add({
    position,
    billboard: {
      image: createPortalEnergyTexture(0),
      width: layout.diameter,
      height: layout.diameter,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      pixelOffset: new Cesium.Cartesian2(
        layout.offsetX,
        layout.offsetY
      ),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  portalRingEntityB = viewer.entities.add({
    position,
    billboard: {
      image: createPortalEnergyTexture(1),
      width: layout.diameter * 1.08,
      height: layout.diameter * 1.08,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      pixelOffset: new Cesium.Cartesian2(
        layout.offsetX,
        layout.offsetY
      ),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  updatePortalAnimation(story, 0, 0);
}

function animatePortalHold(story, durationMs) {
  return new Promise((resolve) => {
    const startedAt = performance.now();

    function frame(now) {
      const elapsed = now - startedAt;
      updatePortalAnimation(story, elapsed, 0);

      if (elapsed >= durationMs) {
        resolve();
        return;
      }

      window.requestAnimationFrame(frame);
    }

    window.requestAnimationFrame(frame);
  });
}

function animatePortalDive(story, durationMs) {
  return new Promise((resolve) => {
    const startedAt = performance.now();

    function frame(now) {
      const elapsed = now - startedAt;
      const progress = Cesium.Math.clamp(
        elapsed / durationMs,
        0,
        1
      );

      updatePortalAnimation(story, elapsed, progress);

      if (progress >= 1) {
        setTransitionWhiteout(1);
        resolve();
        return;
      }

      window.requestAnimationFrame(frame);
    }

    window.requestAnimationFrame(frame);
  });
}

async function fadeTransitionWhiteout(
  targetAlpha,
  durationMs = 650
) {
  const startAlpha = transitionWhiteAlpha;
  const startedAt = performance.now();

  return new Promise((resolve) => {
    function frame(now) {
      const progress = Cesium.Math.clamp(
        (now - startedAt) / Math.max(1, durationMs),
        0,
        1
      );
      const eased = 1 - Math.pow(1 - progress, 3);
      setTransitionWhiteout(
        startAlpha + (targetAlpha - startAlpha) * eased
      );

      if (progress >= 1) {
        resolve();
        return;
      }

      window.requestAnimationFrame(frame);
    }

    window.requestAnimationFrame(frame);
  });
}

async function openVideo(story) {
  if (!story.videoUrl) {
    clearDestinationMarker();
    setHomeView(false);
    await fadeTransitionWhiteout(0, 650);
    return;
  }

  elements.videoTitle.textContent = story.name;
  elements.storyVideo.src = story.videoUrl;
  elements.overlay.classList.add("visible");
  elements.overlay.setAttribute("aria-hidden", "false");
  elements.storyVideo.load();

  await Promise.race([
    new Promise((resolve) => {
      elements.storyVideo.addEventListener(
        "canplay",
        resolve,
        { once: true }
      );
    }),
    wait(2500),
  ]);

  try {
    await elements.storyVideo.play();
  } catch {
    setStatus("動画を表示しました。再生ボタンを押してください");
  }

  await fadeTransitionWhiteout(0, 800);
}

function closeVideo() {
  elements.storyVideo.pause();
  elements.storyVideo.removeAttribute("src");
  elements.storyVideo.load();
  elements.overlay.classList.remove("visible");
  elements.overlay.setAttribute("aria-hidden", "true");
  clearDestinationMarker();
  setTransitionWhiteout(0);
}

function getLocationCameraView(location, height) {
  const target = Cesium.Cartesian3.fromDegrees(
    location.longitude,
    location.latitude,
    0
  );
  const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    target,
    new Cesium.Cartesian3()
  );
  const offset = Cesium.Cartesian3.multiplyByScalar(
    normal,
    height,
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

function getNadirCameraView(story) {
  return getLocationCameraView(
    story.current,
    story.height
  );
}

function createFlightPath(story) {
  const geodesic = createLocationGeodesic(
    story.previous,
    story.current
  );
  const baseHeight = story.height;
  const peakHeight = Math.min(
    MAX_FLIGHT_PEAK_HEIGHT,
    Math.max(
      baseHeight,
      baseHeight + geodesic.surfaceDistance * 0.28
    )
  );

  return {
    geodesic,
    baseHeight,
    peakHeight,
  };
}

function setCameraFlightProgress(path, progress) {
  const clamped = Cesium.Math.clamp(progress, 0, 1);
  const eased = Cesium.EasingFunction.CUBIC_IN_OUT(clamped);
  const surface = path.geodesic.interpolateUsingFraction(eased);
  const arc = Math.pow(
    Math.sin(Math.PI * eased),
    0.82
  );
  const height =
    path.baseHeight +
    (path.peakHeight - path.baseHeight) * arc;

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromRadians(
      surface.longitude,
      surface.latitude,
      height
    ),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
  });

  updateImageryBlend();
  viewer.scene.requestRender();
  return eased;
}

function flyToStory(
  story,
  {
    duration = story.duration,
    showMarkerAtEnd = true,
  } = {}
) {
  const path = createFlightPath(story);
  const durationMs = Math.max(1, duration * 1000);

  showTravelTrails(story, 0);

  return new Promise((resolve) => {
    const startedAt = performance.now();

    function frame(now) {
      const progress = Cesium.Math.clamp(
        (now - startedAt) / durationMs,
        0,
        1
      );

      const eased = setCameraFlightProgress(
        path,
        progress
      );
      updateCurrentTrail(path, eased);

      if (progress < 1) {
        window.requestAnimationFrame(frame);
        return;
      }

      const view = getNadirCameraView(story);
      viewer.camera.setView({
        destination: view.destination,
        orientation: {
          direction: view.direction,
          up: view.up,
        },
      });
      updateCurrentTrail(path, 1);

      if (showMarkerAtEnd) {
        showMarker(story);
      } else {
        clearDestinationMarker();
      }

      updateImageryBlend();
      viewer.scene.requestRender();
      resolve();
    }

    window.requestAnimationFrame(frame);
  });
}

function loadMp4MuxerModule() {
  if (!mp4MuxerModulePromise) {
    mp4MuxerModulePromise = import(MP4_MUXER_MODULE_URL);
  }

  return mp4MuxerModulePromise;
}

function getTargetVideoBitrate(story) {
  const bitsPerSecond =
    story.outputWidth *
    story.outputHeight *
    RECORD_FPS *
    0.16;

  return Math.round(
    Cesium.Math.clamp(
      bitsPerSecond,
      6000000,
      80000000
    )
  );
}

async function getVideoEncoderConfig(story) {
  if (
    typeof window.VideoEncoder === "undefined" ||
    typeof window.VideoFrame === "undefined"
  ) {
    return null;
  }

  const bitrate = getTargetVideoBitrate(story);
  const pixels = story.outputWidth * story.outputHeight;
  const codecs =
    pixels > 1920 * 1080
      ? [
          "avc1.640033",
          "avc1.4d0033",
          "avc1.420033",
        ]
      : [
          "avc1.64002a",
          "avc1.4d002a",
          "avc1.42002a",
          "avc1.42001f",
        ];

  const accelerationPreferences = [
    "prefer-hardware",
    "prefer-software",
  ];

  for (const codec of codecs) {
    for (
      const hardwareAcceleration
      of accelerationPreferences
    ) {
      const config = {
        codec,
        width: story.outputWidth,
        height: story.outputHeight,
        bitrate,
        framerate: RECORD_FPS,
        latencyMode: "quality",
        hardwareAcceleration,
        avc: {
          format: "avc",
        },
      };

      try {
        const support =
          await VideoEncoder.isConfigSupported(config);

        if (support.supported) {
          return support.config;
        }
      } catch {
        // Try the next acceleration mode/profile.
      }
    }
  }

  return null;
}

function applyRecordingViewport(outputWidth, outputHeight) {
  const displayScale = Math.min(
    window.innerWidth / outputWidth,
    window.innerHeight / outputHeight,
    1
  );

  recordingViewportState = {
    resolutionScale: viewer.resolutionScale,
  };

  viewer.resolutionScale = 1.0;

  Object.assign(elements.cesiumContainer.style, {
    inset: "auto",
    left: "50%",
    top: "50%",
    width: outputWidth + "px",
    height: outputHeight + "px",
    transform:
      "translate(-50%, -50%) scale(" + displayScale + ")",
    transformOrigin: "center center",
  });

  viewer.resize();
  viewer.scene.requestRender();
}

function assertRecordingCanvasSize(outputWidth, outputHeight) {
  if (
    viewer.canvas.width !== outputWidth ||
    viewer.canvas.height !== outputHeight
  ) {
    throw new Error(
      "Cesiumの実描画解像度が指定値と一致しません: " +
        viewer.canvas.width +
        "×" +
        viewer.canvas.height
    );
  }
}

function restoreViewerViewport() {
  elements.cesiumContainer.removeAttribute("style");

  if (recordingViewportState) {
    viewer.resolutionScale = recordingViewportState.resolutionScale;
    recordingViewportState = null;
  }

  viewer.resize();
  viewer.scene.requestRender();
}

function waitForCurrentViewTiles(timeoutMs) {
  return new Promise((resolve) => {
    const globe = viewer.scene.globe;
    const startedAt = performance.now();
    let sawLoading = false;
    let quietSince = null;
    let lastQueueLength = globe.tilesLoaded ? 0 : 1;

    const removeProgressListener =
      globe.tileLoadProgressEvent.addEventListener((queueLength) => {
        lastQueueLength = queueLength;

        if (queueLength > 0) {
          sawLoading = true;
          quietSince = null;
        } else if (sawLoading) {
          quietSince = performance.now();
        }
      });

    function finish(timedOut = false) {
      removeProgressListener();
      resolve({
        timedOut,
        sawLoading,
        lastQueueLength,
      });
    }

    function check() {
      viewer.scene.requestRender();
      viewer.scene.render();

      const now = performance.now();
      const elapsed = now - startedAt;

      if (!globe.tilesLoaded) {
        sawLoading = true;
        quietSince = null;
      } else if (
        quietSince === null &&
        (sawLoading || elapsed >= TILE_QUEUE_START_GRACE_MS)
      ) {
        quietSince = now;
      }

      if (
        quietSince !== null &&
        now - quietSince >= TILE_QUEUE_QUIET_MS
      ) {
        finish(false);
        return;
      }

      if (elapsed >= timeoutMs) {
        finish(true);
        return;
      }

      window.requestAnimationFrame(check);
    }

    window.requestAnimationFrame(check);
  });
}

function preloadSampleView(path, progress) {
  setCameraFlightProgress(path, progress);
}

function setPreloadOverlay(visible, text = "経路を事前読み込み中") {
  elements.preloadText.textContent = text;
  elements.preloadOverlay.classList.toggle("visible", visible);
  elements.preloadOverlay.setAttribute(
    "aria-hidden",
    visible ? "false" : "true"
  );
}

async function preloadFlightPath(story) {
  clearDestinationMarker();
  setPreloadOverlay(true);
  setStatus("経路を事前読み込み中");

  const globe = viewer.scene.globe;
  const previousCacheSize = globe.tileCacheSize;
  const previousPreloadSiblings = globe.preloadSiblings;
  const path = createFlightPath(story);
  const sampleCount = Math.min(
    ROUTE_PRELOAD_MAX_SAMPLES,
    Math.max(
      ROUTE_PRELOAD_MIN_SAMPLES,
      Math.ceil(
        story.duration * ROUTE_PRELOAD_SAMPLES_PER_SECOND
      )
    )
  );

  globe.tileCacheSize = Math.max(
    previousCacheSize,
    ROUTE_TILE_CACHE_SIZE
  );
  globe.preloadSiblings = false;

  try {
    for (let index = 0; index < sampleCount; index += 1) {
      const progress = index / (sampleCount - 1);
      const percent = Math.round(progress * 100);

      setPreloadOverlay(
        true,
        "経路を事前読み込み中 " + percent + "%"
      );
      preloadSampleView(path, progress);

      await waitForAnimationFrames(2);
      await waitForCurrentViewTiles(
        ROUTE_PRELOAD_STEP_TIMEOUT_MS
      );
    }

    const finalView = getNadirCameraView(story);
    viewer.camera.setView({
      destination: finalView.destination,
      orientation: {
        direction: finalView.direction,
        up: finalView.up,
      },
    });
    updateImageryBlend();

    setPreloadOverlay(true, "到着地点を読み込み中");
    await waitForAnimationFrames(3);
    await waitForCurrentViewTiles(
      ROUTE_PRELOAD_FINAL_TIMEOUT_MS
    );

    setHomeView(false);
    updateImageryBlend();
    await waitForAnimationFrames(4);
  } finally {
    globe.tileCacheSize = Math.max(
      previousCacheSize,
      ROUTE_TILE_CACHE_SIZE
    );
    globe.preloadSiblings = false;
    setPreloadOverlay(false);
  }
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

async function recordFlightAsMp4(
  story,
  encoderConfig
) {
  const { Muxer, ArrayBufferTarget } =
    await loadMp4MuxerModule();

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = story.outputWidth;
  outputCanvas.height = story.outputHeight;

  const context = outputCanvas.getContext("2d", {
    alpha: false,
    desynchronized: true,
  });
  if (!context) {
    throw new Error("録画用Canvasを作成できませんでした");
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width: story.outputWidth,
      height: story.outputHeight,
      frameRate: RECORD_FPS,
    },
    fastStart: "in-memory",
  });

  let encoderError = null;
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      muxer.addVideoChunk(chunk, metadata);
    },
    error: (error) => {
      encoderError = error;
    },
  });
  encoder.configure(encoderConfig);

  const frameDurationUs = 1000000 / RECORD_FPS;
  let animationFrameId = null;
  let drawing = true;
  let captureStartedAt = null;
  let framesGenerated = 0;

  function drawComposite() {
    context.fillStyle = "#000";
    context.fillRect(
      0,
      0,
      outputCanvas.width,
      outputCanvas.height
    );

    viewer.scene.render();
    context.drawImage(
      viewer.canvas,
      0,
      0,
      outputCanvas.width,
      outputCanvas.height
    );
    drawAttribution(context, outputCanvas);

    if (transitionWhiteAlpha > 0) {
      context.fillStyle =
        "rgba(255, 255, 255, " +
        transitionWhiteAlpha +
        ")";
      context.fillRect(
        0,
        0,
        outputCanvas.width,
        outputCanvas.height
      );
    }
  }

  function encodeFrame(frameIndex) {
    const timestamp = Math.round(
      frameIndex * frameDurationUs
    );
    const nextTimestamp = Math.round(
      (frameIndex + 1) * frameDurationUs
    );
    const frame = new VideoFrame(outputCanvas, {
      timestamp,
      duration: nextTimestamp - timestamp,
    });

    encoder.encode(frame, {
      keyFrame:
        frameIndex % KEYFRAME_INTERVAL_FRAMES === 0,
    });
    frame.close();
  }

  function captureDueFrames(now) {
    if (captureStartedAt === null) {
      captureStartedAt = now;
    }

    drawComposite();

    const elapsedMs = Math.max(
      0,
      now - captureStartedAt
    );
    const targetFrameCount =
      Math.floor(
        (elapsedMs * RECORD_FPS) / 1000
      ) + 1;

    while (framesGenerated < targetFrameCount) {
      encodeFrame(framesGenerated);
      framesGenerated += 1;
    }
  }

  function captureLoop(now) {
    if (!drawing) {
      return;
    }

    captureDueFrames(now);
    animationFrameId =
      window.requestAnimationFrame(captureLoop);
  }

  animationFrameId =
    window.requestAnimationFrame(captureLoop);

  try {
    await wait(PRE_ROLL_MS);
    await flyToStory(story);
    await animatePortalHold(story, ARRIVAL_HOLD_MS);
    await animatePortalDive(story, WORMHOLE_DIVE_MS);
    await wait(WHITEOUT_HOLD_MS);

    captureDueFrames(performance.now());
    drawing = false;

    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    await encoder.flush();

    if (encoderError) {
      throw encoderError;
    }

    muxer.finalize();

    return new Blob(
      [target.buffer],
      { type: "video/mp4" }
    );
  } finally {
    drawing = false;

    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId);
    }

    if (encoder.state !== "closed") {
      try {
        encoder.close();
      } catch {
        // Encoder may already be closed after an error.
      }
    }
  }
}

async function runStory() {
  let story;
  try {
    saveSettingsCookie();
    story = readStory();
  } catch (error) {
    setStatus(error.message);
    return;
  }

  if (!satelliteReady) {
    setStatus("衛星写真の読み込みが完了していません");
    return;
  }

  const encoderConfig =
    await getVideoEncoderConfig(story);
  if (!encoderConfig) {
    setStatus(
      "このブラウザはH.264 WebCodecs録画に対応していません"
    );
    return;
  }

  elements.play.disabled = true;
  closeVideo();
  setTransitionWhiteout(0);
  elements.app.classList.add("recording");

  try {
    applyRecordingViewport(story.outputWidth, story.outputHeight);
    await waitForAnimationFrames(3);
    assertRecordingCanvasSize(story.outputWidth, story.outputHeight);

    await preloadNessieImage();
    await preloadFlightPath(story);

    setStatus("録画中");
    await waitForAnimationFrames(3);
    await wait(350);

    const mp4 = await recordFlightAsMp4(
      story,
      encoderConfig
    );
    const requestedBaseName = requestedFileName
      .replace(/\.mp4$/i, "")
      .trim();
    const fileName =
      sanitizeFileName(
        requestedBaseName || story.name
      ) + ".mp4";
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

function getFormSettings() {
  return {
    name: elements.name.value.trim(),
    latitude: elements.lat.value,
    longitude: elements.lon.value,
    height: elements.height.value,
    duration: elements.duration.value,
    outputWidth: elements.outputWidth.value,
    outputHeight: elements.outputHeight.value,
    videoUrl: elements.video.value.trim(),
    filename: requestedFileName,
  };
}

function applyFormSettings(settings) {
  if (!settings || typeof settings !== "object") {
    return;
  }

  const mappings = [
    ["name", elements.name],
    ["latitude", elements.lat],
    ["longitude", elements.lon],
    ["height", elements.height],
    ["duration", elements.duration],
    ["outputWidth", elements.outputWidth],
    ["outputHeight", elements.outputHeight],
    ["videoUrl", elements.video],
  ];

  for (const [key, input] of mappings) {
    const value = settings[key];
    if (value !== undefined && value !== null) {
      input.value = String(value);
    }
  }

  if (
    settings.filename !== undefined &&
    settings.filename !== null
  ) {
    requestedFileName = String(settings.filename);
  }
}

function readSettingsCookie() {
  const prefix = SETTINGS_COOKIE_NAME + "=";
  const cookie = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));

  if (!cookie) {
    return null;
  }

  try {
    return JSON.parse(
      decodeURIComponent(cookie.slice(prefix.length))
    );
  } catch {
    return null;
  }
}

function saveSettingsCookie() {
  const encoded = encodeURIComponent(
    JSON.stringify(getFormSettings())
  );

  document.cookie =
    SETTINGS_COOKIE_NAME +
    "=" +
    encoded +
    "; Max-Age=" +
    SETTINGS_COOKIE_MAX_AGE +
    "; Path=/; SameSite=Lax";
}

function restoreInitialSettings() {
  applyFormSettings(DEFAULT_FORM_SETTINGS);

  const stored = readSettingsCookie();
  if (stored) {
    applyFormSettings(stored);
  }
}

function isEnabledParameter(params, key) {
  if (!params.has(key)) {
    return false;
  }

  const value = (params.get(key) || "").trim().toLowerCase();
  return (
    value === "" ||
    value === "1" ||
    value === "true" ||
    value === "yes" ||
    value === "on"
  );
}

function applyQueryParameters() {
  const params = new URLSearchParams(window.location.search);

  const mappings = [
    ["name", elements.name],
    ["lat", elements.lat],
    ["latitude", elements.lat],
    ["lon", elements.lon],
    ["lng", elements.lon],
    ["longitude", elements.lon],
    ["height", elements.height],
    ["duration", elements.duration],
    ["width", elements.outputWidth],
    ["w", elements.outputWidth],
    ["heightPx", elements.outputHeight],
    ["h", elements.outputHeight],
    ["video", elements.video],
    ["next", elements.video],
  ];

  for (const [key, input] of mappings) {
    if (params.has(key)) {
      input.value = params.get(key);
    }
  }

  if (params.has("filename")) {
    requestedFileName =
      params.get("filename")?.trim() || "";
  }

  const autoStart =
    isEnabledParameter(params, "auto") ||
    isEnabledParameter(params, "autoplay") ||
    isEnabledParameter(params, "download") ||
    isEnabledParameter(params, "run");

  return {
    autoStart,
    hasParameters: Array.from(params.keys()).length > 0,
  };
}

function installSettingsPersistence() {
  const inputs = [
    elements.name,
    elements.lat,
    elements.lon,
    elements.height,
    elements.duration,
    elements.outputWidth,
    elements.outputHeight,
    elements.video,
  ];

  for (const input of inputs) {
    input.addEventListener("input", saveSettingsCookie);
    input.addEventListener("change", saveSettingsCookie);
  }

  window.addEventListener("beforeunload", saveSettingsCookie);
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
    globalImageryLayer.brightness = 1.0;
    globalImageryLayer.contrast = 1.0;
    globalImageryLayer.saturation = 1.0;
    globalImageryLayer.gamma = 1.0;
  } catch (error) {
    console.warn("Blue Marble load failed:", error);
  }

  const detailProvider =
    await Cesium.ArcGisMapServerImageryProvider.fromUrl(
      SATELLITE_SERVICE_URL
    );

  detailImageryLayer =
    viewer.imageryLayers.addImageryProvider(detailProvider);
  detailImageryLayer.brightness = 1.0;
  detailImageryLayer.contrast = 1.0;
  detailImageryLayer.saturation = 1.0;
  detailImageryLayer.gamma = 1.0;

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

  restoreInitialSettings();
  const launchOptions = applyQueryParameters();
  saveSettingsCookie();
  installSettingsPersistence();

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
    useBrowserRecommendedResolution: true,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    contextOptions: {
      webgl: {
        preserveDrawingBuffer: true,
      },
    },
  });

  viewer.scene.highDynamicRange = true;
  viewer.scene.gamma = 2.2;
  viewer.scene.backgroundColor = Cesium.Color.BLACK;
  viewer.scene.postProcessStages.tonemapper = Cesium.Tonemapper.PBR_NEUTRAL;
  viewer.scene.postProcessStages.exposure = 1.0;

  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.showGroundAtmosphere = false;
  viewer.scene.globe.maximumScreenSpaceError = 1.0;
  viewer.scene.globe.tileCacheSize = ROUTE_TILE_CACHE_SIZE;
  viewer.scene.globe.preloadAncestors = true;
  viewer.scene.globe.preloadSiblings = false;
  viewer.scene.fog.enabled = false;

  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.skyAtmosphere.hueShift = 0.0;
  viewer.scene.skyAtmosphere.saturationShift = 0.0;
  viewer.scene.skyAtmosphere.brightnessShift = 0.0;

  if (viewer.scene.skyBox) {
    viewer.scene.skyBox.show = false;
  }
  if (viewer.scene.sun) {
    viewer.scene.sun.show = false;
  }
  if (viewer.scene.moon) {
    viewer.scene.moon.show = false;
  }

  if (viewer.scene.postProcessStages.fxaa) {
    viewer.scene.postProcessStages.fxaa.enabled = true;
  }

  setHomeView(false);

  try {
    await addSatelliteImagery();
  } catch (error) {
    console.error("Satellite imagery load failed:", error);
    setStatus("衛星写真の読み込みに失敗しました");
  }

  await preloadNessieImage();

  elements.play.addEventListener("click", runStory);
  elements.home.addEventListener("click", () => {
    closeVideo();
    setHomeView(true);
  });
  elements.closeVideo.addEventListener("click", closeVideo);

  if (launchOptions.autoStart) {
    window.setTimeout(runStory, 500);
  }
}

initialize().catch((error) => {
  console.error(error);
  setStatus("初期化に失敗しました");
});
