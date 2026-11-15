import type {
  LabDocument,
  TraceResult,
  FilmLoss,
  EnergyBudget,
  Element,
  Point,
} from "../../../shared/document";
import { add, mul, dot, sub, direction, norm } from "../../../shared/geometry";
import { emit } from "./emission";
import { nearestSurface } from "./surfaces";
import { reflect, refract, materialIndex } from "./refraction";
import { solveStack } from "../../thinfilm/lib/tmm";
import {
  defaultIncidentMaterial,
  defaultSubstrateMaterial,
  getMaterial,
  resolveIndex,
} from "../../thinfilm/lib/materials";

interface Ray {
  origin: Point;
  dir: Point;
  power: number;
  sourceId: string;
  wavelength: number;
  depth: number;
}

const MAX_EVENTS = 4000;
const POWER_FLOOR = 1e-7;

/** 光线与表面法线的入射角（度，0–90） */
function incidenceAngle(d: Point, normal: Point): number {
  const c = Math.abs(dot(d, norm(normal)));
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

export function trace(doc: LabDocument): TraceResult {
  const segments: TraceResult["segments"] = [];
  const hits: TraceResult["hits"] = [];
  const filmLosses: FilmLoss[] = [];
  let truncated = 0;
  let events = 0;

  const sources = doc.items.filter((e) => e.kind === "source");
  const queue: Ray[] = [];
  for (const source of sources)
    for (const ray of emit(source))
      queue.push({
        origin: ray.origin,
        dir: ray.direction,
        power: ray.power,
        sourceId: source.id,
        wavelength: source.wavelength,
        depth: 0,
      });

  const emitted = sources.reduce((s, e) => s + e.power, 0);
  // 只在【终端事件】记账，避免一束反射光后来落到屏上被重复统计
  let onScreen = 0;
  let absorbed = 0;
  let reflectedOut = 0;
  let escaped = 0;
  let tirEnergy = 0;

  const retire = (power: number) => {
    escaped += power;
  };

  while (queue.length) {
    if (events >= MAX_EVENTS) {
      for (const r of queue) retire(r.power);
      truncated += queue.length;
      break;
    }
    const ray = queue.shift()!;
    events += 1;
    if (ray.power < POWER_FLOOR) continue;

    const hit = nearestSurface(doc.items, ray.origin, ray.dir);
    const dest = hit?.point ?? add(ray.origin, mul(ray.dir, 1800));
    segments.push({
      from: ray.origin,
      to: dest,
      power: ray.power,
      wavelength: ray.wavelength,
      source: ray.sourceId,
    });
    if (!hit) {
      retire(ray.power); // 离开实验台
      continue;
    }
    const e = hit.element;

    if (e.kind === "screen") {
      hits.push({
        screen: e.id,
        position: dot(sub(hit.point, e), direction(e.angle)),
        power: ray.power,
        wavelength: ray.wavelength,
        source: ray.sourceId,
      });
      onScreen += ray.power;
      continue;
    }

    if (e.kind === "mirror") {
      const d = reflect(ray.dir, hit.normal);
      queue.push({
        ...ray,
        origin: add(hit.point, mul(d, 0.02)),
        dir: d,
        depth: ray.depth + 1,
      });
      continue;
    }

    if (e.kind === "lens") {
      const axis = direction(e.angle - 90),
        tangent = direction(e.angle),
        forward = dot(ray.dir, axis) >= 0 ? 1 : -1,
        u = dot(sub(hit.point, e), tangent),
        axial = Math.max(0.0001, Math.abs(dot(ray.dir, axis))),
        slope = dot(ray.dir, tangent) / axial - u / e.focal;
      const d = norm(add(mul(axis, forward), mul(tangent, slope)));
      queue.push({
        ...ray,
        origin: add(hit.point, mul(d, 0.02)),
        dir: d,
        depth: ray.depth + 1,
      });
      continue;
    }

    if (e.kind === "prism") {
      const n = materialIndex(e.index, ray.wavelength);
      const entering = dot(ray.dir, hit.normal) < 0;
      const transmitted = refract(
        ray.dir,
        hit.normal,
        entering ? 1 : n,
        entering ? n : 1,
      );
      if (transmitted) {
        queue.push({
          ...ray,
          origin: add(hit.point, mul(transmitted, 0.02)),
          dir: transmitted,
          power: ray.power * 0.96,
          depth: ray.depth + 1,
        });
        absorbed += ray.power * 0.04;
      } else {
        const d = reflect(ray.dir, hit.normal);
        queue.push({
          ...ray,
          origin: add(hit.point, mul(d, 0.02)),
          dir: d,
          depth: ray.depth + 1,
        });
      }
      continue;
    }

    if (e.kind === "film") {
      const angle = incidenceAngle(ray.dir, hit.normal);
      const result = solveStack({
        layers: e.layers ?? [],
        wavelengthNm: ray.wavelength,
        angleDeg: angle,
        polarization: e.polarization ?? "unpolarized",
        incidentMaterial: e.incidentMaterial ?? defaultIncidentMaterial,
        substrateMaterial: e.substrateMaterial ?? defaultSubstrateMaterial,
      });

      const pRefl = ray.power * result.r;
      const pTrans = ray.power * result.t;
      absorbed += ray.power * result.absorbed;
      if (result.tir) tirEnergy += pRefl;

      filmLosses.push({
        film: e.id,
        source: ray.sourceId,
        wavelength: ray.wavelength,
        tir: result.tir,
        layerAbsorption: result.layerAbsorption.map((f) => f * ray.power),
        absorbed: result.absorbed,
        reflected: result.r,
        transmitted: result.t,
      });

      // 膜内多次反射已【相干】合成为单一反射波与单一透射波
      if (pRefl >= POWER_FLOOR) {
        const rd = reflect(ray.dir, hit.normal);
        queue.push({
          origin: add(hit.point, mul(rd, 0.02)),
          dir: rd,
          power: pRefl,
          sourceId: ray.sourceId,
          wavelength: ray.wavelength,
          depth: ray.depth + 1,
        });
      } else if (result.r > 0) {
        reflectedOut += pRefl;
      }

      if (pTrans >= POWER_FLOOR && !result.tir) {
        const n0 = resolveIndex(
          e.incidentMaterial ?? defaultIncidentMaterial,
          undefined,
          ray.wavelength,
        ).n;
        const ns = resolveIndex(
          e.substrateMaterial ?? defaultSubstrateMaterial,
          undefined,
          ray.wavelength,
        ).n;
        const td = refract(ray.dir, hit.normal, n0, ns);
        if (td) {
          queue.push({
            origin: add(hit.point, mul(td, 0.02)),
            dir: td,
            power: pTrans,
            sourceId: ray.sourceId,
            wavelength: ray.wavelength,
            depth: ray.depth + 1,
          });
        } else {
          reflectedOut += pTrans;
        }
      } else if (result.tir) {
        // TIR 能量已计入反射波；若反射波低于阈值，归入反射终端
        if (pRefl < POWER_FLOOR) reflectedOut += pRefl;
      }
      continue;
    }
  }

  // 能量收支（全部按终端事件统计，天然不重复）：
  // 发射 = 屏上 + 吸收 + 反射回空间 + 逃逸/截断
  const budget: EnergyBudget = {
    emitted,
    onScreen,
    reflected: reflectedOut,
    absorbed,
    tir: tirEnergy,
    escaped: Math.max(0, escaped),
    residual: Math.max(
      0,
      emitted - onScreen - absorbed - reflectedOut - escaped,
    ),
  };
  return { segments, hits, truncated, filmLosses, budget };
}

/** 选中薄膜的实时单点响应（供能量面板使用，不经过几何追迹） */
export function filmAt(element: Element, wavelengthNm: number, angleDeg = 0) {
  return solveStack({
    layers: element.layers ?? [],
    wavelengthNm,
    angleDeg,
    polarization: element.polarization ?? "unpolarized",
    incidentMaterial: element.incidentMaterial ?? defaultIncidentMaterial,
    substrateMaterial: element.substrateMaterial ?? defaultSubstrateMaterial,
  });
}

export function materialName(id: string): string {
  return getMaterial(id)?.name ?? id;
}
