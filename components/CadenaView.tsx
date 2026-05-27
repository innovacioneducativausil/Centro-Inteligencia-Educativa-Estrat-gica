// components/CadenaView.tsx — Cadena Causal por tópico
// Visualiza Señal → Tendencia → Escenario con relaciones auto-inferidas por similitud de texto
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { ThemeColors } from '../types';
import { getCadenaCausal, CadenaTopico, CadenaRelacion } from '../services/apiService';

interface Props { themeColors: ThemeColors; }

const PESTEL_COLORS: Record<string, string> = {
  'Tecnológico': '#0D9488', 'Social': '#7C3AED', 'Económico': '#92400E',
  'Político': '#F43F5E', 'Ecológico': '#065F46', 'Legal': '#0369A1',
};

const probDots = (n: number | null) => {
  if (!n) return null;
  return '●'.repeat(n) + '○'.repeat(5 - n);
};

// ── Relation auto-inference by keyword similarity ─────────────────────────────
const STOPWORDS = new Set([
  'the','a','an','in','of','for','to','and','or','is','are','with','by','as','at','on',
  'that','this','their','they','have','been','will','from','but','not','more','its',
  'la','el','de','en','y','los','las','un','una','del','al','que','se','su','por',
  'con','para','como','más','sin','sobre','entre','hacia','hasta','cuando','donde',
]);

function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents for matching
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w));
}

function inferRelaciones(topico: CadenaTopico): CadenaRelacion[] {
  // If DB already has relations, use them
  if (topico.relaciones.length > 0) return topico.relaciones;

  const rels: CadenaRelacion[] = [];

  // señal → tendencia: connect if >= 1 keyword in common
  for (const senal of topico.senales) {
    const sWords = new Set(tokenize(`${senal.titulo} ${senal.descCorta || ''}`));
    const sid = String(senal.uuid);
    let connected = false;
    for (const tend of topico.tendencias) {
      const tWords = tokenize(`${tend.titulo} ${tend.descCorta || ''}`);
      if (tWords.some(w => sWords.has(w))) {
        rels.push({ tipo: 'senal_tendencia', idA: sid, idB: String(tend.uuid) });
        connected = true;
      }
    }
    if (!connected && topico.tendencias.length > 0) {
      rels.push({ tipo: 'senal_tendencia', idA: sid, idB: String(topico.tendencias[0].uuid) });
    }
  }

  // tendencia → escenario: connect if >= 1 keyword in common
  for (const tend of topico.tendencias) {
    const tWords = new Set(tokenize(`${tend.titulo} ${tend.descCorta || ''}`));
    const tid = String(tend.uuid);
    let connected = false;
    for (const esc of topico.escenarios) {
      const eWords = tokenize(`${esc.titulo} ${esc.descCorta || ''}`);
      if (eWords.some(w => tWords.has(w))) {
        rels.push({ tipo: 'tendencia_escenario', idA: tid, idB: String(esc.uuid) });
        connected = true;
      }
    }
    if (!connected && topico.escenarios.length > 0) {
      rels.push({ tipo: 'tendencia_escenario', idA: tid, idB: String(topico.escenarios[0].uuid) });
    }
  }

  // señal → escenario (direct): sin tendencias o escenario huérfano
  if (topico.tendencias.length === 0) {
    for (const senal of topico.senales) {
      const sWords = new Set(tokenize(`${senal.titulo} ${senal.descCorta || ''}`));
      const sid = String(senal.uuid);
      let connected = false;
      for (const esc of topico.escenarios) {
        const eWords = tokenize(`${esc.titulo} ${esc.descCorta || ''}`);
        if (eWords.some(w => sWords.has(w))) {
          rels.push({ tipo: 'senal_escenario', idA: sid, idB: String(esc.uuid) });
          connected = true;
        }
      }
      if (!connected && topico.escenarios.length > 0) {
        rels.push({ tipo: 'senal_escenario', idA: sid, idB: String(topico.escenarios[0].uuid) });
      }
    }
  } else {
    const connectedEscIds = new Set(rels.filter(r => r.tipo === 'tendencia_escenario').map(r => r.idB));
    for (const esc of topico.escenarios) {
      if (connectedEscIds.has(String(esc.uuid))) continue;
      let bestSenal = topico.senales[0] ?? null;
      let bestScore = 0;
      const eWords = new Set(tokenize(`${esc.titulo} ${esc.descCorta || ''}`));
      for (const senal of topico.senales) {
        const sWords = tokenize(`${senal.titulo} ${senal.descCorta || ''}`);
        const score = sWords.filter(w => eWords.has(w)).length;
        if (score > bestScore) { bestScore = score; bestSenal = senal; }
      }
      if (bestSenal) {
        rels.push({ tipo: 'senal_escenario', idA: String(bestSenal.uuid), idB: String(esc.uuid) });
      }
    }
  }

  return rels;
}

// offsetTop/offsetLeft de cada card ya son relativos al inner container (position:relative)
// que es exactamente el espacio de coordenadas del SVG (position:absolute top:0 left:0).
// No se necesita traversal — usar directamente.

// ── Compact node components (no image, no desc — just label + title) ──────────
const SenalNode = ({ s, color, nodeRef }: { s: any; color: string; nodeRef: (el: HTMLDivElement | null) => void }) => (
  <div ref={nodeRef} className="rounded-lg border p-2 mb-2"
    style={{ borderLeft: `3px solid ${color}`, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
    <p className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color }}>
      <span className="material-symbols-outlined align-middle mr-0.5" style={{ fontSize: 9 }}>wifi_tethering</span>
      Señal
    </p>
    <p className="text-[10px] font-semibold leading-tight text-slate-800"
      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}>
      {s.titulo}
    </p>
    {s.fuente && <p className="text-[8px] text-slate-400 mt-0.5 truncate">{s.fuente}</p>}
  </div>
);

const TendenciaNode = ({ t, color, nodeRef }: { t: any; color: string; nodeRef: (el: HTMLDivElement | null) => void }) => (
  <div ref={nodeRef} className="rounded-lg border p-2 mb-2"
    style={{ borderLeft: `3px solid ${color}`, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
    <p className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color }}>
      <span className="material-symbols-outlined align-middle mr-0.5" style={{ fontSize: 9 }}>trending_up</span>
      Tendencia
    </p>
    <p className="text-[10px] font-semibold leading-tight text-slate-800"
      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}>
      {t.titulo}
    </p>
  </div>
);

const EscenarioNode = ({ e, color, nodeRef }: { e: any; color: string; nodeRef: (el: HTMLDivElement | null) => void }) => (
  <div ref={nodeRef} className="rounded-lg border p-2 mb-2"
    style={{ borderLeft: `3px solid ${color}`, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
    <p className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color }}>
      <span className="material-symbols-outlined align-middle mr-0.5" style={{ fontSize: 9 }}>auto_awesome</span>
      Escenario
    </p>
    <p className="text-[10px] font-semibold leading-tight text-slate-800"
      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}>
      {e.titulo}
    </p>
    {e.probabilidad != null && (
      <p className="text-[9px] mt-1 font-mono" style={{ color }}>
        {probDots(e.probabilidad)} {e.probabilidad}/5
      </p>
    )}
  </div>
);

// ── Main CadenaView ───────────────────────────────────────────────────────────
const AUTH = () => ({ 'Content-Type': 'application/json' });

const CadenaView: React.FC<Props> = () => {
  const [topicos, setTopicos]   = useState<CadenaTopico[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<number>(0);
  const [inferring, setInferring] = useState(false);
  const [inferMsg, setInferMsg]   = useState<string | null>(null);

  // Tracks which idTopico values have already had auto-inference triggered this session
  const autoInferredRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    getCadenaCausal()
      .then(r => setTopicos(r.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // uuid → DOM element (scroll-independent offset computation)
  const nodeRefs    = useRef<Map<string, HTMLDivElement>>(new Map());
  const gridRef     = useRef<HTMLDivElement>(null);   // the 3-col grid (non-scrolling)
  const [svgH, setSvgH] = useState(0);
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number; color: string }[]>([]);

  // Siempre usar String() para keys — MySQL devuelve enteros pero la interfaz dice string
  const setNodeRef = useCallback((uuid: string | number) => (el: HTMLDivElement | null) => {
    const key = String(uuid);
    if (el) nodeRefs.current.set(key, el);
    else    nodeRefs.current.delete(key);
  }, []);

  const recomputeLines = useCallback(() => {
    const topico = topicos[selected];
    if (!topico || !gridRef.current) return;

    const rels = inferRelaciones(topico);
    const newLines: typeof lines = [];

    for (const rel of rels) {
      const elA = nodeRefs.current.get(String(rel.idA));
      const elB = nodeRefs.current.get(String(rel.idB));
      if (!elA || !elB) continue;
      // offsetTop/offsetLeft son relativos al inner container = espacio SVG
      const x1 = elA.offsetLeft + elA.offsetWidth;
      const y1 = elA.offsetTop  + elA.offsetHeight / 2;
      const x2 = elB.offsetLeft;
      const y2 = elB.offsetTop  + elB.offsetHeight / 2;
      const color = rel.tipo === 'senal_tendencia'     ? '#0D9488'
                  : rel.tipo === 'tendencia_escenario'  ? '#7C3AED'
                  : rel.tipo === 'senal_escenario'      ? '#F59E0B'
                  : '#94A3B8';
      newLines.push({ x1, y1, x2, y2, color });
    }

    setSvgH(gridRef.current.offsetHeight);
    setLines(newLines);
  }, [topicos, selected]);

  const handleInferirRelaciones = useCallback(async () => {
    const topico = topicos[selected];
    if (!topico) return;
    setInferring(true); setInferMsg(null);
    try {
      const res = await fetch(`/api/cadena-causal/${topico.idTopico}/relaciones/inferir`, {
        method: 'POST', headers: AUTH(),
      });
      const data = await res.json();
      if (!res.ok) { setInferMsg(`Error: ${data.error || res.statusText}`); return; }
      // Actualiza el tópico con las relaciones recién guardadas
      setTopicos(prev => prev.map((t, i) =>
        i === selected ? { ...t, relaciones: data.relaciones } : t
      ));
      setInferMsg(data.message || `${data.created} relaciones guardadas`);
    } catch (e: any) {
      setInferMsg(`Error: ${e.message}`);
    } finally {
      setInferring(false);
    }
  }, [topicos, selected]);

  // Keep a stable ref so the auto-inference effect never captures a stale closure
  const handleInferirRef = useRef(handleInferirRelaciones);
  handleInferirRef.current = handleInferirRelaciones;

  // Auto-infer: whenever the selected topic has NO DB relations, trigger immediately.
  // Uses a Set to ensure each topic is only queued once per session.
  useEffect(() => {
    const topico = topicos[selected];
    if (!topico) return;
    if (topico.relaciones.length > 0) return;          // already has relations
    if (autoInferredRef.current.has(topico.idTopico)) return; // already queued
    const hasContent = topico.senales.length > 0 || topico.tendencias.length > 0 || topico.escenarios.length > 0;
    if (!hasContent) return;                            // nothing to relate
    autoInferredRef.current.add(topico.idTopico);
    handleInferirRef.current();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, topicos.length]); // fires when user switches topic or list first loads

  // Clear refs when topico changes
  useEffect(() => { nodeRefs.current.clear(); }, [selected]);

  // Recompute after render
  useEffect(() => {
    const t1 = setTimeout(recomputeLines, 120);
    const t2 = setTimeout(recomputeLines, 400); // second pass after images load
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [recomputeLines, topicos, selected]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={28} className="animate-spin" style={{ color: '#0D9488' }} />
      <span className="ml-3 text-sm" style={{ color: '#94A3B8' }}>Cargando cadena causal…</span>
    </div>
  );
  if (error) return <div className="text-center py-16 text-red-500 text-sm">{error}</div>;
  if (topicos.length === 0) return (
    <div className="text-center py-16 text-sm" style={{ color: '#94A3B8' }}>
      No hay tópicos publicados aún. Importa artículos para generar la cadena causal.
    </div>
  );

  const topico = topicos[selected];

  return (
    <div className="space-y-4">

      {/* Tópico selector — solo nombre, sin conteos */}
      <div className="flex flex-wrap gap-2">
        {topicos.map((t, i) => (
          <button key={t.idTopico} onClick={() => setSelected(i)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
            style={{
              background:  i === selected ? '#0D9488' : 'transparent',
              color:       i === selected ? '#fff'    : '#475569',
              borderColor: i === selected ? '#0D9488' : '#d1d5db',
            }}>
            {t.nombre}
          </button>
        ))}
      </div>

      {/* Legend + Inferir button */}
      <div className="flex items-center flex-wrap gap-4 text-[11px] px-1" style={{ color: '#94A3B8' }}>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-0.5 rounded inline-block" style={{ background: '#0D9488' }} />
          Señal → Tendencia
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-0.5 rounded inline-block" style={{ background: '#7C3AED' }} />
          Tendencia → Escenario
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-0.5 rounded inline-block" style={{ background: '#F59E0B' }} />
          Señal → Escenario
        </span>
        {/* Auto-inference status indicator */}
        {(inferring || inferMsg) && (
          <div className="flex items-center gap-2 ml-auto">
            {inferring ? (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: '#6366f1' }}>
                <Loader2 size={12} className="animate-spin" />
                Inferiendo relaciones con IA…
              </span>
            ) : inferMsg ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold"
                style={{ color: inferMsg.startsWith('Error') ? '#ef4444' : '#10b981' }}>
                {!inferMsg.startsWith('Error') && (
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check_circle</span>
                )}
                {inferMsg}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* Chain diagram — horizontal scroll + pan with mouse wheel */}
      <div className="overflow-x-auto" style={{ cursor: 'grab' }}
        onMouseDown={e => {
          const el = e.currentTarget;
          el.style.cursor = 'grabbing';
          const startX = e.pageX + el.scrollLeft;
          const onMove = (mv: MouseEvent) => { el.scrollLeft = startX - mv.pageX; };
          const onUp   = () => { el.style.cursor = 'grab'; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}>
        {/* Inner div: grid + SVG overlay, position relative */}
        <div style={{ position: 'relative', minWidth: 1080 }}>

          {/* SVG lines — absolute, matches grid height */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: svgH, pointerEvents: 'none' }}>
            {lines.map((l, i) => {
              // Control points 30% of the way in (tight S-curve, less crossing)
              const dx = (l.x2 - l.x1) * 0.4;
              return (
                <path key={i}
                  d={`M ${l.x1} ${l.y1} C ${l.x1 + dx} ${l.y1} ${l.x2 - dx} ${l.y2} ${l.x2} ${l.y2}`}
                  fill="none" stroke={l.color} strokeWidth={1.5} strokeOpacity={0.45}
                  strokeDasharray={l.color === '#94A3B8' ? '4 3' : undefined}
                />
              );
            })}
          </svg>

          {/* 3-column grid — fixed column widths with wide gap for clear line routing */}
          <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: '320px 320px 320px', gap: 60 }}>

            {/* Headers */}
            <div className="text-center pb-2 mb-1" style={{ borderBottom: '1px solid #e2e8f0' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#0D9488' }}>Fuentes · Señales</p>
              <p className="text-[9px]" style={{ color: '#94A3B8' }}>{topico.senales.length} señales</p>
            </div>
            <div className="text-center pb-2 mb-1" style={{ borderBottom: '1px solid #e2e8f0' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#3B82F6' }}>Tendencias</p>
              <p className="text-[9px]" style={{ color: '#94A3B8' }}>{topico.tendencias.length} tendencias</p>
            </div>
            <div className="text-center pb-2 mb-1" style={{ borderBottom: '1px solid #e2e8f0' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#7C3AED' }}>Previsiones · Escenarios</p>
              <p className="text-[9px]" style={{ color: '#94A3B8' }}>{topico.escenarios.length} escenarios</p>
            </div>

            {/* Señales */}
            <div className="pt-2">
              {topico.senales.length === 0
                ? <p className="text-xs text-center py-4" style={{ color: '#94A3B8' }}>Sin señales</p>
                : topico.senales.map(s => (
                  <SenalNode key={s.uuid} s={s}
                    color={PESTEL_COLORS[s.pestel || ''] || '#475569'}
                    nodeRef={setNodeRef(s.uuid)} />
                ))}
            </div>

            {/* Tendencias */}
            <div className="pt-2">
              {topico.tendencias.length === 0
                ? <p className="text-xs text-center py-4" style={{ color: '#94A3B8' }}>Sin tendencias</p>
                : topico.tendencias.map(t => (
                  <TendenciaNode key={t.uuid} t={t}
                    color={PESTEL_COLORS[t.pestel || ''] || '#3B82F6'}
                    nodeRef={setNodeRef(t.uuid)} />
                ))}
            </div>

            {/* Escenarios */}
            <div className="pt-2">
              {topico.escenarios.length === 0
                ? <p className="text-xs text-center py-4" style={{ color: '#94A3B8' }}>Sin escenarios</p>
                : topico.escenarios.map(e => (
                  <EscenarioNode key={e.uuid} e={e}
                    color={PESTEL_COLORS[e.pestel || ''] || '#7C3AED'}
                    nodeRef={setNodeRef(e.uuid)} />
                ))}
            </div>

          </div>{/* grid */}
        </div>{/* inner */}
      </div>{/* outer scroll */}

    </div>
  );
};

export default CadenaView;
