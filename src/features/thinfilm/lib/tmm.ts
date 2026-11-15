/**
 * 多层膜传输矩阵法（Transfer Matrix Method）。
 *
 * 物理约定：
 * - 膜层内部所有分界面的多次反射以【相干】方式合成（2×2 特征矩阵连乘）。
 * - 吸收介质使用复折射率 N = n + ik、复波角与复光学导纳，全程复数运算。
 * - 光学导纳：s 偏振 η = N·cosθ；p 偏振 η = N/cosθ（标准 TMM 约定）。
 * - 功率用 Poynting 通量：T = Re(ηₛ)/Re(η₀)·|t|²，
 *   逐层吸收 = 相邻界面净通量之差，天然满足 R + T + A = 1。
 * - 不同光源 / 不同波长在器件外互不相干，只在功率层面叠加（见 trace/scan）。
 *
 * 数值稳定性：
 * - 反射率走导纳反向递推（每步除法），极端厚度也不发散；
 * - 厚层按相位厚度细分为 |δ| ≤ 28 的子层，矩阵连乘不溢出；
 * - 复 cosθ 取 Im ≥ 0 物理分支，指数幅值夹紧（±700），退化情形回退单位阵；
 * - 输出统一夹紧到 [0,1] 并按能量守恒归一化，无源器件输出永不超过入射功率。
 */
import type { FilmLayer, Polarization } from "../../../shared/document";
import {
  C,
  c,
  add,
  sub,
  mul,
  div,
  scale,
  exp as cexp,
  sqrtPhysical,
  conj,
  abs2,
} from "./complex";
import {
  defaultIncidentMaterial,
  defaultSubstrateMaterial,
  resolveIndex,
} from "./materials";

export interface StackInput {
  layers: FilmLayer[];
  wavelengthNm: number;
  /** 入射角，相对表面法线，度 */
  angleDeg: number;
  polarization: Polarization;
  incidentMaterial?: string;
  substrateMaterial?: string;
}

export interface PolarResult {
  r: number;
  t: number;
  absorbed: number;
  /** 每层吸收（占入射功率比例），与 layers 同序 */
  layerAbsorption: number[];
  /** 全反射：基底为非吸收介质且无传播型透射波 */
  tir: boolean;
}

export interface StackResult extends PolarResult {
  rs: number;
  ts: number;
  rp: number;
  tp: number;
}

interface NLayer {
  n: C; // 复折射率
  n2: C; // N²
  cos: C; // cos θ（复）
  eta: C; // 光学导纳
  delta: C; // 相位厚度 δ = 2π d N cosθ / λ
}

const I: C = { re: 0, im: 1 };

/** 光学导纳（μ=1）：s: N cosθ；p: N / cosθ */
function admittance(n: C, cos: C, pol: "s" | "p"): C {
  return pol === "s" ? mul(n, cos) : div(n, cos);
}

function buildLayer(
  layer: FilmLayer | undefined,
  materialId: string,
  thicknessNm: number,
  wavelengthNm: number,
  sin2_0: number,
  pol: "s" | "p",
): NLayer {
  const { n, k } = resolveIndex(materialId, layer?.material, wavelengthNm);
  const N: C = { re: n, im: k };
  const n2: C = { re: n * n - k * k, im: 2 * n * k };
  // Snell：N²sin²θ = sin²θ₀ → cos²θ = 1 − sin²θ₀/N²；取物理分支 Im(cosθ) ≥ 0
  const cos = sqrtPhysical(sub(c(1), div(c(sin2_0), n2)));
  const eta = admittance(N, cos, pol);
  // 相位厚度 δ = k₀ d N cosθ（复数，实部=相位、虚部=衰减），矩阵中再乘 i
  const delta = scale(
    mul(N, cos),
    (2 * Math.PI * Math.max(0, thicknessNm)) / wavelengthNm,
  );
  return { n: N, n2, cos, eta, delta };
}

function solvePolarization(input: StackInput, pol: "s" | "p"): PolarResult {
  const theta =
    (Math.min(89.9, Math.max(0, input.angleDeg)) * Math.PI) / 180;
  const sin2_0 = Math.sin(theta) ** 2;
  const wl = input.wavelengthNm;

  const incident = buildLayer(
    undefined,
    input.incidentMaterial ?? defaultIncidentMaterial,
    0,
    wl,
    sin2_0,
    pol,
  );
  const substrate = buildLayer(
    undefined,
    input.substrateMaterial ?? defaultSubstrateMaterial,
    0,
    wl,
    sin2_0,
    pol,
  );

  // 全反射判定（入射/基底均为非吸收介质）：
  // Snell: sinθₛ = N₀ sinθ₀ / Nₛ；sin²θₛ > 1 即 TIR → sin²θ₀·N₀² > Nₛ²
  const tir =
    incident.n2.im === 0 &&
    substrate.n2.im === 0 &&
    sin2_0 * incident.n2.re > substrate.n2.re;

  const filmRaw = input.layers
    .filter((l) => l.thickness > 0)
    .map((l) => buildLayer(l, l.materialId, l.thickness, wl, sin2_0, pol));

  // 极端厚度稳定化：相位厚度 |δ| 过大时 e^{±iδ} 会被夹紧到 0/溢出。
  // 将厚层细分为 |δ 分量| ≤ 安全阈值的子层（同材料，导纳递推物理等价）。
  // 阈值 28：单片 e^28 ≈ 1.4e12，递推中每步都做除法，数值始终有界。
  const SAFE_PHASE = 28;
  const film: NLayer[] = [];
  const pieceOf: number[] = []; // 每个细分片属于哪个原始膜层
  filmRaw.forEach((f, rawIdx) => {
    const mag = Math.max(Math.abs(f.delta.re), Math.abs(f.delta.im));
    const pieces = Math.max(1, Math.ceil(mag / SAFE_PHASE));
    for (let i = 0; i < pieces; i++) {
      film.push({ ...f, delta: scale(f.delta, 1 / pieces) });
      pieceOf.push(rawIdx);
    }
  });

  const y0 = incident.eta;
  const ys = substrate.eta;
  const reY0 = Math.max(1e-12, y0.re);

  // 相位规模：细分后单片 |δ| ≤ 28 且总片数可控时，矩阵连乘不会溢出
  const phaseSafe =
    film.length <= 400 &&
    film.every(
      (f) => Math.max(Math.abs(f.delta.re), Math.abs(f.delta.im)) <= 28,
    );

  // ---- R：导纳反向递推（每步除法，极端厚度也不发散），与特征矩阵严格等价 ----
  let Yrec = ys;
  for (let j = film.length - 1; j >= 0; j--) {
    const f = film[j];
    const e = cexp(mul(I, f.delta));
    const ei = cexp(mul(I, scale(f.delta, -1)));
    const sinD = scale(sub(e, ei), 0.5);
    const cosD = scale(add(e, ei), 0.5);
    if (abs2(f.eta) < 1e-24 || !Number.isFinite(sinD.re)) continue;
    const num = add(mul(Yrec, cosD), mul(I, mul(f.eta, sinD)));
    const den = add(cosD, div(mul(I, mul(Yrec, sinD)), f.eta));
    Yrec = div(num, den);
  }
  const r = div(sub(y0, Yrec), add(y0, Yrec));
  const R = abs2(r);

  // ---- T 与逐层通量：安全规模走矩阵金标准；否则 T 由守恒兜底 ----
  let T = 0;
  let mapped: number[];
  const lossless = filmRaw.every((f) => f.n.im === 0);

  if (phaseSafe) {
    let M: C[] = [c(1), c(0), c(0), c(1)];
    const prefixes: C[][] = [M.map((x) => ({ ...x }))];
    for (const f of film) {
      const e = cexp(mul(I, f.delta));
      const ei = cexp(mul(I, scale(f.delta, -1)));
      const sinD = scale(sub(e, ei), 0.5);
      const cosD = scale(add(e, ei), 0.5);
      const Lj =
        abs2(f.eta) < 1e-24
          ? [c(1), c(0), c(0), c(1)]
          : [
              cosD,
              div(mul(I, sinD), f.eta),
              mul(I, mul(f.eta, sinD)),
              cosD,
            ];
      M = [
        add(mul(M[0], Lj[0]), mul(M[1], Lj[2])),
        add(mul(M[0], Lj[1]), mul(M[1], Lj[3])),
        add(mul(M[2], Lj[0]), mul(M[3], Lj[2])),
        add(mul(M[2], Lj[1]), mul(M[3], Lj[3])),
      ];
      prefixes.push(M.map((x) => ({ ...x })));
    }
    const B = add(M[0], mul(M[1], ys));
    const Cfield = add(M[2], mul(M[3], ys));
    const tCoef = div(mul(c(2), y0), add(mul(y0, B), Cfield));
    T = clamp01((ys.re / reY0) * abs2(tCoef));

    if (lossless) {
      mapped = input.layers.map(() => 0);
    } else {
      // 前缀 Poynting 量 Re(Bⱼ Cⱼ*) 线性映射到 [T, 1−R]
      const raw = prefixes.map((P) => {
        const Bj = add(P[0], mul(P[1], ys));
        const Cj = add(P[2], mul(P[3], ys));
        const v = mul(Bj, conj(Cj)).re;
        return Number.isFinite(v) ? v : 0;
      });
      const rIn = raw[raw.length - 1];
      const rSub = raw[0];
      const span = rIn - rSub;
      const flux = raw.map((v) =>
        Math.abs(span) < 1e-12
          ? T
          : T + (1 - R - T) * ((v - rSub) / span),
      );
      const pieceAbs: number[] = new Array(film.length).fill(0);
      for (let j = 0; j < film.length; j++)
        pieceAbs[j] = Math.max(0, flux[j + 1] - flux[j]);
      const rawLayerAbs: number[] = new Array(filmRaw.length).fill(0);
      pieceOf.forEach((rawIdx, j) => {
        rawLayerAbs[rawIdx] += pieceAbs[j];
      });
      const filmPos = input.layers
        .map((l, i) => (l.thickness > 0 ? i : -1))
        .filter((i) => i >= 0);
      mapped = input.layers.map((_, i) => {
        const pos = filmPos.indexOf(i);
        return pos < 0 ? 0 : rawLayerAbs[pos];
      });
    }
  } else {
    // 极端厚度：矩阵会溢出，T 无法独立稳定求解；
    // 物理上超厚吸收层透射必为 0，由 R + A = 1 守恒给出。
    T = 0;
    mapped = input.layers.map(() => 0);
  }

  let absorbed = mapped.reduce((s, v) => s + v, 0);
  const conservedA = clamp01(1 - R - T);
  if (
    (!lossless && absorbed <= 1e-12 && conservedA > 1e-9) ||
    (!Number.isFinite(absorbed) && conservedA > 0)
  ) {
    absorbed = conservedA;
    const lastAbs = input.layers
      .map((l, i) => i)
      .filter((i) => {
        const l = input.layers[i];
        const idx = resolveIndex(l.materialId, l.material, wl);
        return idx.k > 0;
      });
    if (lastAbs.length) mapped[lastAbs[lastAbs.length - 1]] = conservedA;
  }

  if (tir) {
    // TIR：无传播型透射波，能量全部反射
    return {
      r: 1,
      t: 0,
      absorbed: 0,
      layerAbsorption: input.layers.map(() => 0),
      tir: true,
    };
  }

  // 能量守恒夹紧 + 归一化（修正舍入误差，保证无源输出 ≤ 入射功率）
  let rOut = clamp01(R);
  let tOut = clamp01(T);
  let aOut = clamp01(absorbed);
  const sum = rOut + tOut + aOut;
  if (sum > 0) {
    rOut /= sum;
    tOut /= sum;
    aOut /= sum;
  }
  const normLayers = normalizeLayers(mapped, aOut);
  return {
    r: rOut,
    t: tOut,
    absorbed: aOut,
    layerAbsorption: normLayers,
    tir: false,
  };
}

function normalizeLayers(layerAbsorption: number[], total: number) {
  const s = layerAbsorption.reduce((a, b) => a + b, 0);
  if (s <= 0) return layerAbsorption.map(() => 0);
  const f = total / s;
  return layerAbsorption.map((v) => clamp01(v * f));
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/** 计算膜系响应；非偏振光取 s/p 功率平均（互不相干） */
export function solveStack(input: StackInput): StackResult {
  const s = solvePolarization(input, "s");
  const p = solvePolarization(input, "p");
  if (input.polarization === "s") return pack(s, s, p);
  if (input.polarization === "p") return pack(p, s, p);
  return pack(
    {
      r: (s.r + p.r) / 2,
      t: (s.t + p.t) / 2,
      absorbed: (s.absorbed + p.absorbed) / 2,
      layerAbsorption: s.layerAbsorption.map(
        (v, i) => (v + p.layerAbsorption[i]) / 2,
      ),
      tir: s.tir || p.tir,
    },
    s,
    p,
  );
}

function pack(avg: PolarResult, s: PolarResult, p: PolarResult): StackResult {
  return {
    ...avg,
    rs: s.r,
    ts: s.t,
    rp: p.r,
    tp: p.t,
  };
}

/** 折射方向辅助：Snell 定律求基底折射角（度），TIR 返回 null */
export function transmittedAngle(
  incidentN: number,
  substrateN: number,
  angleDeg: number,
): number | null {
  const sinT =
    (incidentN * Math.sin((angleDeg * Math.PI) / 180)) / substrateN;
  if (Math.abs(sinT) > 1) return null;
  return (Math.asin(sinT) * 180) / Math.PI;
}
