import { test } from "node:test";
import assert from "node:assert/strict";
import { solveStack } from "../src/features/thinfilm/lib/tmm";
import { makeLayer } from "../src/features/thinfilm/lib/presets";
import { runScanAsync } from "../src/features/thinfilm/lib/scan";
import { stackFingerprint } from "../src/features/thinfilm/lib/presets";
import { trace } from "../src/features/optics/lib/trace";
import type { LabDocument, Element, FilmLayer } from "../src/shared/document";

const air = "builtin:air";
const bk7 = "builtin:bk7";
const base = {
  polarization: "s" as const,
  incidentMaterial: air,
  substrateMaterial: bk7,
};

test("裸基底正入射符合 Fresnel 反射率", () => {
  const r = solveStack({ ...base, layers: [], wavelengthNm: 550, angleDeg: 0 });
  // n_BK7(550)≈1.5185 → R=((1-n)/(1+n))²≈0.0424
  assert.ok(Math.abs(r.r - 0.0424) < 0.001);
  assert.ok(Math.abs(r.r + r.t - 1) < 1e-9);
  assert.equal(r.absorbed, 0);
});

test("单层 λ/4 MgF2 增透膜反射率低于裸面", () => {
  const bare = solveStack({ ...base, layers: [], wavelengthNm: 550, angleDeg: 0 });
  const ar = solveStack({
    ...base,
    layers: [makeLayer("builtin:mgf2", 100)],
    wavelengthNm: 550,
    angleDeg: 0,
  });
  assert.ok(ar.r < bare.r);
  assert.ok(ar.r < 0.02);
  assert.ok(Math.abs(ar.r + ar.t + ar.absorbed - 1) < 1e-9);
});

test("布拉格膜堆高反射且无损介质零吸收", () => {
  const layers: FilmLayer[] = [];
  for (let i = 0; i < 6; i++) {
    layers.push(makeLayer("builtin:tio2", 61));
    layers.push(makeLayer("builtin:sio2", 95));
  }
  const r = solveStack({ ...base, layers, wavelengthNm: 550, angleDeg: 0 });
  assert.ok(r.r > 0.95);
  assert.equal(r.absorbed, 0);
  assert.ok(r.layerAbsorption.every((v) => v === 0));
});

test("金属膜的吸收满足能量守恒并给出层吸收", () => {
  const r = solveStack({
    ...base,
    layers: [makeLayer("builtin:aluminum", 100)],
    wavelengthNm: 550,
    angleDeg: 0,
  });
  assert.ok(r.absorbed > 0.1);
  assert.ok(Math.abs(r.r + r.t + r.absorbed - 1) < 1e-9);
  assert.ok(Math.abs(r.layerAbsorption[0] - r.absorbed) < 1e-9);
});

test("超过临界角发生全反射，能量全部反射", () => {
  const r = solveStack({
    polarization: "s",
    incidentMaterial: bk7,
    substrateMaterial: air,
    layers: [],
    wavelengthNm: 550,
    angleDeg: 45,
  });
  assert.equal(r.tir, true);
  assert.equal(r.r, 1);
  assert.equal(r.t, 0);
});

test("临界角以下不判全反射且 p 偏振 Brewster 角反射趋零", () => {
  const below = solveStack({
    polarization: "s",
    incidentMaterial: air,
    substrateMaterial: bk7,
    layers: [],
    wavelengthNm: 550,
    angleDeg: 30,
  });
  assert.equal(below.tir, false);
  const brewster = solveStack({
    polarization: "p",
    incidentMaterial: air,
    substrateMaterial: bk7,
    layers: [],
    wavelengthNm: 550,
    angleDeg: 56.6,
  });
  assert.ok(brewster.r < 1e-4);
});

test("极端厚度（100000 nm 金膜）结果有限且无源", () => {
  const r = solveStack({
    ...base,
    layers: [makeLayer("builtin:gold", 100000)],
    wavelengthNm: 550,
    angleDeg: 0,
  });
  for (const v of [r.r, r.t, r.absorbed, ...r.layerAbsorption]) {
    assert.ok(Number.isFinite(v));
    assert.ok(v >= 0 && v <= 1);
  }
  assert.ok(Math.abs(r.r + r.t + r.absorbed - 1) < 1e-9);
});

test("上百层膜堆数值稳定且能量守恒", () => {
  const layers: FilmLayer[] = [];
  for (let i = 0; i < 50; i++) {
    layers.push(makeLayer("builtin:tio2", 61));
    layers.push(makeLayer("builtin:sio2", 95));
  }
  const r = solveStack({ ...base, layers, wavelengthNm: 550, angleDeg: 20 });
  assert.ok(Number.isFinite(r.r));
  assert.ok(r.r <= 1 && r.t >= 0);
  assert.ok(Math.abs(r.r + r.t + r.absorbed - 1) < 1e-9);
});

test("非偏振光等于 s/p 功率平均", () => {
  const layers = [makeLayer("builtin:gold", 50)];
  const s = solveStack({ ...base, polarization: "s", layers, wavelengthNm: 550, angleDeg: 30 });
  const p = solveStack({ ...base, polarization: "p", layers, wavelengthNm: 550, angleDeg: 30 });
  const u = solveStack({ ...base, polarization: "unpolarized", layers, wavelengthNm: 550, angleDeg: 30 });
  assert.ok(Math.abs(u.r - (s.r + p.r) / 2) < 1e-12);
  assert.ok(Math.abs(u.t - (s.t + p.t) / 2) < 1e-12);
});

test("扫描产生完整点数且每点守恒", async () => {
  const layers = [makeLayer("builtin:mgf2", 100)];
  const snapshot = {
    layers,
    incidentMaterial: air,
    substrateMaterial: bk7,
    fingerprint: stackFingerprint(layers, air, bk7),
  };
  const report = await runScanAsync(
    {
      xAxis: "wavelength",
      xStart: 400,
      xEnd: 700,
      xSteps: 31,
      fixedWavelength: 550,
      fixedAngle: 0,
      polarization: "s",
      incidentMaterial: air,
      substrateMaterial: bk7,
    },
    snapshot,
  );
  assert.equal(report.points.length, 31);
  for (const pt of report.points) {
    const sum = pt.result.r + pt.result.t + pt.result.absorbed;
    assert.ok(Math.abs(sum - 1) < 1e-9);
    assert.ok(pt.result.r <= 1 + 1e-12);
  }
});

test("膜系指纹在层序变更后不同，旧报告可区分", () => {
  const a = [makeLayer("builtin:tio2", 60)];
  const b = [makeLayer("builtin:tio2", 61)];
  assert.notEqual(
    stackFingerprint(a, air, bk7),
    stackFingerprint(b, air, bk7),
  );
  const reordered = [
    makeLayer("builtin:sio2", 95),
    makeLayer("builtin:tio2", 60),
  ];
  assert.notEqual(
    stackFingerprint(a, air, bk7),
    stackFingerprint(reordered, air, bk7),
  );
});

function filmDoc(): LabDocument {
  const film: Element = {
    id: "film1",
    kind: "film",
    x: 500,
    y: 300,
    angle: 90,
    size: 220,
    power: 1,
    rays: 5,
    spread: 0,
    wavelength: 550,
    focal: 180,
    index: 1.5,
    layers: [makeLayer("builtin:aluminum", 100)],
    incidentMaterial: air,
    substrateMaterial: bk7,
    polarization: "unpolarized",
  };
  const source: Element = {
    id: "src",
    kind: "source",
    x: 150,
    y: 300,
    angle: 0,
    size: 80,
    power: 1,
    rays: 5,
    spread: 0,
    wavelength: 550,
    focal: 180,
    index: 1.5,
  };
  const screen: Element = {
    id: "scr",
    kind: "screen",
    x: 820,
    y: 300,
    angle: 90,
    size: 240,
    power: 1,
    rays: 5,
    spread: 0,
    wavelength: 550,
    focal: 180,
    index: 1.5,
  };
  return { version: 1, items: [source, film, screen] };
}

test("几何追迹中薄膜能量收支不超过发射功率且守恒", () => {
  const result = trace(filmDoc());
  const b = result.budget;
  assert.ok(b.onScreen <= b.emitted + 1e-9);
  assert.ok(
    b.onScreen + b.absorbed + b.reflected + b.escaped <=
      b.emitted + 1e-6,
  );
  assert.ok(result.filmLosses.length > 0);
  // 金属膜有吸收记录
  assert.ok(result.filmLosses.some((l) => l.absorbed > 0.1));
});

test("无源器件任何输出功率不大于入射功率", () => {
  const layers: FilmLayer[] = [];
  for (let i = 0; i < 10; i++) {
    layers.push(makeLayer(i % 2 ? "builtin:gold" : "builtin:tio2", 40));
  }
  for (const angle of [0, 15, 45, 75, 89]) {
    const r = solveStack({ ...base, layers, wavelengthNm: 550, angleDeg: angle });
    assert.ok(r.r <= 1 + 1e-12);
    assert.ok(r.t <= 1 + 1e-12);
    assert.ok(r.r + r.t <= 1 + 1e-9);
  }
});
