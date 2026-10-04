import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const appPath = new URL("../app.js", import.meta.url);
const appSource = fs.readFileSync(appPath, "utf8");
const sampleStart = appSource.indexOf("function sampleEarthIntroPath");
const sampleEnd = appSource.indexOf("\nfunction createFlightPath", sampleStart);
assert.ok(sampleStart >= 0 && sampleEnd > sampleStart, "camera sampler must exist");

const context = {
  Cesium: {
    Math: {
      clamp(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
      },
      toDegrees(value) {
        return value * 180 / Math.PI;
      },
    },
    EasingFunction: {
      CUBIC_IN_OUT(value) {
        return value < 0.5
          ? 4 * value * value * value
          : 1 - Math.pow(-2 * value + 2, 3) / 2;
      },
    },
  },
  offsetEarthLocation(location, northMeters, eastMeters) {
    return {
      name: location.name,
      latitude: location.latitude + northMeters / 100000,
      longitude: location.longitude + eastMeters / 100000,
    };
  },
};
vm.runInNewContext(
  `${appSource.slice(sampleStart, sampleEnd)}\nglobalThis.sampleEarthIntroPath = sampleEarthIntroPath;`,
  context,
);

const phases = [
  ["close_start_hold", 0, 1.2],
  ["modest_ascent", 1.2, 2.8],
  ["wider_panel_reveal", 2.8, 4.9],
  ["continuous_focus_flight", 4.9, 10.9],
  ["focus_panel_settle", 10.9, 13.9],
  ["full_360_orbit", 13.9, 25.9],
  ["through_panel_dive", 25.9, 27.8],
  ["storymovie_fade", 27.8, 28.6],
].map(([name, start_seconds, end_seconds]) => ({
  name,
  start_seconds,
  end_seconds,
}));

function makePath() {
  return {
    durationSeconds: 28.6,
    origin: { name: "origin", latitude: 35, longitude: 139 },
    destination: { name: "destination", latitude: 57, longitude: -4 },
    contract: { phases },
    baseHeight: 350000,
    peakHeight: 1400000,
    riseStartHeight: 700,
    riseHeight: 1200,
    settleEntryHeight: 21000,
    orbitHeight: 700,
    orbitRadius: 500,
    diveStartHeight: 700,
    diveEndHeight: 120,
    geodesic: {
      interpolateUsingFraction(fraction) {
        return {
          latitude: 35 * Math.PI / 180 +
            fraction * (57 - 35) * Math.PI / 180,
          longitude: 139 * Math.PI / 180 +
            fraction * (-4 - 139) * Math.PI / 180,
        };
      },
    },
  };
}

function at(seconds) {
  return context.sampleEarthIntroPath(makePath(), seconds / 28.6);
}

test("travel starts at the declared travel phase and reveal joins continuously", () => {
  const before = at(4.9 - 1e-4);
  const start = at(4.9);
  assert.equal(start.phase, "travel");
  assert.ok(Math.abs(start.location.latitude - before.location.latitude) < 1e-5);
  assert.ok(Math.abs(start.location.longitude - before.location.longitude) < 1e-5);
  assert.ok(Math.abs(start.height - before.height) < 100);
});

test("settle joins orbit in position and height while descending", () => {
  const settleStart = at(10.9);
  const settleMiddle = at(12.4);
  const settleEnd = at(13.9 - 1e-4);
  const orbitStart = at(13.9 + 1e-4);
  assert.equal(settleStart.phase, "orbit_transition");
  assert.equal(settleEnd.phase, "orbit_transition");
  assert.equal(orbitStart.phase, "orbit");
  assert.ok(settleStart.height > settleMiddle.height);
  assert.ok(settleMiddle.height > settleEnd.height);
  assert.ok(Math.abs(settleEnd.height - orbitStart.height) < 1);
  assert.ok(Math.abs(settleEnd.location.latitude - orbitStart.location.latitude) < 1e-5);
  assert.ok(Math.abs(settleEnd.location.longitude - orbitStart.location.longitude) < 1e-5);
});

test("orbit keeps one full turn over the declared orbit duration", () => {
  const start = at(13.9 + 1e-4);
  const quarter = at(13.9 + 3.0);
  const end = at(25.9 - 1e-4);
  const bearing = (sample) =>
    Math.atan2(
      sample.location.longitude - makePath().destination.longitude,
      sample.location.latitude - makePath().destination.latitude,
    );
  const quarterTurn = (bearing(quarter) - bearing(start) + Math.PI * 2) % (Math.PI * 2);
  const fullTurn = (bearing(end) - bearing(start) + Math.PI * 2) % (Math.PI * 2);
  assert.ok(Math.abs(quarterTurn - Math.PI / 2) < 0.01);
  assert.ok(fullTurn > Math.PI * 1.99);
});

test("camera selection uses the target-look view during orbit transition", () => {
  const cameraStart = appSource.indexOf("function setCameraFlightProgress");
  const cameraEnd = appSource.indexOf("\nfunction flyToStory", cameraStart);
  const cameraSource = appSource.slice(cameraStart, cameraEnd);
  assert.match(cameraSource, /sample\.phase === "orbit_transition"/);
  assert.match(cameraSource, /getEarthIntroTargetLookView\(path, sample\)/);
});
