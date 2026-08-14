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
const RING_BOUNDS = [0, 0.38, 0.60, 0.81, 1.0];

const TYPE_STYLE: Record<ItemType, { r: number; shape: 'circle' | 'diamond' | 'triangle' }> = {
  señal:     { r: 3.4, shape: 'circle' },
  tendencia: { r: 4.6, shape: 'diamond' },
  escenario: { r: 5.6, shape: 'triangle' },
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
  void themeColors;

  const [pestel, setPestel]     = useState<PestelItem[] | null>(null);
  const [senales, setSenales]   = useState<ApiSignal[] | null>(null);
  const [tendencias, setTendencias] = useState<ApiTrend[] | null>(null);
  const [escenarios, setEscenarios] = useState<ApiScenario[] | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [hovered, setHovered]   = useState<RadarPoint | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [activeType, setActiveType] = useState<ItemType | 'todos'>('todos');

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
  const maxR = 262;
  const sliceAngle = categorySlices.length ? 360 / categorySlices.length : 60;

  const visiblePoints = useMemo(
    () => (activeType === 'todos' ? points : points.filter(p => p.type === activeType)),
    [points, activeType]
  );

  const placedPoints = useMemo(() => {
    return visiblePoints.map(pt => {
      const bandStart = RING_BOUNDS[pt.ringIndex] * maxR;
      const bandEnd = RING_BOUNDS[pt.ringIndex + 1] * maxR;
      const pad = 6;
      const rx = seededRandom(pt.uuid + 'r');
      const ax = seededRandom(pt.uuid + 'a');
      const r = bandStart + pad + rx * Math.max(0, bandEnd - bandStart - pad * 2);
      const angleStart = pt.categoryIndex * sliceAngle + 3;
      const angleEnd = (pt.categoryIndex + 1) * sliceAngle - 3;
      const angle = angleStart + ax * (angleEnd - angleStart);
      const { x, y } = polar(cx, cy, r, angle);
      return { ...pt, x, y };
    });
  }, [visiblePoints, sliceAngle]);

  const TYPE_FILTERS: { key: ItemType | 'todos'; label: string; count: number }[] = [
    { key: 'todos', label: 'Todos', count: points.length },
    { key: 'señal', label: 'Señales', count: senales?.length ?? 0 },
    { key: 'tendencia', label: 'Tendencias', count: tendencias?.length ?? 0 },
    { key: 'escenario', label: 'Escenarios', count: escenarios?.length ?? 0 },
  ];

  return (
    <section className="py-16 px-8" style={{ background: 'transparent' }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <span
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest mb-3"
              style={{ background: 'rgba(0,107,88,0.10)', color: '#006b58', border: '1px solid rgba(0,107,88,0.20)' }}
            >
              <RadarIcon size={9} /> Horizon Scanning · Metodología Trend Radar
            </span>
            <h2
              className="text-3xl font-extrabold mb-1"
              style={{ fontFamily: "'Manrope', 'Bricolage Grotesque', sans-serif", color: '#001a48' }}
            >
              Radar Estratégico
            </h2>
            <p className="max-w-xl" style={{ color: '#444651' }}>
              Señales, tendencias y escenarios ubicados por dominio PESTEL (ángulo) y horizonte de realización (radio) —
              el centro es lo que ya está pasando, el borde es lo más lejano.
            </p>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {TYPE_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setActiveType(f.key)}
                className="px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
                style={{
                  background: activeType === f.key ? '#002d72' : 'rgba(0,45,114,0.06)',
                  color:      activeType === f.key ? '#ffffff' : '#001a48',
                }}
              >
                {f.label} · {f.count}
              </button>
            ))}
          </div>
        </div>

        <div
          className="rounded-[2rem] p-8 relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #001a48 0%, #001333 60%, #000c22 100%)', boxShadow: '0 30px 70px -25px rgba(0,26,72,0.55)' }}
        >
          <div className="absolute -top-24 -left-16 w-80 h-80 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(0,107,88,0.25), transparent 65%)', filter: 'blur(10px)' }} />
          <div className="absolute -bottom-28 -right-20 w-96 h-96 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(0,163,224,0.20), transparent 65%)', filter: 'blur(10px)' }} />

          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3 relative" style={{ color: 'rgba(255,255,255,0.75)' }}>
              <Loader2 size={28} className="animate-spin" style={{ color: '#57C4DD' }} />
              <p className="text-sm font-bold">Cargando radar estratégico…</p>
            </div>
          ) : error ? (
            <div className="py-24 flex flex-col items-center justify-center gap-2 relative" style={{ color: '#fca5a5' }}>
              <p className="text-sm font-bold">{error}</p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-[1fr_240px] gap-8 items-center relative">
              <div className="relative flex justify-center">
                <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[640px]" role="img" aria-label="Radar estratégico de señales, tendencias y escenarios">
                  <defs>
                    <filter id="radarGlow" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="3.2" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    {categorySlices.map(p => (
                      <radialGradient key={`grad-${p.slug_pestel}`} id={`grad-${p.slug_pestel}`} cx="50%" cy="50%" r="65%">
                        <stop offset="0%" stopColor={p.color} stopOpacity={0.38} />
                        <stop offset="100%" stopColor={p.color} stopOpacity={0.05} />
                      </radialGradient>
                    ))}
                  </defs>

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
                        fill={`url(#grad-${p.slug_pestel})`}
                      />
                    );
                  })}

                  <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'ciee-radar-sweep 9s linear infinite' }}>
                    <path
                      d={`M ${cx} ${cy} L ${polar(cx, cy, maxR, -18).x} ${polar(cx, cy, maxR, -18).y} A ${maxR} ${maxR} 0 0 1 ${polar(cx, cy, maxR, 0).x} ${polar(cx, cy, maxR, 0).y} Z`}
                      fill="url(#sweepGrad)"
                    />
                  </g>
                  <defs>
                    <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#57C4DD" stopOpacity="0" />
                      <stop offset="100%" stopColor="#57C4DD" stopOpacity="0.22" />
                    </linearGradient>
                  </defs>

                  {categorySlices.map((p, i) => {
                    const a = i * sliceAngle;
                    const pt = polar(cx, cy, maxR, a);
                    return <line key={`div-${p.slug_pestel}`} x1={cx} y1={cy} x2={pt.x} y2={pt.y} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />;
                  })}

                  {RING_BOUNDS.slice(1).map((b, i) => (
                    <circle
                      key={b}
                      cx={cx} cy={cy} r={b * maxR}
                      fill="none"
                      stroke={i === RING_BOUNDS.length - 2 ? 'rgba(87,196,221,0.45)' : 'rgba(255,255,255,0.16)'}
                      strokeWidth={i === RING_BOUNDS.length - 2 ? 1.5 : 1}
                      strokeDasharray={i === RING_BOUNDS.length - 2 ? undefined : '2 5'}
                    />
                  ))}

                  {RING_LABELS.map((label, i) => {
                    const r = ((RING_BOUNDS[i] + RING_BOUNDS[i + 1]) / 2) * maxR;
                    const y = cy - r;
                    return (
                      <text key={label} x={cx + 6} y={y - 4} fontSize={8.5} fontWeight={800} fill="rgba(255,255,255,0.55)" letterSpacing={0.6}>
                        {label.toUpperCase()}
                      </text>
                    );
                  })}

                  {categorySlices.map((p, i) => {
                    const midAngle = i * sliceAngle + sliceAngle / 2;
                    const labelR = maxR + 30;
                    const { x, y } = polar(cx, cy, labelR, midAngle);
                    const count = points.filter(pt => pt.categoryIndex === i).length;
                    return (
                      <g key={`label-${p.slug_pestel}`} transform={`translate(${x} ${y})`}>
                        <rect x={-38} y={-13} width={76} height={26} rx={13} fill="rgba(255,255,255,0.06)" stroke={p.color} strokeWidth={1} />
                        <text x={0} y={-1} fontSize={11} fontWeight={900} fill="#ffffff" textAnchor="middle">{p.emoji} {p.letra_codigo}</text>
                        <text x={0} y={10} fontSize={7.5} fontWeight={700} fill="rgba(255,255,255,0.55)" textAnchor="middle">{count} hallazgos</text>
                      </g>
                    );
                  })}

                  {placedPoints.map(pt => {
                    const style = TYPE_STYLE[pt.type];
                    const isHovered = hovered?.uuid === pt.uuid;
                    const r = isHovered ? style.r + 2 : style.r;
                    const common = {
                      key: pt.uuid,
                      fill: pt.categoryColor,
                      opacity: isHovered ? 1 : 0.9,
                      stroke: isHovered ? '#ffffff' : 'rgba(0,12,34,0.5)',
                      strokeWidth: isHovered ? 1.5 : 0.75,
                      filter: isHovered ? 'url(#radarGlow)' : undefined,
                      style: { cursor: 'pointer', transition: 'opacity 0.15s' },
                      onMouseEnter: () => { setHovered(pt); setHoverPos({ x: pt.x, y: pt.y }); },
                      onMouseLeave: () => { setHovered(null); setHoverPos(null); },
                      onClick: () => { setRadarTab(pt.type === 'señal' ? 'señales' : pt.type === 'tendencia' ? 'tendencias' : 'escenarios'); setActiveView('radar'); },
                    };
                    if (style.shape === 'circle') return <circle {...common} cx={pt.x} cy={pt.y} r={r} />;
                    if (style.shape === 'diamond') {
                      return <rect {...common} x={pt.x - r} y={pt.y - r} width={r * 2} height={r * 2} transform={`rotate(45 ${pt.x} ${pt.y})`} />;
                    }
                    const p1 = `${pt.x},${pt.y - r}`;
                    const p2 = `${pt.x - r * 0.9},${pt.y + r * 0.75}`;
                    const p3 = `${pt.x + r * 0.9},${pt.y + r * 0.75}`;
                    return <polygon {...common} points={`${p1} ${p2} ${p3}`} />;
                  })}

                  <circle cx={cx} cy={cy} r={RING_BOUNDS[0] * maxR + 16} fill="#001333" stroke="rgba(87,196,221,0.5)" strokeWidth={1.5} filter="url(#radarGlow)" />
                  <circle cx={cx} cy={cy} r={RING_BOUNDS[0] * maxR + 16} fill="none" className="animate-pulse-dot" style={{ transformOrigin: `${cx}px ${cy}px` }} stroke="rgba(87,196,221,0.35)" strokeWidth={1} />
                  <text x={cx} y={cy - 6} fontSize={20} fontWeight={900} fill="#ffffff" textAnchor="middle">{points.length}</text>
                  <text x={cx} y={cy + 12} fontSize={8} fontWeight={800} fill="rgba(255,255,255,0.6)" textAnchor="middle" letterSpacing={0.8}>HALLAZGOS</text>
                </svg>

                {hovered && hoverPos && (
                  <div
                    className="absolute pointer-events-none px-3.5 py-2.5 rounded-2xl shadow-2xl text-left z-20"
                    style={{
                      left: `calc(${(hoverPos.x / size) * 100}% )`,
                      top: `calc(${(hoverPos.y / size) * 100}% - 12px)`,
                      transform: 'translate(-50%, -100%)',
                      background: '#0f2555',
                      border: `1px solid ${hovered.categoryColor}55`,
                      maxWidth: 230,
                    }}
                  >
                    <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: hovered.categoryColor }}>
                      {hovered.emoji} {hovered.type} · {hovered.ringLabel}
                    </p>
                    <p className="text-xs font-bold leading-snug" style={{ color: '#ffffff' }}>{hovered.title}</p>
                    <p className="text-[10px] font-medium mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>{hovered.categoryLabel}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-5 relative">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-2.5" style={{ color: 'rgba(255,255,255,0.55)' }}>Dominios PESTEL</p>
                  <div className="flex flex-col gap-1.5">
                    {categorySlices.map(p => (
                      <div key={p.slug_pestel} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color, boxShadow: `0 0 6px ${p.color}` }} />
                        <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.88)' }}>{p.emoji} {p.nombre_pestel}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="h-px" style={{ background: 'rgba(255,255,255,0.10)' }} />

                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-2.5" style={{ color: 'rgba(255,255,255,0.55)' }}>Tipo de hallazgo</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <svg width={12} height={12}><circle cx={6} cy={6} r={4} fill="#ffffff" /></svg>
                      <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.88)' }}>Señal — detección temprana</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg width={12} height={12}><rect x={2} y={2} width={8} height={8} fill="#ffffff" transform="rotate(45 6 6)" /></svg>
                      <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.88)' }}>Tendencia — patrón consolidado</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg width={12} height={12}><polygon points="6,1 11,10 1,10" fill="#ffffff" /></svg>
                      <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.88)' }}>Escenario — futuro proyectado</span>
                    </div>
                  </div>
                </div>

                <div className="h-px" style={{ background: 'rgba(255,255,255,0.10)' }} />

                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Metodología <strong style={{ color: '#57C4DD' }}>Horizon Scanning</strong>: el centro agrupa señales recién
                  detectadas; los anillos exteriores ubican tendencias y escenarios según su horizonte de realización estimado.
                </p>

                <button
                  onClick={() => { setRadarTab('señales'); setActiveView('radar'); }}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #57C4DD, #0036DC)', color: '#ffffff' }}
                >
                  <RadarIcon size={13} /> Explorar en detalle
                </button>

                {skippedCount > 0 && (
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{skippedCount} elementos sin categoría PESTEL no se muestran.</p>
                )}
              </div>
            </div>
          )}

          <style>{`
            @keyframes ciee-radar-sweep {
              from { transform: rotate(0deg); }
              to   { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    </section>
  );
};

export default StrategicRadarChart;
