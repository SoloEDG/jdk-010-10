import { useMemo } from "react";
import { Gauge } from "lucide-react";
import type { Element, TraceResult } from "../../../shared/document";
import { filmAt, materialName } from "../../optics/lib/trace";
import {
  defaultIncidentMaterial,
  defaultSubstrateMaterial,
} from "../lib/materials";

/**
 * 薄膜能量去向面板：
 * - 实时单点 R/T/A（使用当前布局，随编辑立即重算）
 * - 各膜层吸收分解
 * - 全实验台能量收支与全反射标记
 */
export function EnergyBudgetPanel({
  film,
  trace,
}: {
  film?: Element;
  trace: TraceResult;
}) {
  const point = useMemo(() => {
    if (!film) return null;
    return filmAt(film, film.wavelength || 550, 0);
  }, [film]);

  const losses = useMemo(() => {
    if (!film) return [];
    return trace.filmLosses.filter((l) => l.film === film.id);
  }, [film, trace.filmLosses]);

  const b = trace.budget;
  const pct = (v: number) =>
    b.emitted > 0 ? `${((100 * v) / b.emitted).toFixed(1)}%` : "0%";

  return (
    <section className="energy-budget">
      <div className="section-title">
        能量收支 <Gauge size={14} />
      </div>

      {film && point && (
        <div className="budget-block">
          <small className="budget-caption">
            单点响应 · λ={film.wavelength} nm · 正入射 ·{" "}
            {materialName(
              film.incidentMaterial ?? defaultIncidentMaterial,
            )}{" "}
            → {materialName(film.substrateMaterial ?? defaultSubstrateMaterial)}
          </small>
          <EnergyBar
            segments={[
              { label: "反射 R", value: point.r, color: "#8ec9ff" },
              { label: "透射 T", value: point.t, color: "#b5eb78" },
              { label: "吸收 A", value: point.absorbed, color: "#f0a35e" },
            ]}
          />
          <div className="rta-grid">
            <RtaCell label="反射率 R" value={point.r} hint={`Rs=${point.rs.toFixed(3)} Rp=${point.rp.toFixed(3)}`} />
            <RtaCell label="透射率 T" value={point.t} hint={`Ts=${point.ts.toFixed(3)} Tp=${point.tp.toFixed(3)}`} />
            <RtaCell label="吸收率 A" value={point.absorbed} hint={point.tir ? "全反射 TIR" : "膜内耗散"} alert={point.tir} />
          </div>

          {point.layerAbsorption.some((v) => v > 1e-6) && (
            <div className="layer-abs">
              <small>各层吸收（占入射功率）</small>
              {film.layers?.map((l, i) =>
                point.layerAbsorption[i] > 1e-6 ? (
                  <div className="layer-abs-row" key={l.id}>
                    <span>
                      #{i + 1}{" "}
                      {l.material?.name ?? materialName(l.materialId)}
                    </span>
                    <i>
                      <u
                        style={{
                          width: `${Math.min(100, point.layerAbsorption[i] * 100)}%`,
                        }}
                      />
                    </i>
                    <b>{(point.layerAbsorption[i] * 100).toFixed(2)}%</b>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </div>
      )}

      <div className="budget-block">
        <small className="budget-caption">全实验台能量去向（相对光源总功率）</small>
        <EnergyBar
          segments={[
            { label: "接收屏", value: b.onScreen, color: "#b5eb78" },
            { label: "吸收", value: b.absorbed, color: "#f0a35e" },
            { label: "反射回空间", value: b.reflected, color: "#8ec9ff" },
            { label: "逃逸/截断", value: b.escaped, color: "#6b7e8d" },
          ]}
        />
        <dl className="budget-list">
          <BudgetRow label="光源发射" value={`${b.emitted.toFixed(3)} W`} pct="100%" />
          <BudgetRow label="落到接收屏" value={`${b.onScreen.toFixed(3)} W`} pct={pct(b.onScreen)} />
          <BudgetRow label="薄膜/棱镜吸收" value={`${b.absorbed.toFixed(3)} W`} pct={pct(b.absorbed)} />
          <BudgetRow label="反射回空间" value={`${b.reflected.toFixed(3)} W`} pct={pct(b.reflected)} />
          <BudgetRow label="逃逸 / 追迹截断" value={`${b.escaped.toFixed(3)} W`} pct={pct(b.escaped)} />
          {b.tir > 0 && (
            <BudgetRow label="其中全反射 TIR" value={`${b.tir.toFixed(3)} W`} pct={pct(b.tir)} alert />
          )}
        </dl>
        <small className="budget-check">
          守恒校验：屏+吸收+反射+逃逸 ={" "}
          {(
            b.onScreen + b.absorbed + b.reflected + b.escaped
          ).toFixed(4)}{" "}
          W / 发射 {b.emitted.toFixed(4)} W
          {b.residual > 1e-9 ? ` · 残差 ${b.residual.toExponential(1)}` : " · ✓ 平衡"}
        </small>
      </div>

      {losses.length > 0 && (
        <div className="budget-block">
          <small className="budget-caption">
            本次追迹中薄膜交互 {losses.length} 次
            {losses.some((l) => l.tir) ? " · 含全反射事件" : ""}
          </small>
        </div>
      )}
    </section>
  );
}

function RtaCell({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: number;
  hint: string;
  alert?: boolean;
}) {
  return (
    <div className={alert ? "rta-cell alert" : "rta-cell"}>
      <small>{label}</small>
      <strong>{(value * 100).toFixed(2)}%</strong>
      <em>{hint}</em>
    </div>
  );
}

function BudgetRow({
  label,
  value,
  pct,
  alert,
}: {
  label: string;
  value: string;
  pct: string;
  alert?: boolean;
}) {
  return (
    <div className={alert ? "budget-row alert" : "budget-row"}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      <em>{pct}</em>
    </div>
  );
}

function EnergyBar({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="energy-bar" role="img" aria-label="能量分配条形图">
      {segments.map((s) => (
        <i
          key={s.label}
          title={`${s.label} ${(s.value * 100).toFixed(2)}%`}
          style={{
            width: `${(s.value / total) * 100}%`,
            background: s.color,
          }}
        />
      ))}
    </div>
  );
}
