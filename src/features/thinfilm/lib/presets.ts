import type { FilmLayer } from "../../../shared/document";
import { defaultIncidentMaterial, defaultSubstrateMaterial } from "./materials";

let seq = 0;
export function newLayerId(): string {
  seq += 1;
  return `layer-${Date.now().toString(36)}-${seq}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export function makeLayer(
  materialId: string,
  thicknessNm: number,
): FilmLayer {
  return { id: newLayerId(), thickness: thicknessNm, materialId };
}

export interface StackPreset {
  id: string;
  name: string;
  description: string;
  incident: string;
  substrate: string;
  build: () => FilmLayer[];
}

/** 常用膜系模板 */
export const stackPresets: StackPreset[] = [
  {
    id: "ar-single",
    name: "单层增透膜",
    description: "λ/4 MgF₂ 抗反膜，550 nm 处反射最低",
    incident: defaultIncidentMaterial,
    substrate: defaultSubstrateMaterial,
    build: () => [makeLayer("builtin:mgf2", 100)],
  },
  {
    id: "ar-vcoat",
    name: "双层 V 型增透",
    description: "MgF₂ + TiO₂ 双 λ/4 膜，窄带抗反",
    incident: defaultIncidentMaterial,
    substrate: defaultSubstrateMaterial,
    build: () => [
      makeLayer("builtin:tio2", 61),
      makeLayer("builtin:mgf2", 95),
    ],
  },
  {
    id: "bragg-mirror",
    name: "布拉格高反镜",
    description: "6 对 TiO₂/SiO₂ 四分之一波长膜堆",
    incident: defaultIncidentMaterial,
    substrate: defaultSubstrateMaterial,
    build: () => {
      const layers: FilmLayer[] = [];
      for (let i = 0; i < 6; i++) {
        layers.push(makeLayer("builtin:tio2", 61));
        layers.push(makeLayer("builtin:sio2", 95));
      }
      return layers;
    },
  },
  {
    id: "metal-mirror",
    name: "金属反射膜",
    description: "100 nm 铝膜 + SiO₂ 保护层",
    incident: defaultIncidentMaterial,
    substrate: defaultSubstrateMaterial,
    build: () => [
      makeLayer("builtin:aluminum", 100),
      makeLayer("builtin:sio2", 20),
    ],
  },
  {
    id: "absorber",
    name: "吸收滤光片",
    description: "厚金属吸收层，展示能量被吸收的去向",
    incident: defaultIncidentMaterial,
    substrate: defaultSubstrateMaterial,
    build: () => [makeLayer("builtin:gold", 50)],
  },
  {
    id: "empty",
    name: "空白基底",
    description: "无膜层，仅入射介质 / 基底界面",
    incident: defaultIncidentMaterial,
    substrate: defaultSubstrateMaterial,
    build: () => [],
  },
];

/** 膜系指纹：扫描期间层序被修改时，旧报告与新布局可区分、不被覆盖 */
export function stackFingerprint(
  layers: FilmLayer[],
  incident: string,
  substrate: string,
): string {
  const body = layers
    .map(
      (l) =>
        `${l.materialId}:${Math.round(l.thickness * 100)}:${
          l.material ? JSON.stringify(l.material) : ""
        }`,
    )
    .join("|");
  return `${incident}>>${body}>>${substrate}`;
}
