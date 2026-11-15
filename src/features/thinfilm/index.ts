export { FilmEditor } from "./ui/FilmEditor";
export { EnergyBudgetPanel } from "./ui/EnergyBudgetPanel";
export { ScanPanel } from "./ui/ScanPanel";
export { solveStack, transmittedAngle } from "./lib/tmm";
export type { StackInput, StackResult } from "./lib/tmm";
export {
  builtinMaterials,
  getMaterial,
  resolveIndex,
  customMaterialIndex,
} from "./lib/materials";
export { stackPresets, stackFingerprint, makeLayer } from "./lib/presets";
export {
  runScan,
  runScanAsync,
  defaultScanConfig,
} from "./lib/scan";
export type { ScanConfig, ScanReport, ScanPoint } from "./lib/scan";
