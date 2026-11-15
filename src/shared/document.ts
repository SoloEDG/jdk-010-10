export type Kind =
  | "source"
  | "mirror"
  | "lens"
  | "prism"
  | "film"
  | "screen";

export interface Point {
  x: number;
  y: number;
}

/** 一层镀膜：厚度 nm + 材料（内置 id 或自定义色散模型） */
export interface FilmLayer {
  id: string;
  thickness: number;
  materialId: string;
  material?: CustomMaterial;
}

/** 用户自定义色散材料 */
export interface CustomMaterial {
  name: string;
  /** 恒定复折射率（常数模型） */
  n?: number;
  k?: number;
  /** Cauchy 模型：n(λ) = A + B/λ² + C/λ⁴（λ 以 µm 计），消光 k(λ) = k0 + k1/λ² */
  cauchy?: { A: number; B: number; C: number; k0?: number; k1?: number };
  /** 波长(nm) → n,k 采样表，按波长线性插值 */
  table?: { wavelength: number; n: number; k?: number }[];
}

/** 薄膜器件的偏振设置 */
export type Polarization = "s" | "p" | "unpolarized";

export interface Element extends Point {
  id: string;
  kind: Kind;
  angle: number;
  size: number;
  power: number;
  rays: number;
  spread: number;
  wavelength: number;
  focal: number;
  index: number;
  // ---- 薄膜器件专属（其余器件忽略）----
  /** 膜层顺序：入射侧 → 基底侧 */
  layers?: FilmLayer[];
  /** 入射介质材料 id（默认空气） */
  incidentMaterial?: string;
  /** 基底材料 id（默认玻璃 BK7） */
  substrateMaterial?: string;
  polarization?: Polarization;
}

export interface LabDocument {
  version: 1;
  items: Element[];
}

export interface Segment {
  from: Point;
  to: Point;
  power: number;
  wavelength: number;
  source: string;
  /** 反射段用于区分能量去向 */
  kind?: "forward" | "reflected" | "transmitted";
}

export interface ScreenHit {
  screen: string;
  position: number;
  power: number;
  wavelength: number;
  source: string;
}

/** 薄膜内部的能量去向记录 */
export interface FilmLoss {
  film: string;
  source: string;
  wavelength: number;
  /** 全反射（无透射波进入基底） */
  tir: boolean;
  /** 各层吸收功率（相对入射功率），顺序与膜层一致 */
  layerAbsorption: number[];
  /** 吸收总功率比例 */
  absorbed: number;
  /** 反射功率比例 */
  reflected: number;
  /** 透射功率比例 */
  transmitted: number;
}

/** 全实验台能量收支（相对所有光源总功率） */
export interface EnergyBudget {
  emitted: number;
  onScreen: number;
  reflected: number;
  absorbed: number;
  tir: number;
  escaped: number;
  residual: number;
}

export interface TraceResult {
  segments: Segment[];
  hits: ScreenHit[];
  truncated: number;
  filmLosses: FilmLoss[];
  budget: EnergyBudget;
}

export const labels: Record<Kind, string> = {
  source: "光源",
  mirror: "平面镜",
  lens: "凸透镜",
  prism: "三棱镜",
  film: "多层薄膜",
  screen: "接收屏",
};
