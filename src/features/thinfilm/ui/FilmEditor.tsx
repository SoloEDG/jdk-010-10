import { useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Layers,
  FlaskConical,
} from "lucide-react";
import type {
  CustomMaterial,
  Element,
  FilmLayer,
  Polarization,
} from "../../../shared/document";
import { builtinMaterials } from "../lib/materials";
import { makeLayer, stackPresets } from "../lib/presets";

const dielectrics = builtinMaterials.filter((m) => m.kind !== "gas");
const gases = builtinMaterials.filter((m) => m.kind === "gas");

export function FilmEditor({
  element,
  onUpdate,
}: {
  element: Element;
  onUpdate: (patch: Partial<Element>) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const layers = element.layers ?? [];

  const updateLayer = (id: string, patch: Partial<FilmLayer>) =>
    onUpdate({
      layers: layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= layers.length) return;
    const next = [...layers];
    [next[i], next[j]] = [next[j], next[i]];
    onUpdate({ layers: next });
  };

  const remove = (id: string) =>
    onUpdate({ layers: layers.filter((l) => l.id !== id) });

  const addLayer = (materialId: string) =>
    onUpdate({ layers: [...layers, makeLayer(materialId, 80)] });

  const applyPreset = (id: string) => {
    const p = stackPresets.find((x) => x.id === id);
    if (!p) return;
    onUpdate({
      layers: p.build(),
      incidentMaterial: p.incident,
      substrateMaterial: p.substrate,
    });
  };

  return (
    <div className="film-editor">
      <div className="section-title">
        膜层结构 <Layers size={14} />
      </div>

      <div className="film-row">
        <label>
          <small>入射介质</small>
          <select
            aria-label="入射介质"
            value={element.incidentMaterial ?? "builtin:air"}
            onChange={(e) => onUpdate({ incidentMaterial: e.target.value })}
          >
            {[...gases, ...dielectrics].map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <small>偏振</small>
          <select
            aria-label="偏振"
            value={element.polarization ?? "unpolarized"}
            onChange={(e) =>
              onUpdate({ polarization: e.target.value as Polarization })
            }
          >
            <option value="unpolarized">非偏振 (s+p 均值)</option>
            <option value="s">s 偏振 (TE)</option>
            <option value="p">p 偏振 (TM)</option>
          </select>
        </label>
      </div>

      <div className="film-stack" role="list" aria-label="膜层顺序，入射侧到基底侧">
        <div className="film-boundary">
          <i>入射侧</i>
        </div>
        {layers.length === 0 && (
          <p className="film-empty">尚无膜层 · 从下方添加或套用模板</p>
        )}
        {layers.map((l, i) => (
          <FilmRow
            key={l.id}
            layer={l}
            index={i}
            total={layers.length}
            onPatch={(p) => updateLayer(l.id, p)}
            onMove={(dir) => move(i, dir)}
            onRemove={() => remove(l.id)}
          />
        ))}
        <div className="film-boundary">
          <i>基底侧</i>
          <select
            aria-label="基底材料"
            value={element.substrateMaterial ?? "builtin:bk7"}
            onChange={(e) => onUpdate({ substrateMaterial: e.target.value })}
          >
            {dielectrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="film-add">
        <select
          aria-label="选择材料添加膜层"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) addLayer(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="">选择材料添加膜层…</option>
          {dielectrics.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          className="mini-button"
          title="添加自定义材料膜层"
          onClick={() => setShowCustom((v) => !v)}
        >
          <FlaskConical size={13} /> 自定义
        </button>
      </div>

      {showCustom && (
        <CustomMaterialForm
          onAdd={(mat) => {
            onUpdate({
              layers: [
                ...layers,
                {
                  id: makeLayer("custom", 80).id,
                  thickness: 80,
                  materialId: `custom:${mat.name}`,
                  material: mat,
                },
              ],
            });
            setShowCustom(false);
          }}
          onCancel={() => setShowCustom(false)}
        />
      )}

      <div className="film-presets">
        <small>膜系模板</small>
        <div>
          {stackPresets.map((p) => (
            <button
              key={p.id}
              className="preset-chip"
              title={p.description}
              onClick={() => applyPreset(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilmRow({
  layer,
  index,
  total,
  onPatch,
  onMove,
  onRemove,
}: {
  layer: FilmLayer;
  index: number;
  total: number;
  onPatch: (p: Partial<FilmLayer>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const mat = builtinMaterials.find((m) => m.id === layer.materialId);
  return (
    <div className="film-row-card" role="listitem">
      <div className="film-row-head">
        <span className="film-index">#{index + 1}</span>
        <strong>{layer.material?.name ?? mat?.name ?? layer.materialId}</strong>
        <span className="film-kind">
          {mat?.kind === "metal" ? "金属" : "介质"}
        </span>
        <div className="film-row-actions">
          <button
            aria-label="上移"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={12} />
          </button>
          <button
            aria-label="下移"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={12} />
          </button>
          <button aria-label="删除膜层" onClick={onRemove}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div className="film-row-body">
        {!layer.material && (
          <select
            aria-label="膜层材料"
            value={layer.materialId}
            onChange={(e) => onPatch({ materialId: e.target.value })}
          >
            {dielectrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <label className="thickness">
          <small>厚度</small>
          <input
            aria-label="膜层厚度 nm"
            type="number"
            min={0}
            max={100000}
            value={layer.thickness}
            onChange={(e) =>
              onPatch({
                thickness: Math.max(
                  0,
                  Math.min(100000, Number(e.target.value) || 0),
                ),
              })
            }
          />
          <em>nm</em>
        </label>
      </div>
    </div>
  );
}

function CustomMaterialForm({
  onAdd,
  onCancel,
}: {
  onAdd: (mat: CustomMaterial) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("自定义材料");
  const [n, setN] = useState(1.5);
  const [k, setK] = useState(0);
  const [B, setB] = useState(0.004);
  return (
    <div className="custom-material">
      <input
        aria-label="材料名称"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="材料名称"
      />
      <div className="custom-grid">
        <label>
          <small>n (A)</small>
          <input
            type="number"
            step="0.01"
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
          />
        </label>
        <label>
          <small>k</small>
          <input
            type="number"
            step="0.01"
            min="0"
            value={k}
            onChange={(e) => setK(Number(e.target.value))}
          />
        </label>
        <label>
          <small>Cauchy B</small>
          <input
            type="number"
            step="0.001"
            value={B}
            onChange={(e) => setB(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="custom-actions">
        <button
          className="mini-button primary"
          onClick={() =>
            onAdd({
              name: name || "自定义材料",
              cauchy: { A: n, B, C: 0, k0: k },
            })
          }
        >
          <Plus size={13} /> 添加膜层
        </button>
        <button className="mini-button" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
