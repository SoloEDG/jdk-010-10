import { useMemo, useRef, useState } from "react";
import { Play, X, LineChart, Grid3x3, MousePointerClick, History } from "lucide-react";
import type { Element } from "../../../shared/document";
import {
  defaultScanConfig,
  runScanAsync,
  type ScanConfig,
  type ScanReport,
  type ScanAxis,
} from "../lib/scan";
import { stackFingerprint } from "../lib/presets";
import {
  defaultIncidentMaterial,
  defaultSubstrateMaterial,
} from "../lib/materials";

/**
 * 扫描面板：
 * - 启动时对膜系做深拷贝快照 + 指纹；扫描期间编辑层序不会覆盖进行中/已完成的曲线
 * - 多份报告并存，指纹与当前布局不一致的旧报告标记“布局已变更”，仍可比较
 * - 应用某个扫描点 = 用【当前布局】重算并写回光源波长/角度，作为一次可撤销编辑
 */
export function ScanPanel({
  film,
  onApplyPoint,
}: {
  film?: Element;
  onApplyPoint: (wavelength: number, angle: number) => void;
}) {
  const [config, setConfig] = useState<ScanConfig | null>(null);
  const [reports, setReports] = useState<ScanReport[]>([]);
  const [running, setRunning] = useState<{ id: number; done: number; total: number } | null>(
    null,
  );
  const [selectedPoint, setSelectedPoint] = useState<{
    reportId: string;
    index: number;
  } | null>(null);
  const cancelRef = useRef(false);
  const runId = useRef(0);

  const currentFingerprint = useMemo(() => {
    if (!film) return "";
    return stackFingerprint(
      film.layers ?? [],
      film.incidentMaterial ?? defaultIncidentMaterial,
      film.substrateMaterial ?? defaultSubstrateMaterial,
    );
  }, [film]);

  const start = async (twoDim: boolean) => {
    if (!film || running) return;
    const base =
      config ??
      defaultScanConfig(
        film.polarization ?? "unpolarized",
        film.incidentMaterial ?? defaultIncidentMaterial,
        film.substrateMaterial ?? defaultSubstrateMaterial,
      );
    const next: ScanConfig = twoDim
      ? {
          ...base,
          xAxis: "wavelength",
          yAxis: "angle",
          yStart: base.yStart ?? 0,
          yEnd: base.yEnd ?? 80,
          ySteps: base.ySteps ?? 18,
          fixedAngle: base.fixedAngle,
          fixedWavelength: base.fixedWavelength,
        }
      : { ...base, yAxis: undefined };
    setConfig(next);
    const snapshot = {
      layers: structuredClone(film.layers ?? []),
      incidentMaterial: film.incidentMaterial ?? defaultIncidentMaterial,
      substrateMaterial: film.substrateMaterial ?? defaultSubstrateMaterial,
      fingerprint: currentFingerprint,
    };
    const id = ++runId.current;
    cancelRef.current = false;
    setRunning({ id, done: 0, total: 1 });
    const report = await runScanAsync(
      next,
      snapshot,
      (done, total) => {
        if (runId.current === id) setRunning({ id, done, total });
      },
      () => cancelRef.current,
    );
    if (runId.current === id) {
      setReports((rs) => [report, ...rs].slice(0, 6));
      setRunning(null);
      setSelectedPoint({ reportId: report.id, index: 0 });
    }
  };

  const stop = () => {
    cancelRef.current = true;
  };

  if (!film)
    return (
      <section className="scan-panel">
        <div className="section-title">
          角度 / 波长扫描 <LineChart size={14} />
        </div>
        <p className="muted">在实验台添加并选中“多层薄膜”后即可扫描。</p>
      </section>
    );

  const cfg =
    config ??
    defaultScanConfig(
      film.polarization ?? "unpolarized",
      film.incidentMaterial ?? defaultIncidentMaterial,
      film.substrateMaterial ?? defaultSubstrateMaterial,
    );
  const patch = (p: Partial<ScanConfig>) => setConfig({ ...cfg, ...p });

  return (
    <section className="scan-panel">
      <div className="section-title">
        角度 / 波长扫描 <LineChart size={14} />
      </div>

      <div className="scan-controls">
        <div className="scan-axis-row">
          <label>
            <small>横轴</small>
            <select
              value={cfg.xAxis}
              onChange={(e) => patch({ xAxis: e.target.value as ScanAxis })}
            >
              <option value="wavelength">波长 λ (nm)</option>
              <option value="angle">入射角 θ (°)</option>
            </select>
          </label>
          <label>
            <small>起点</small>
            <input
              type="number"
              value={cfg.xStart}
              onChange={(e) => patch({ xStart: Number(e.target.value) })}
            />
          </label>
          <label>
            <small>终点</small>
            <input
              type="number"
              value={cfg.xEnd}
              onChange={(e) => patch({ xEnd: Number(e.target.value) })}
            />
          </label>
          <label>
            <small>采样</small>
            <input
              type="number"
              min={8}
              max={400}
              value={cfg.xSteps}
              onChange={(e) => patch({ xSteps: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="scan-axis-row">
          <label>
            <small>固定 {cfg.xAxis === "wavelength" ? "入射角" : "波长"}</small>
            <input
              type="number"
              value={
                cfg.xAxis === "wavelength" ? cfg.fixedAngle : cfg.fixedWavelength
              }
              onChange={(e) =>
                cfg.xAxis === "wavelength"
                  ? patch({ fixedAngle: Number(e.target.value) })
                  : patch({ fixedWavelength: Number(e.target.value) })
              }
            />
          </label>
          <div className="scan-buttons">
            {running ? (
              <button className="mini-button" onClick={stop}>
                <X size={13} /> 停止
              </button>
            ) : (
              <>
                <button className="mini-button primary" onClick={() => start(false)}>
                  <Play size={13} /> 一维扫描
                </button>
                <button className="mini-button" onClick={() => start(true)}>
                  <Grid3x3 size={13} /> 二维扫描
                </button>
              </>
            )}
          </div>
        </div>
        {running && (
          <div className="scan-progress">
            <i style={{ width: `${(running.done / running.total) * 100}%` }} />
            <small>
              计算中 {running.done}/{running.total}
            </small>
          </div>
        )}
      </div>

      {reports.length === 0 && !running && (
        <p className="muted">配置范围后启动扫描；旧报告在编辑膜系后仍保留可比较。</p>
      )}

      {reports.map((report) => {
        const stale = report.fingerprint !== currentFingerprint;
        const selected =
          selectedPoint?.reportId === report.id
            ? report.points[Math.min(selectedPoint.index, report.points.length - 1)]
            : undefined;
        return (
          <div key={report.id} className="scan-report">
            <div className="scan-report-head">
              <History size={12} />
              <span>
                {report.config.xAxis === "wavelength" ? "λ" : "θ"} 扫描 ·{" "}
                {report.points.length} 点
                {report.ySteps > 0 ? ` · ${report.ySteps} 行二维` : ""}
              </span>
              {stale && <em className="stale-badge">布局已变更 · 只读快照</em>}
              {report.stale && <em className="cancel-badge">已中断</em>}
              <button
                aria-label="关闭报告"
                onClick={() =>
                  setReports((rs) => rs.filter((r) => r.id !== report.id))
                }
              >
                <X size={12} />
              </button>
            </div>
            {report.ySteps > 0 ? (
              <Heatmap
                report={report}
                onPick={(index) =>
                  setSelectedPoint({ reportId: report.id, index })
                }
                pickedIndex={
                  selectedPoint?.reportId === report.id
                    ? selectedPoint.index
                    : -1
                }
              />
            ) : (
              <ScanChart
                report={report}
                onPick={(index) =>
                  setSelectedPoint({ reportId: report.id, index })
                }
                pickedIndex={
                  selectedPoint?.reportId === report.id
                    ? selectedPoint.index
                    : -1
                }
              />
            )}
            {selected && (
              <div className="scan-point">
                <span>
                  λ={selected.wavelength.toFixed(1)} nm · θ=
                  {selected.angle.toFixed(2)}° · R=
                  {(selected.result.r * 100).toFixed(1)}% · T=
                  {(selected.result.t * 100).toFixed(1)}% · A=
                  {(selected.result.absorbed * 100).toFixed(1)}%
                  {selected.result.tir ? " · TIR" : ""}
                </span>
                <button
                  className="mini-button primary"
                  title="以当前布局重算，并把该点波长/角度写回实验台（可撤销）"
                  onClick={() =>
                    onApplyPoint(selected.wavelength, selected.angle)
                  }
                >
                  <MousePointerClick size={13} /> 应用此点
                </button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** 一维 R/T/A 曲线（SVG） */
function ScanChart({
  report,
  onPick,
  pickedIndex,
}: {
  report: ScanReport;
  onPick: (index: number) => void;
  pickedIndex: number;
}) {
  const W = 600;
  const H = 150;
  const pts = report.points;
  const xOf = (p: (typeof pts)[number]) =>
    report.config.xAxis === "wavelength" ? p.wavelength : p.angle;
  const xMin = Math.min(...pts.map(xOf));
  const xMax = Math.max(...pts.map(xOf));
  const path = (sel: (r: (typeof pts)[number]["result"]) => number) =>
    pts
      .map((p, i) => {
        const x = ((xOf(p) - xMin) / (xMax - xMin || 1)) * W;
        const y = H - sel(p.result) * (H - 12) - 4;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  const picked = pickedIndex >= 0 ? pts[pickedIndex] : undefined;
  return (
    <div className="scan-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1="0"
            x2={W}
            y1={H * g}
            y2={H * g}
            stroke="#26323c"
            strokeDasharray="3 5"
          />
        ))}
        <path d={path((r) => r.r)} fill="none" stroke="#8ec9ff" strokeWidth="2" />
        <path d={path((r) => r.t)} fill="none" stroke="#b5eb78" strokeWidth="2" />
        <path
          d={path((r) => r.absorbed)}
          fill="none"
          stroke="#f0a35e"
          strokeWidth="2"
        />
        {picked && (
          <line
            x1={((xOf(picked) - xMin) / (xMax - xMin || 1)) * W}
            x2={((xOf(picked) - xMin) / (xMax - xMin || 1)) * W}
            y1="0"
            y2={H}
            stroke="#dce4eb"
            strokeDasharray="2 4"
          />
        )}
        {pts.map((p, i) => (
          <rect
            key={i}
            x={(i / pts.length) * W}
            y="0"
            width={W / pts.length}
            height={H}
            fill="transparent"
            onClick={() => onPick(i)}
          />
        ))}
      </svg>
      <div className="scan-legend">
        <span><i style={{ background: "#8ec9ff" }} />R</span>
        <span><i style={{ background: "#b5eb78" }} />T</span>
        <span><i style={{ background: "#f0a35e" }} />A</span>
        <em>
          {xMin}–{xMax} {report.config.xAxis === "wavelength" ? "nm" : "°"}
        </em>
      </div>
    </div>
  );
}

/** 二维反射率热图（λ × θ） */
function Heatmap({
  report,
  onPick,
  pickedIndex,
}: {
  report: ScanReport;
  onPick: (index: number) => void;
  pickedIndex: number;
}) {
  const rows = report.ySteps;
  const cols = report.points.length / rows;
  const color = (r: number) => {
    // 深蓝 → 青 → 绿 → 黄
    const hue = 220 - 220 * Math.min(1, Math.max(0, r));
    return `hsl(${hue}, 65%, ${28 + r * 28}%)`;
  };
  return (
    <div className="scan-heatmap" role="img" aria-label="反射率二维热图">
      {report.points.map((p, i) => (
        <button
          key={i}
          className={i === pickedIndex ? "cell picked" : "cell"}
          style={{ background: color(p.result.r) }}
          title={`λ=${p.wavelength.toFixed(0)}nm θ=${p.angle.toFixed(1)}° R=${(p.result.r * 100).toFixed(1)}%`}
          onClick={() => onPick(i)}
        />
      ))}
      <small className="heatmap-note">
        {rows} 行 × {cols} 列 · 颜色越亮反射率越高（点击选点）
      </small>
    </div>
  );
}
