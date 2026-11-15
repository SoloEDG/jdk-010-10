import type { CustomMaterial } from "../../../shared/document";

/**
 * 材料色散库。
 * - 介质：Sellmeier / Cauchy / 常数 n
 * - 金属：可见光区 n+ik 采样表（线性插值，范围外取端点）
 * 波长统一使用 nm。
 */
export interface MaterialDef {
  id: string;
  name: string;
  kind: "dielectric" | "metal" | "gas";
  /** 返回复折射率 N = n + ik */
  index: (wavelengthNm: number) => { n: number; k: number };
}

/** Sellmeier：n²-1 = Σ Bᵢλ²/(λ²-Cᵢ)，λ 以 µm 输入 */
function sellmeier(terms: [number, number][]) {
  return (wavelengthNm: number) => {
    const lam = wavelengthNm / 1000;
    let s = 1;
    for (const [B, C] of terms) s += (B * lam * lam) / (lam * lam - C);
    return { n: Math.sqrt(Math.max(1, s)), k: 0 };
  };
}

/** Cauchy：n(λ)=A+B/λ²+C/λ⁴（λ µm），可选消光 k(λ)=k0+k1/λ² */
function cauchy(p: NonNullable<CustomMaterial["cauchy"]>) {
  return (wavelengthNm: number) => {
    const lam = wavelengthNm / 1000;
    const n = p.A + p.B / (lam * lam) + p.C / (lam ** 4);
    const k = (p.k0 ?? 0) + (p.k1 ?? 0) / (lam * lam);
    return { n, k: Math.max(0, k) };
  };
}

/** n+ik 采样表，按波长线性插值，越界取端点 */
function table(points: { wavelength: number; n: number; k?: number }[]) {
  const pts = [...points].sort((a, b) => a.wavelength - b.wavelength);
  return (wavelengthNm: number) => {
    if (wavelengthNm <= pts[0].wavelength)
      return { n: pts[0].n, k: pts[0].k ?? 0 };
    const last = pts[pts.length - 1];
    if (wavelengthNm >= last.wavelength)
      return { n: last.n, k: last.k ?? 0 };
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (wavelengthNm <= b.wavelength) {
        const t = (wavelengthNm - a.wavelength) / (b.wavelength - a.wavelength);
        return {
          n: a.n + (b.n - a.n) * t,
          k: (a.k ?? 0) + ((b.k ?? 0) - (a.k ?? 0)) * t,
        };
      }
    }
    return { n: last.n, k: last.k ?? 0 };
  };
}

/** 内置材料（id 以 builtin: 前缀） */
export const builtinMaterials: MaterialDef[] = [
  {
    id: "builtin:air",
    name: "空气",
    kind: "gas",
    index: () => ({ n: 1, k: 0 }),
  },
  {
    id: "builtin:vacuum",
    name: "真空",
    kind: "gas",
    index: () => ({ n: 1, k: 0 }),
  },
  {
    id: "builtin:bk7",
    name: "BK7 玻璃",
    kind: "dielectric",
    index: sellmeier([
      [1.03961217, 0.00600069867],
      [0.231792344, 0.0200179144],
      [1.01046945, 103.560653],
    ]),
  },
  {
    id: "builtin:fused-silica",
    name: "熔融石英 SiO₂",
    kind: "dielectric",
    index: sellmeier([
      [0.6961663, 0.0684043 ** 2],
      [0.4079426, 0.1162414 ** 2],
      [0.8974794, 9.896161 ** 2],
    ]),
  },
  {
    id: "builtin:sio2",
    name: "二氧化硅膜 SiO₂",
    kind: "dielectric",
    index: cauchy({ A: 1.4508, B: 0.0067, C: 0.0003 }),
  },
  {
    id: "builtin:mgf2",
    name: "氟化镁 MgF₂",
    kind: "dielectric",
    index: cauchy({ A: 1.3696, B: 0.0042, C: 0 }),
  },
  {
    id: "builtin:tio2",
    name: "二氧化钛 TiO₂",
    kind: "dielectric",
    index: cauchy({ A: 2.237, B: 0.024, C: 0.0012 }),
  },
  {
    id: "builtin:ta2o5",
    name: "五氧化二钽 Ta₂O₅",
    kind: "dielectric",
    index: cauchy({ A: 2.07, B: 0.019, C: 0 }),
  },
  {
    id: "builtin:si3n4",
    name: "氮化硅 Si₃N₄",
    kind: "dielectric",
    index: cauchy({ A: 2.0, B: 0.027, C: 0 }),
  },
  {
    id: "builtin:hfo2",
    name: "二氧化铪 HfO₂",
    kind: "dielectric",
    index: cauchy({ A: 1.885, B: 0.012, C: 0 }),
  },
  {
    id: "builtin:water",
    name: "水",
    kind: "dielectric",
    index: sellmeier([
      [0.75831, 0.01007],
      [0.08495, 8.91377],
    ]),
  },
  // ---- 金属（可见光区实测 n+ik 采样，来源： refractiveindex.info 典型值）----
  {
    id: "builtin:gold",
    name: "金 Au",
    kind: "metal",
    index: table([
      { wavelength: 400, n: 1.47, k: 1.95 },
      { wavelength: 450, n: 1.4, k: 1.88 },
      { wavelength: 500, n: 0.84, k: 1.84 },
      { wavelength: 550, n: 0.34, k: 2.37 },
      { wavelength: 600, n: 0.23, k: 3.0 },
      { wavelength: 650, n: 0.16, k: 3.55 },
      { wavelength: 700, n: 0.13, k: 4.1 },
      { wavelength: 750, n: 0.12, k: 4.63 },
      { wavelength: 900, n: 0.09, k: 5.96 },
    ]),
  },
  {
    id: "builtin:silver",
    name: "银 Ag",
    kind: "metal",
    index: table([
      { wavelength: 400, n: 0.17, k: 1.95 },
      { wavelength: 450, n: 0.16, k: 2.43 },
      { wavelength: 500, n: 0.13, k: 2.92 },
      { wavelength: 550, n: 0.12, k: 3.34 },
      { wavelength: 600, n: 0.13, k: 3.75 },
      { wavelength: 650, n: 0.14, k: 4.16 },
      { wavelength: 700, n: 0.15, k: 4.56 },
      { wavelength: 750, n: 0.17, k: 4.96 },
      { wavelength: 900, n: 0.2, k: 6.0 },
    ]),
  },
  {
    id: "builtin:aluminum",
    name: "铝 Al",
    kind: "metal",
    index: table([
      { wavelength: 400, n: 0.49, k: 4.88 },
      { wavelength: 450, n: 0.6, k: 5.3 },
      { wavelength: 500, n: 0.77, k: 5.8 },
      { wavelength: 550, n: 0.94, k: 6.32 },
      { wavelength: 600, n: 1.1, k: 6.8 },
      { wavelength: 650, n: 1.28, k: 7.25 },
      { wavelength: 700, n: 1.47, k: 7.7 },
      { wavelength: 750, n: 1.67, k: 8.14 },
      { wavelength: 900, n: 2.0, k: 9.0 },
    ]),
  },
  {
    id: "builtin:copper",
    name: "铜 Cu",
    kind: "metal",
    index: table([
      { wavelength: 400, n: 1.18, k: 2.1 },
      { wavelength: 450, n: 1.15, k: 2.35 },
      { wavelength: 500, n: 1.04, k: 2.55 },
      { wavelength: 550, n: 0.75, k: 2.55 },
      { wavelength: 600, n: 0.47, k: 2.81 },
      { wavelength: 650, n: 0.3, k: 3.21 },
      { wavelength: 700, n: 0.23, k: 3.67 },
      { wavelength: 750, n: 0.2, k: 4.13 },
      { wavelength: 900, n: 0.17, k: 5.4 },
    ]),
  },
];

const materialMap = new Map(builtinMaterials.map((m) => [m.id, m]));

export function getMaterial(id: string): MaterialDef | undefined {
  return materialMap.get(id);
}

export function customMaterialIndex(
  mat: CustomMaterial,
  wavelengthNm: number,
): { n: number; k: number } {
  if (mat.table?.length) return table(mat.table)(wavelengthNm);
  if (mat.cauchy) return cauchy(mat.cauchy)(wavelengthNm);
  return { n: mat.n ?? 1.5, k: mat.k ?? 0 };
}

/** 膜层材料解析：自定义材料优先，否则查内置库，找不到时回退空气并标记 */
export function resolveIndex(
  materialId: string,
  custom: CustomMaterial | undefined,
  wavelengthNm: number,
): { n: number; k: number } {
  if (custom) return customMaterialIndex(custom, wavelengthNm);
  return getMaterial(materialId)?.index(wavelengthNm) ?? { n: 1, k: 0 };
}

export const defaultIncidentMaterial = "builtin:air";
export const defaultSubstrateMaterial = "builtin:bk7";
