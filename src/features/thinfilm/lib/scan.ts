/**
 * 角度 / 波长扫描引擎（纯函数，分块异步，避免阻塞实时编辑）。
 * 每个扫描点独立求解膜系；多波长在器件外互不相干，结果以功率形式分别保存。
 */
import type { FilmLayer, Polarization } from "../../../shared/document";
import { solveStack, type StackResult } from "./tmm";

export type ScanAxis = "wavelength" | "angle";

export interface ScanConfig {
  xAxis: ScanAxis;
  xStart: number;
  xEnd: number;
  xSteps: number;
  yAxis?: ScanAxis;
  yStart?: number;
  yEnd?: number;
  ySteps?: number;
  /** 另一轴保持不变的取值 */
  fixedWavelength: number;
  fixedAngle: number;
  polarization: Polarization;
  incidentMaterial: string;
  substrateMaterial: string;
}

export interface ScanPoint {
  wavelength: number;
  angle: number;
  result: StackResult;
}

export interface ScanReport {
  id: string;
  createdAt: number;
  config: ScanConfig;
  /** 膜系快照与指纹：扫描启动瞬间的布局，保证旧曲线不被后续编辑覆盖 */
  layers: FilmLayer[];
  fingerprint: string;
  points: ScanPoint[];
  /** 2D 网格点数（1D 时为 0） */
  ySteps: number;
  stale: boolean;
}

export interface StackSnapshot {
  layers: FilmLayer[];
  incidentMaterial: string;
  substrateMaterial: string;
  fingerprint: string;
}

function linspace(start: number, end: number, steps: number) {
  const n = Math.max(2, Math.min(400, Math.round(steps)));
  return Array.from({ length: n }, (_, i) =>
    n === 1 ? start : start + ((end - start) * i) / (n - 1),
  );
}

export function runScan(
  config: ScanConfig,
  snapshot: StackSnapshot,
  onProgress?: (done: number, total: number) => void,
  shouldCancel?: () => boolean,
): ScanReport {
  const xs = linspace(config.xStart, config.xEnd, config.xSteps);
  const ys = config.yAxis
    ? linspace(config.yStart ?? 0, config.yEnd ?? 89, config.ySteps ?? 20)
    : [0];
  const points: ScanPoint[] = [];
  let cancelled = false;
  for (let yi = 0; yi < ys.length; yi++) {
    for (let xi = 0; xi < xs.length; xi++) {
      if (shouldCancel?.()) {
        cancelled = true;
        break;
      }
      const wavelength =
        config.xAxis === "wavelength" ? xs[xi] : config.fixedWavelength;
      const angle =
        config.xAxis === "angle" ? xs[xi] : config.fixedAngle;
      const wl2 = config.yAxis === "wavelength" ? ys[yi] : wavelength;
      const an2 = config.yAxis === "angle" ? ys[yi] : angle;
      const result = solveStack({
        layers: snapshot.layers,
        wavelengthNm: wl2,
        angleDeg: an2,
        polarization: config.polarization,
        incidentMaterial: snapshot.incidentMaterial,
        substrateMaterial: snapshot.substrateMaterial,
      });
      points.push({ wavelength: wl2, angle: an2, result });
    }
    onProgress?.(points.length, xs.length * ys.length);
    if (cancelled) break;
  }
  return {
    id: `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    config,
    layers: snapshot.layers,
    fingerprint: snapshot.fingerprint,
    points,
    ySteps: config.yAxis ? ys.length : 0,
    stale: cancelled,
  };
}

/** 分块执行扫描，每块之间让出主线程，保证实时编辑不卡顿 */
export function runScanAsync(
  config: ScanConfig,
  snapshot: StackSnapshot,
  onProgress?: (done: number, total: number) => void,
  shouldCancel?: () => boolean,
  chunkSize = 24,
): Promise<ScanReport> {
  return new Promise((resolve) => {
    const xs = linspace(config.xStart, config.xEnd, config.xSteps);
    const ys = config.yAxis
      ? linspace(config.yStart ?? 0, config.yEnd ?? 89, config.ySteps ?? 20)
      : [0];
    const total = xs.length * ys.length;
    const points: ScanPoint[] = [];
    let index = 0;
    const tick = () => {
      const stop = Math.min(total, index + chunkSize);
      for (; index < stop; index++) {
        if (shouldCancel?.()) {
          resolve(finish());
          return;
        }
        const yi = Math.floor(index / xs.length);
        const xi = index % xs.length;
        const x = xs[xi];
        const y = ys[yi];
        const wavelength =
          config.xAxis === "wavelength" ? x : config.yAxis === "wavelength" ? y : config.fixedWavelength;
        const angle =
          config.xAxis === "angle" ? x : config.yAxis === "angle" ? y : config.fixedAngle;
        const result = solveStack({
          layers: snapshot.layers,
          wavelengthNm: wavelength,
          angleDeg: angle,
          polarization: config.polarization,
          incidentMaterial: snapshot.incidentMaterial,
          substrateMaterial: snapshot.substrateMaterial,
        });
        points.push({ wavelength, angle, result });
      }
      onProgress?.(index, total);
      if (index >= total) {
        resolve(finish());
      } else {
        setTimeout(tick, 0);
      }
    };
    function finish(): ScanReport {
      return {
        id: `scan-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 7)}`,
        createdAt: Date.now(),
        config,
        layers: snapshot.layers,
        fingerprint: snapshot.fingerprint,
        points,
        ySteps: config.yAxis ? ys.length : 0,
        stale: points.length < total,
      };
    }
    tick();
  });
}

/** 默认扫描配置 */
export function defaultScanConfig(
  polarization: Polarization,
  incident: string,
  substrate: string,
): ScanConfig {
  return {
    xAxis: "wavelength",
    xStart: 400,
    xEnd: 750,
    xSteps: 120,
    fixedWavelength: 550,
    fixedAngle: 0,
    polarization,
    incidentMaterial: incident,
    substrateMaterial: substrate,
  };
}
