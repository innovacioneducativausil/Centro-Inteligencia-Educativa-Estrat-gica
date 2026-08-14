import React, { useEffect, useMemo, useState } from 'react';
import { Radar as RadarIcon, Loader2 } from 'lucide-react';
import { ThemeColors } from '../types';
import { getPestel, getSenales, getTendencias, getEscenarios, PestelItem, ApiSignal, ApiTrend, ApiScenario } from '../services/apiService';

interface StrategicRadarChartProps {
  themeColors: ThemeColors;
  setActiveView: (view: string) => void;
  setRadarTab: (tab: 'señales' | 'tendencias' | 'escenarios') => void;
}

type ItemType = 'señal' | 'tendencia' | 'escenario';

interface RadarPoint {
  uuid: string;
  title: string;
  emoji: string;
  type: ItemType;
  categoryIndex: number;
  categoryLabel: string;
  categoryColor: string;
  ringIndex: number;
  ringLabel: string;
}

const RING_LABELS = ['Señales', 'Corto plazo', 'Medio plazo', 'Largo plazo'];
const RING_BOUNDS = [0, 0.40, 0.60, 0.80, 1.0];

const TYPE_STYLE: Record<ItemType, { r: number; shape: 'circle' | 'diamond' | 'triangle' }> = {
  señal:     { r: 3.2, shape: 'circle' },
  tendencia: { r: 4.4, shape: 'diamond' },
  escenario: { r: 5.4, shape: 'triangle' },
};

function seededRandom(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  h ^= h >>> 16;
  return ((h >>> 0) % 10000) / 10000;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function horizonToRing(type: ItemType, horizon: string | null | undefined): number {
  if (type === 'señal') return 0;
  if (type === 'tendencia') {
    const h = (horizon || '').toLowerCase();
    if (h.includes('corto')) return 1;
    if (h.includes('medio')) return 2;
    if (h.includes('largo')) return 3;
    return 2;
  }
  const h = (horizon || '').toLowerCase().trim();
  if (!h || h === 'largo_plazo') return 3;
  const year = parseInt(h, 10);
  if (!isNaN(year)) {
    if (year <= 2028) return 1;
    if (year <= 2033) return 2;
    return 3;
  }
  return 3;
}

const StrategicRadarChart: React.FC<StrategicRadarChartProps> = ({ themeColors, setActiveView, setRadarTab }) => {
  const isDark = themeColors.bg.includes('950') || themeColors.bg.includes('slate-900');

  const C = {
    primary:          isDark ? '#b1c5ff' : '#001a48',
    secondary:        isDark ? '#38debb' : '#006b58',
    surface:          isDark ? '#0f172a' : '#f7f9fc',
    surfaceLowest:    isDark ? '#0f172a' : '#ffffff',
    onSurface:        isDark ? '#e2e8f4' : '#191c1e',
    onSurfaceVariant: isDark ? '#94a3b8' : '#444651',
    outlineVariant:   isDark ? 'rgba(255,255,255,0.10)' : 'rgba(196,198,210,0.6)',
  };

  const [pestel, setPestel]     = useState<PestelItem[] | null>(null);
  const [senales, setSenales]   = useState<ApiSignal[] | null>(null);
  const [tendencias, setTendencias] = useState<ApiTrend[] | null>(null);
  const [escenarios, setEscenarios] = useState<ApiScenario[] | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [hovered, setHovered]   = useState<RadarPoint | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    Promise.all([getPestel(), getSenales(), getTendencias(), getEscenarios()])
      .then(([p, s, t, e]) => {
        setPestel([...p.data].sort((a, b) => a.orden_display - b.orden_display));
        setSenales(s.data);
        setTendencias(t.data);
        setEscenarios(e.data);
      })
      .catch(err => setError(err.message || 'Error al cargar el radar'))
      .finally(() => setLoading(false));
  }, []);

  const { points, categorySlices, skippedCount } = useMemo(() => {
    if (!pestel || !senales || !tendencias || !escenarios) {
      return { points: [] as RadarPoint[], categorySlices: [] as PestelItem[], skippedCount: 0 };
    }
    const slugIndex = new Map(pestel.map((p, i) => [p.slug_pestel, i]));
    let skipped = 0;
    const pts: RadarPoint[] = [];

    const push = (uuid: string, title: string, emoji: string, type: ItemType, pestelSlug: string | null, color: string, horizon: string | null) => {
      const idx = pestelSlug != null ? slugIndex.get(pestelSlug) : undefined;
      if (idx === undefined) { skipped++; return; }
      const ringIndex = horizonToRing(type, horizon);
      pts.push({
        uuid, title, emoji, type,
        categoryIndex: idx,
        categoryLabel: pestel[idx].nombre_pestel,
        categoryColor: color || pestel[idx].color,
        ringIndex,
        ringLabel: RING_LABELS[ringIndex],
      });
    };

    senales.forEach(s => push(s.uuid, s.title, s.emoji, 'señal', s.pestelSlug, s.color, null));
    tendencias.forEach(t => push(t.uuid, t.name, t.emoji, 'tendencia', t.pestelSlug, t.color, t.horizon));
    escenarios.forEach(e => push(e.uuid, e.title, e.emoji, 'escenario', e.pestelSlug, e.color, e.horizon));

    return { points: pts, categorySlices: pestel, skippedCount: skipped };
  }, [pestel, senales, tendencias, escenarios]);

  const size = 640;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 270;
  const sliceAngle = categorySlices.length ? 360 / categorySlices.length : 60;

  const placedPoints = useMemo(() => {
    return points.map(pt => {
      const bandStart = RING_BOUNDS[pt.ringIndex] * maxR;
      const bandEnd = RING_BOUNDS[pt.ringIndex + 1] * maxR;
      const pad = 5;
      const rx = seededRandom(pt.uuid + 'r');
      const ax = seededRandom(pt.uuid + 'a');
      const r = bandStart + pad + rx * Math.max(0, bandEnd - bandStart - pad * 2);
      const angleStart = pt.categoryIndex * sliceAngle + 3;
      const angleEnd = (pt.categoryIndex + 1) * sliceAngle - 3;
      const angle = angleStart + ax * (angleEnd - angleStart);
      const { x, y } = polar(cx, cy, r, angle);
      return { ...pt, x, y };
    });
  }, [points, sliceAngle]);

  const solidCardBg = C.surfaceLowest;

  return (
    <section className="py-16 px-8" style={{ background: C.surface }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <h2
              className="text-3xl font-extrabold mb-1"
              style={{ fontFamily: "'Manrope', 'Bricolage Grotesque', sans-serif", color: C.primary }}
            >
              Radar Estratégico
            </h2>
            <p style={{ color: C.onSurfaceVariant }}>
              Señales, tendencias y escenarios distribuidos por categoría PESTEL y horizonte temporal.
            </p>
          </div>
        </div>

        <div
          className="rounded-3xl p-8 relative"
          style={{ background: solidCardBg, border: `1px solid ${C.outlineVariant}` }}
        >
          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3" style={{ color: C.onSurfaceVariant }}>
              <Loader2 size={28} className="animate-spin" style={{ color: C.secondary }} />
              <p className="text-sm font-bold">Cargando radar estratégico…</p>
            </div>
          ) : error ? (
            <div className="py-24 flex flex-col items-center justify-center gap-2" style={{ color: '#dc2626' }}>
              <p className="text-sm font-bold">{error}</p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-[1fr_260px] gap-8 items-center">
              <div className="relative flex justify-center">
                <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[640px]" role="img" aria-label="Radar estratégico de señales, tendencias y escenarios">

                  {categorySlices.map((p, i) => {
                    const startAngle = i * sliceAngle;
                    const endAngle = (i + 1) * sliceAngle;
                    const p1 = polar(cx, cy, maxR, startAngle);
                    const p2 = polar(cx, cy, maxR, endAngle);
                    const large = sliceAngle > 180 ? 1 : 0;
                    return (
                      <path
                        key={p.slug_pestel}
                        d={`M ${cx} ${cy} L ${p1.x} ${p1.y} A ${maxR} ${maxR} 0 ${large} 1 ${p2.x} ${p2.y} Z`}
                        fill={p.color}
                        opacity={isDark ? 0.08 : 0.05}
                      />
                    );
                  })}

                  {categorySlices.map((p, i) => {
                    const a = i * sliceAngle;
                    const pt = polar(cx, cy, maxR, a);
                    return <line key={`div-${p.slug_pestel}`} x1={cx} y1={cy} x2={pt.x} y2={pt.y} stroke={C.outlineVariant} strokeWidth={1} />;
                  })}

                  {RING_BOUNDS.slice(1).map(b => (
                    <circle key={b} cx={cx} cy={cy} r={b * maxR} fill="none" stroke={C.outlineVariant} strokeWidth={1} strokeDasharray="3 4" />
                  ))}

                  {RING_LABELS.map((label, i) => {
                    const r = ((RING_BOUNDS[i] + RING_BOUNDS[i + 1]) / 2) * maxR;
                    const y = cy - r;
                    return (
                      <text key={label} x={cx + 4} y={y - 3} fontSize={9} fontWeight={800} fill={C.onSurfaceVariant} letterSpacing={0.5}>
                        {label.toUpperCase()}
                      </text>
                    );
                  })}

                  {categorySlices.map((p, i) => {
                    const midAngle = i * sliceAngle + sliceAngle / 2;
                    const labelR = maxR + 26;
                    const { x, y } = polar(cx, cy, labelR, midAngle);
                    return (
                      <text
                        key={`label-${p.slug_pestel}`}
                        x={x} y={y}
                        fontSize={11} fontWeight={900}
                        fill={C.primary}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {p.emoji} {p.letra_codigo}
                      </text>
                    );
                  })}

                  {placedPoints.map(pt => {
                    const style = TYPE_STYLE[pt.type];
                    const isHovered = hovered?.uuid === pt.uuid;
                    const common = {
                      key: pt.uuid,
                      fill: pt.categoryColor,
                      opacity: isHovered ? 1 : 0.82,
                      stroke: isHovered ? C.onSurface : 'none',
                      strokeWidth: isHovered ? 1.5 : 0,
                      style: { cursor: 'pointer', transition: 'opacity 0.15s' },
                      onMouseEnter: () => { setHovered(pt); setHoverPos({ x: pt.x, y: pt.y }); },
                      onMouseLeave: () => { setHovered(null); setHoverPos(null); },
                      onClick: () => { setRadarTab(pt.type === 'señal' ? 'señales' : pt.type === 'tendencia' ? 'tendencias' : 'escenarios'); setActiveView('radar'); },
                    };
                    if (style.shape === 'circle') return <circle {...common} cx={pt.x} cy={pt.y} r={isHovered ? style.r + 1.5 : style.r} />;
                    if (style.shape === 'diamond') {
                      const r = isHovered ? style.r + 1.5 : style.r;
                      return <rect {...common} x={pt.x - r} y={pt.y - r} width={r * 2} height={r * 2} transform={`rotate(45 ${pt.x} ${pt.y})`} />;
                    }
                    const r = isHovered ? style.r + 1.5 : style.r;
                    const p1 = `${pt.x},${pt.y - r}`;
                    const p2 = `${pt.x - r * 0.9},${pt.y + r * 0.75}`;
                    const p3 = `${pt.x + r * 0.9},${pt.y + r * 0.75}`;
                    return <polygon {...common} points={`${p1} ${p2} ${p3}`} />;
                  })}

                  <circle cx={cx} cy={cy} r={RING_BOUNDS[0] * maxR + 14} fill={solidCardBg} stroke={C.outlineVariant} strokeWidth={1} />
                  <text x={cx} y={cy - 4} fontSize={10} fontWeight={900} fill={C.primary} textAnchor="middle">{points.length}</text>
                  <text x={cx} y={cy + 10} fontSize={7} fontWeight={800} fill={C.onSurfaceVariant} textAnchor="middle" letterSpacing={0.5}>SEÑALES</text>
                </svg>

                {hovered && hoverPos && (
                  <div
                    className="absolute pointer-events-none px-3 py-2 rounded-xl shadow-xl text-left z-20"
                    style={{
                      left: `calc(${(hoverPos.x / size) * 100}% )`,
                      top: `calc(${(hoverPos.y / size) * 100}% - 10px)`,
                      transform: 'translate(-50%, -100%)',
                      background: isDark ? '#1e293b' : '#ffffff',
                      border: `1px solid ${C.outlineVariant}`,
                      maxWidth: 220,
                    }}
                  >
                    <p className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: hovered.categoryColor }}>
                      {hovered.emoji} {hovered.type} · {hovered.ringLabel}
                    </p>
                    <p className="text-xs font-bold leading-snug" style={{ color: C.onSurface }}>{hovered.title}</p>
                    <p className="text-[10px] font-medium mt-0.5" style={{ color: C.onSurfaceVariant }}>{hovered.categoryLabel}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-6">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: C.onSurfaceVariant }}>Categorías PESTEL</p>
                  <div className="flex flex-col gap-1.5">
                    {categorySlices.map(p => (
                      <div key={p.slug_pestel} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
                        <span className="text-xs font-semibold" style={{ color: C.onSurface }}>{p.emoji} {p.nombre_pestel}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: C.onSurfaceVariant }}>Tipo de hallazgo</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <svg width={12} height={12}><circle cx={6} cy={6} r={4} fill={C.onSurfaceVariant} /></svg>
                      <span className="text-xs font-semibold" style={{ color: C.onSurface }}>Señal ({senales?.length ?? 0})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg width={12} height={12}><rect x={2} y={2} width={8} height={8} fill={C.onSurfaceVariant} transform="rotate(45 6 6)" /></svg>
                      <span className="text-xs font-semibold" style={{ color: C.onSurface }}>Tendencia ({tendencias?.length ?? 0})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg width={12} height={12}><polygon points="6,1 11,10 1,10" fill={C.onSurfaceVariant} /></svg>
                      <span className="text-xs font-semibold" style={{ color: C.onSurface }}>Escenario ({escenarios?.length ?? 0})</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: C.onSurfaceVariant }}>Horizonte</p>
                  <p className="text-xs leading-relaxed" style={{ color: C.onSurfaceVariant }}>
                    El centro agrupa señales recién detectadas; los anillos exteriores ubican tendencias y escenarios según su horizonte de realización estimado.
                  </p>
                </div>

                <button
                  onClick={() => { setRadarTab('señales'); setActiveView('radar'); }}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs transition-all hover:opacity-90"
                  style={{ background: '#002d72', color: '#ffffff' }}
                >
                  <RadarIcon size={13} /> Explorar en detalle
                </button>

                {skippedCount > 0 && (
                  <p className="text-[10px]" style={{ color: C.onSurfaceVariant }}>{skippedCount} elementos sin categoría PESTEL no se muestran.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default StrategicRadarChart;
