const BLUE_MARBLE_URL =
  "https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_8192.png";

const elements = {
  name: document.getElementById("nameInput"),
  lat: document.getElementById("latInput"),
  lon: document.getElementById("lonInput"),
  height: document.getElementById("heightInput"),
  duration: document.getElementById("durationInput"),
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

function setStatus(message) {
  elements.status.textContent = message;
}

function readNumber(input, label) {
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    throw new Error(label + "が正しくありません");
  }
  return value;
}

function readStory() {
  const latitude = readNumber(elements.lat, "緯度");
  const longitude = readNumber(elements.lon, "経度");
  const height = readNumber(elements.height, "到着高度");
  const duration = readNumber(elements.duration, "移動時間");

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
    setStatus("到着しました。動画URLを指定すると、そのまま動画へ遷移します");
    return;
  }

  elements.videoTitle.textContent = story.name;
  elements.storyVideo.src = story.videoUrl;
  elements.overlay.classList.add("visible");
  elements.overlay.setAttribute("aria-hidden", "false");
  setStatus("動画へ遷移");

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
  setStatus("地球表示");
}

function flyToStory(story) {
  return new Promise((resolve) => {
    showMarker(story);
    setStatus(story.name + " へ移動中…");

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        story.longitude,
        story.latitude,
        story.height
      ),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-72),
        roll: 0,
      },
      duration: story.duration,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      complete: resolve,
      cancel: resolve,
    });
  });
}

async function runStory() {
  let story;
  try {
    story = readStory();
  } catch (error) {
    setStatus(error.message);
    return;
  }

  elements.play.disabled = true;

  try {
    await flyToStory(story);
    setStatus(story.name + " に到着");
    await new Promise((resolve) => setTimeout(resolve, 350));
    await openVideo(story);
  } finally {
    elements.play.disabled = false;
  }
}

function applyQueryParameters() {
  const params = new URLSearchParams(window.location.search);

  const mappings = [
    ["name", elements.name],
    ["lat", elements.lat],
    ["lon", elements.lon],
    ["height", elements.height],
    ["duration", elements.duration],
    ["video", elements.video],
  ];

  for (const [key, input] of mappings) {
    if (params.has(key)) {
      input.value = params.get(key);
    }
  }

  return params.get("autoplay") === "1";
}

async function addEarthTexture() {
  try {
    const provider = Cesium.SingleTileImageryProvider.fromUrl
      ? await Cesium.SingleTileImageryProvider.fromUrl(BLUE_MARBLE_URL)
      : new Cesium.SingleTileImageryProvider({ url: BLUE_MARBLE_URL });

    viewer.imageryLayers.addImageryProvider(provider);
    setStatus("NASA Blue Marble を読み込みました");
  } catch (error) {
    console.error("Blue Marble load failed:", error);

    viewer.imageryLayers.addImageryProvider(
      new Cesium.OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/",
      })
    );
    setStatus("地球テクスチャの読込に失敗したため地図表示へ切替");
  }
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
  });

  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.skyAtmosphere.show = true;

  setHomeView(false);
  await addEarthTexture();

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
