import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FilmEditor } from "../src/features/thinfilm/ui/FilmEditor";
import { ScanPanel } from "../src/features/thinfilm/ui/ScanPanel";
import { EnergyBudgetPanel } from "../src/features/thinfilm/ui/EnergyBudgetPanel";
import { trace } from "../src/features/optics/lib/trace";
import { makeLayer } from "../src/features/thinfilm/lib/presets";
import type { Element } from "../src/shared/document";

const film: Element = {
  id: "f", kind: "film", x: 0, y: 0, angle: 90, size: 200, power: 1,
  rays: 3, spread: 0, wavelength: 550, focal: 180, index: 1.5,
  layers: [makeLayer("builtin:tio2", 61), makeLayer("builtin:sio2", 95)],
  incidentMaterial: "builtin:air", substrateMaterial: "builtin:bk7",
  polarization: "unpolarized",
};
const h = (el: React.ReactElement) => renderToStaticMarkup(el);

test("FilmEditor 渲染膜层与材料控件", () => {
  const html = h(React.createElement(FilmEditor, { element: film, onUpdate: () => {} }));
  assert.ok(html.includes("膜层结构"));
  assert.ok(html.includes("TiO"));
  assert.ok(html.includes("入射介质"));
});

test("EnergyBudgetPanel 渲染 R/T/A 与守恒信息", () => {
  const tr = trace({ version: 1, items: [] });
  const html = h(React.createElement(EnergyBudgetPanel, { film, trace: tr }));
  assert.ok(html.includes("能量收支"));
  assert.ok(html.includes("反射率"));
});

test("ScanPanel 无薄膜给提示，有薄膜渲染配置", () => {
  const empty = h(React.createElement(ScanPanel, {
    film: undefined, onApplyPoint: () => {},
  }));
  assert.ok(empty.includes("多层薄膜"));
  const withFilm = h(React.createElement(ScanPanel, {
    film, onApplyPoint: () => {},
  }));
  assert.ok(withFilm.includes("一维扫描"));
});
