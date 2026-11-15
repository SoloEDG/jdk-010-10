import type { Element } from "../../../shared/document";
import { prismVertices } from "../../../shared/geometry";
export function DeviceGlyph({
  e,
  selected,
}: {
  e: Element;
  selected: boolean;
}) {
  const color = selected ? "#a7f070" : "#89a3b7";
  return (
    <g>
      {selected && (
        <circle
          cx={e.x}
          cy={e.y}
          r={Math.max(25, e.size / 2 + 14)}
          fill="none"
          stroke="#a7f070"
          strokeDasharray="3 5"
          opacity=".35"
        />
      )}
      {e.kind === "prism" ? (
        <polygon
          points={prismVertices(e)
            .map((p) => `${p.x},${p.y}`)
            .join(" ")}
          fill="#78b5ff20"
          stroke="#9ecaff"
          strokeWidth="2"
        />
      ) : (
        <g transform={`translate(${e.x} ${e.y}) rotate(${e.angle})`}>
          {e.kind === "source" ? (
            <>
              <rect
                x="-23"
                y="-16"
                width="46"
                height="32"
                rx="8"
                fill="#343b23"
                stroke="#b9ed69"
              />
              <path d="M-8 -7 L8 0 -8 7Z" fill="#d7f79b" />
            </>
          ) : e.kind === "lens" ? (
            <path
              d={`M${-e.size / 2} 0 Q0 -22 ${e.size / 2} 0 Q0 22 ${-e.size / 2} 0`}
              fill="#8ed9fc30"
              stroke="#80cafa"
              strokeWidth="2"
            />
          ) : e.kind === "film" ? (
            <FilmGlyph e={e} />
          ) : e.kind === "screen" ? (
            <>
              <line
                x1={-e.size / 2}
                x2={e.size / 2}
                stroke="#d5dae5"
                strokeWidth="7"
              />
              <line
                x1={-e.size / 2}
                x2={e.size / 2}
                y1="5"
                y2="5"
                stroke="#606f80"
                strokeWidth="3"
              />
            </>
          ) : (
            <>
              <line
                x1={-e.size / 2}
                x2={e.size / 2}
                stroke="#d1e5f8"
                strokeWidth="4"
              />
              <line
                x1={-e.size / 2}
                x2={e.size / 2}
                y1="5"
                y2="5"
                stroke="#4f6477"
                strokeWidth="5"
              />
            </>
          )}
        </g>
      )}
      <circle cx={e.x} cy={e.y} r="4" fill={color} />
    </g>
  );
}

/** 多层薄膜：基板 + 按膜层数量绘制的彩色叠层（仅示意，不按真实厚度比例） */
function FilmGlyph({ e }: { e: Element }) {
  const layers = e.layers ?? [];
  const half = e.size / 2;
  const palette = ["#7ec8ff", "#ffd58a", "#c3a6ff", "#8fe6c6", "#ff9d9d"];
  const strip = Math.min(5, Math.max(1.5, 14 / Math.max(1, layers.length + 1)));
  return (
    <g>
      {/* 基板 */}
      <rect
        x={-half}
        y={6}
        width={e.size}
        height={9}
        rx={2}
        fill="#2c3c4c"
        stroke="#6b8aa6"
        strokeWidth={1.4}
      />
      {/* 膜层叠片，画在入射侧（基板上方） */}
      {layers.slice(0, 12).map((l, i) => (
        <rect
          key={l.id}
          x={-half}
          y={4 - (i + 1) * strip}
          width={e.size}
          height={strip}
          fill={palette[i % palette.length]}
          opacity={0.85}
        />
      ))}
      {layers.length > 12 && (
        <text x={half - 4} y={-10} fontSize={9} fill="#9fb4c7" textAnchor="end">
          +{layers.length - 12}
        </text>
      )}
      <line x1={-half} x2={half} stroke="#d1e5f8" strokeWidth={1.2} />
    </g>
  );
}
