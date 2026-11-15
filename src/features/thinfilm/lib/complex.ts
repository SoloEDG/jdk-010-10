/**
 * 最小复数工具：所有薄膜计算都在复数域进行（吸收材料 k > 0）。
 * 结果统一夹紧，避免极端厚度时 exp 溢出导致 NaN / Infinity。
 */
export interface C {
  re: number;
  im: number;
}

export const c = (re: number, im = 0): C => ({ re, im });
export const add = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
export const sub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im });
export const mul = (a: C, b: C): C => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
export const scale = (a: C, s: number): C => ({ re: a.re * s, im: a.im * s });
export const div = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im || 1e-300;
  return {
    re: (a.re * b.re + a.im * b.im) / d,
    im: (a.im * b.re - a.re * b.im) / d,
  };
};
/** 幅值夹紧，保证极端相位厚度下 exp 不溢出 */
export const exp = (a: C): C => {
  const mag = Math.exp(Math.max(-700, Math.min(700, a.re)));
  return { re: mag * Math.cos(a.im), im: mag * Math.sin(a.im) };
};
export const sqrt = (a: C): C => {
  const r = Math.hypot(a.re, a.im);
  const re = Math.sqrt(Math.max(0, (r + a.re) / 2));
  const im =
    Math.sqrt(Math.max(0, (r - a.re) / 2)) * (a.im < 0 ? -1 : 1);
  return { re, im };
};
/**
 * 物理分支平方根：强制 Im ≥ 0。
 * TMM 中 cosθ 必须取该分支——衰减波随深度指数衰减，
 * 且 p 偏振导纳 N/cosθ 的符号由此保证正确。
 */
export const sqrtPhysical = (a: C): C => {
  const r = Math.hypot(a.re, a.im);
  const re = Math.sqrt(Math.max(0, (r + a.re) / 2));
  const im = Math.sqrt(Math.max(0, (r - a.re) / 2));
  return { re, im };
};
export const abs2 = (a: C): number => a.re * a.re + a.im * a.im;
export const conj = (a: C): C => ({ re: a.re, im: -a.im });
export const re = (a: C): number => a.re;
