import type { Kind, Element } from "../../../shared/document";
import { stackPresets } from "../../thinfilm/lib/presets";

export const catalog: { kind: Kind; subtitle: string; symbol: string }[] = [
  { kind: "source", subtitle: "平行光束 · 可调波长", symbol: "☀" },
  { kind: "mirror", subtitle: "反射 · 可调角度", symbol: "╱" },
  { kind: "lens", subtitle: "薄透镜 · 可调焦距", symbol: "◉" },
  { kind: "prism", subtitle: "折射 · 色散模型", symbol: "△" },
  { kind: "film", subtitle: "多层镀膜 · 传输矩阵", symbol: "▤" },
  { kind: "screen", subtitle: "捕获光束 · 能量分析", symbol: "▥" },
];

export function createElement(kind: Kind, count: number): Element {
  const base: Element = {
    id: crypto.randomUUID(),
    kind,
    x: 200 + ((count * 63) % 600),
    y: 270 + (count % 3) * 35,
    angle: kind === "source" ? 0 : 90,
    size: kind === "source" ? 90 : kind === "prism" ? 100 : 180,
    power: 1,
    rays: 9,
    spread: 0,
    wavelength: 550,
    focal: 180,
    index: 1.52,
  };
  if (kind === "film") {
    const preset = stackPresets[0];
    base.layers = preset.build();
    base.incidentMaterial = preset.incident;
    base.substrateMaterial = preset.substrate;
    base.polarization = "unpolarized";
    base.size = 200;
  }
  return base;
}
