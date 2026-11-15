import type { LabDocument } from "../../../shared/document";
import { defaultIncidentMaterial, defaultSubstrateMaterial } from "../../thinfilm/lib/materials";

export function saveDocument(doc: LabDocument) {
  localStorage.setItem("lumen-document", JSON.stringify(doc));
}

export function loadDocument(): LabDocument | null {
  try {
    const v = JSON.parse(localStorage.getItem("lumen-document") ?? "null");
    if (v?.version !== 1 || !Array.isArray(v.items) || v.items.length > 80)
      return null;
    for (const e of v.items) {
      if (
        !["source", "mirror", "lens", "prism", "film", "screen"].includes(
          e.kind,
        ) ||
        typeof e.id !== "string"
      )
        return null;
      for (const k of [
        "x",
        "y",
        "angle",
        "size",
        "power",
        "rays",
        "spread",
        "wavelength",
        "focal",
        "index",
      ])
        if (!Number.isFinite(e[k])) return null;
      if (
        e.rays < 1 ||
        e.rays > 41 ||
        e.size <= 0 ||
        e.focal === 0 ||
        (e.kind !== "film" && e.index < 1)
      )
        return null;
      if (e.kind === "film") {
        if (!Array.isArray(e.layers)) return null;
        if (e.layers.length > 200) return null;
        for (const l of e.layers) {
          if (
            typeof l.id !== "string" ||
            !Number.isFinite(l.thickness) ||
            l.thickness < 0 ||
            l.thickness > 100000 ||
            typeof l.materialId !== "string"
          )
            return null;
        }
        // 补齐可选字段，兼容旧会话
        e.incidentMaterial ??= defaultIncidentMaterial;
        e.substrateMaterial ??= defaultSubstrateMaterial;
        e.polarization ??= "unpolarized";
      }
    }
    return v;
  } catch {
    return null;
  }
}
