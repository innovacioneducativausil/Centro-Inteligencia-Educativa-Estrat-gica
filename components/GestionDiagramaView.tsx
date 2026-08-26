import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import mermaid from 'mermaid';
import { ThemeColors } from '../types';

interface GestionDiagramaViewProps {
  themeColors: ThemeColors;
  onVolver?: () => void;
}

interface ColumnaSchema {
  name: string;
  isPk: boolean;
  isFk: boolean;
  dataType: string;
}

interface RelacionSchema {
  column: string;
  refTable: string;
  refColumn: string;
  deleteRule: string;
}

interface TablaSchema {
  name: string;
  columns: ColumnaSchema[];
  relations: RelacionSchema[];
}

interface BaseSchema {
  key: string;
  label: string;
  color: string;
  tableCount: number;
  tables: TablaSchema[];
}

interface CrossRelation {
  id: string;
  from: { db: string; table: string; column?: string };
  to: { db: string; table: string; column?: string };
  kind: 'id' | 'texto' | 'runtime';
  label: string;
}

interface SchemaDiagramResponse {
  generatedAt: string;
  databases: BaseSchema[];
  crossDb: CrossRelation[];
}

let mermaidRenderSeq = 0;

function ensureMermaidInit(isDark: boolean) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: isDark ? 'dark' : 'neutral',
    er: { useMaxWidth: false },
  });
}

function buildMermaidErDiagram(tables: TablaSchema[]): string {
  const lines: string[] = ['erDiagram'];
  for (const t of tables) {
    lines.push(`    ${t.name.toUpperCase()} {`);
    for (const c of t.columns) {
      const type = (c.dataType || 'varchar').replace(/[^a-zA-Z0-9_]/g, '');
      const tag = c.isPk ? ' PK' : c.isFk ? ' FK' : '';
      lines.push(`        ${type || 'varchar'} ${c.name}${tag}`);
    }
    lines.push('    }');
  }
  const seen = new Set<string>();
  for (const t of tables) {
    for (const r of t.relations) {
      const key = `${r.refTable}->${t.name}->${r.column}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const style = r.deleteRule === 'CASCADE' ? '||--o{' : '||..o{';
      const label = r.deleteRule === 'CASCADE' ? 'compone' : `referencia (${r.deleteRule || 'sin FK'})`;
      lines.push(`    ${r.refTable.toUpperCase()} ${style} ${t.name.toUpperCase()} : "${label}"`);
    }
  }
  return lines.join('\n');
}

const KIND_STYLE: Record<CrossRelation['kind'], { stroke: string; dash: string; label: string }> = {
  id:      { stroke: '#c81e4f', dash: 'none',   label: 'Por ID real' },
  texto:   { stroke: '#c81e4f', dash: '7 5',     label: 'Por texto' },
  runtime: { stroke: '#c81e4f', dash: '1 6',     label: 'Búsqueda en tiempo de ejecución' },
};

// ---------- Marco con zoom / pan (mismo patrón que el artefacto de referencia) ----------
const ZoomPanFrame: React.FC<{ children: React.ReactNode; isDark: boolean }> = ({ children, isDark }) => {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ dragging: boolean; startX: number; startY: number; origX: number; origY: number }>({
    dragging: false, startX: 0, startY: 0, origX: 0, origY: 0,
  });
  const frameRef = useRef<HTMLDivElement>(null);

  const clampScale = (v: number) => Math.min(2.5, Math.max(0.3, v));

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setScale(s => clampScale(s + delta));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    dragState.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragState.current.dragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPos({ x: dragState.current.origX + dx, y: dragState.current.origY + dy });
  };
  const stopDrag = () => { dragState.current.dragging = false; };

  return (
    <div
      ref={frameRef}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      style={{
        position: 'relative',
        border: `1px solid ${isDark ? '#22303c' : '#dbe3e9'}`,
        borderRadius: 12,
        background: isDark ? '#121820' : '#ffffff',
        height: '68vh',
        minHeight: 440,
        overflow: 'hidden',
        cursor: dragState.current.dragging ? 'grabbing' : 'grab',
      }}
    >
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 3, display: 'flex', gap: 2, background: isDark ? '#121820' : '#fff', border: `1px solid ${isDark ? '#22303c' : '#dbe3e9'}`, borderRadius: 8, padding: 4, boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}>
        <button type="button" onClick={() => setScale(s => clampScale(s - 0.15))} style={zoomBtnStyle(isDark)}>−</button>
        <span style={{ fontSize: 11, color: isDark ? '#8b98a5' : '#5b6b7a', width: 42, textAlign: 'center', alignSelf: 'center', fontFamily: 'monospace' }}>{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => setScale(s => clampScale(s + 0.15))} style={zoomBtnStyle(isDark)}>+</button>
        <button type="button" onClick={() => { setScale(1); setPos({ x: 0, y: 0 }); }} style={{ ...zoomBtnStyle(isDark), width: 'auto', fontSize: 10, padding: '0 8px' }}>100%</button>
      </div>
      <span style={{ position: 'absolute', bottom: 10, left: 14, zIndex: 3, fontSize: 10, fontFamily: 'monospace', color: isDark ? '#8b98a5' : '#5b6b7a', background: isDark ? '#121820' : '#fff', border: `1px solid ${isDark ? '#22303c' : '#dbe3e9'}`, borderRadius: 6, padding: '4px 8px', pointerEvents: 'none', opacity: 0.85 }}>
        arrastra para mover · rueda para zoom
      </span>
      <div style={{ position: 'absolute', top: 0, left: 0, padding: 18, transformOrigin: '0 0', transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, width: 'max-content' }}>
        {children}
      </div>
    </div>
  );
};

function zoomBtnStyle(isDark: boolean): React.CSSProperties {
  return {
    fontFamily: 'monospace', fontSize: 16, lineHeight: 1, width: 28, height: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
    background: 'transparent', color: isDark ? '#e6edf3' : '#101820', borderRadius: 6, cursor: 'pointer',
  };
}

// ---------- Pestaña "Entre bases": layout medido en vivo con refs, sin coordenadas fijas ----------
const CrossDbDiagram: React.FC<{ crossDb: CrossRelation[]; databases: BaseSchema[]; isDark: boolean }> = ({ crossDb, databases, isDark }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [paths, setPaths] = useState<{ id: string; d: string; kind: CrossRelation['kind']; label: string }[]>([]);
  const [tick, setTick] = useState(0);

  const nodesByDb = useMemo(() => {
    const map: Record<string, { table: string; key: string }[]> = {};
    for (const dbSchema of databases) map[dbSchema.key] = [];
    for (const rel of crossDb) {
      for (const side of [rel.from, rel.to]) {
        if (!map[side.db]) map[side.db] = [];
        const key = `${side.db}::${side.table}`;
        if (!map[side.db].some(n => n.key === key)) map[side.db].push({ table: side.table, key });
      }
    }
    return map;
  }, [crossDb, databases]);

  useLayoutEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const next: { id: string; d: string; kind: CrossRelation['kind']; label: string }[] = [];
      for (const rel of crossDb) {
        const fromEl = nodeRefs.current[`${rel.from.db}::${rel.from.table}`];
        const toEl = nodeRefs.current[`${rel.to.db}::${rel.to.table}`];
        if (!fromEl || !toEl) continue;
        const fr = fromEl.getBoundingClientRect();
        const tr = toEl.getBoundingClientRect();
        const fromRight = fr.left + fr.width > tr.left + tr.width / 2;
        const x1 = (fromRight ? fr.left : fr.left + fr.width) - cRect.left;
        const y1 = fr.top + fr.height / 2 - cRect.top;
        const x2 = (fromRight ? tr.left + tr.width : tr.left) - cRect.left;
        const y2 = tr.top + tr.height / 2 - cRect.top;
        const midX = (x1 + x2) / 2;
        next.push({ id: rel.id, d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`, kind: rel.kind, label: rel.label });
      }
      setPaths(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [crossDb, nodesByDb, tick]);

  useEffect(() => { const t = setTimeout(() => setTick(v => v + 1), 60); return () => clearTimeout(t); }, [crossDb]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${databases.length}, 1fr)`, gap: 24, minHeight: 320, padding: '8px 4px' }}>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
        <defs>
          <marker id="crossArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#c81e4f" />
          </marker>
        </defs>
        {paths.map(p => (
          <path key={p.id} d={p.d} fill="none" stroke={KIND_STYLE[p.kind].stroke} strokeWidth={1.8}
            strokeDasharray={KIND_STYLE[p.kind].dash} markerEnd="url(#crossArrow)" opacity={0.85} />
        ))}
      </svg>
      {databases.map(dbSchema => (
        <div key={dbSchema.key} style={{ position: 'relative', zIndex: 1, border: `1px dashed ${dbSchema.color}55`, borderRadius: 12, padding: '14px 10px', background: `${dbSchema.color}0d` }}>
          <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: dbSchema.color, marginBottom: 12 }}>{dbSchema.label}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {(nodesByDb[dbSchema.key] || []).map(n => (
              <div
                key={n.key}
                ref={el => { nodeRefs.current[n.key] = el; }}
                style={{ background: isDark ? '#121820' : '#fff', border: `1.5px solid ${dbSchema.color}`, borderRadius: 8, padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, textAlign: 'center', color: isDark ? '#e6edf3' : '#101820' }}
              >
                {n.table}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const GestionDiagramaView: React.FC<GestionDiagramaViewProps> = ({ themeColors, onVolver }) => {
  const isDark = themeColors.bg.includes('950') || themeColors.bg.includes('slate-900');
  const [data, setData] = useState<SchemaDiagramResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDb, setActiveDb] = useState<string>('');
  const mermaidContainerRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/admin/schema-diagrama', { credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'Error al cargar el modelo de datos.'); return; }
      setData(j);
      setActiveDb(prev => prev || (j.databases?.[0]?.key ?? ''));
    } catch {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeBase = useMemo(() => data?.databases.find(d => d.key === activeDb) || null, [data, activeDb]);

  useEffect(() => {
    if (!activeBase || activeDb === 'cross') return;
    ensureMermaidInit(isDark);
    const el = mermaidContainerRef.current;
    if (!el) return;
    const diagram = buildMermaidErDiagram(activeBase.tables);
    const id = `ceie-schema-${mermaidRenderSeq++}`;
    let cancelled = false;
    mermaid.render(id, diagram).then(({ svg }) => {
      if (!cancelled && el) el.innerHTML = svg;
    }).catch(() => {
      if (!cancelled && el) el.innerHTML = `<p style="color:#ef4444;font-size:12px;">No se pudo renderizar el diagrama.</p>`;
    });
    return () => { cancelled = true; };
  }, [activeBase, activeDb, isDark]);

  if (loading && !data) {
    return (
      <div style={{ padding: '32px 32px 0' }}>
        <p style={{ fontSize: 13, color: '#94a3b8' }}>Cargando modelo de datos en vivo…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '32px 32px 0' }}>
        <p style={{ fontSize: 13, color: '#ef4444' }}>{error}</p>
        {onVolver && <button type="button" onClick={onVolver} style={{ marginTop: 12, border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Volver a Gestión</button>}
      </div>
    );
  }

  if (!data) return null;

  const totalTables = data.databases.reduce((acc, d) => acc + d.tableCount, 0);

  return (
    <div style={{ padding: '32px 32px 40px' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: isDark ? '#e2e8f0' : '#0F2A3F', marginBottom: 4 }}>
            Modelo de datos en vivo
          </h2>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>
            3 bases MySQL · <span style={{ fontWeight: 700, color: '#0D9488' }}>{totalTables}</span> tablas · leído directamente de <code>information_schema</code>, se actualiza solo.
          </p>
        </div>
        {onVolver && (
          <button type="button" onClick={onVolver}
            style={{ border: '1px solid #cbd5e1', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#e2e8f0' : '#334155', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Volver a Gestión
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${isDark ? '#22303c' : '#dbe3e9'}`, overflowX: 'auto' }}>
        {data.databases.map(db => (
          <button
            key={db.key}
            type="button"
            onClick={() => setActiveDb(db.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600,
              background: activeDb === db.key ? (isDark ? '#121820' : '#fff') : 'transparent',
              borderTop: activeDb === db.key ? `1px solid ${isDark ? '#22303c' : '#dbe3e9'}` : '1px solid transparent',
              borderLeft: activeDb === db.key ? `1px solid ${isDark ? '#22303c' : '#dbe3e9'}` : '1px solid transparent',
              borderRight: activeDb === db.key ? `1px solid ${isDark ? '#22303c' : '#dbe3e9'}` : '1px solid transparent',
              borderBottom: 'none', borderRadius: '8px 8px 0 0', padding: '8px 14px', cursor: 'pointer',
              color: activeDb === db.key ? (isDark ? '#e6edf3' : '#101820') : '#5b6b7a',
              whiteSpace: 'nowrap',
            }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: db.color }} />
            {db.label} <span style={{ fontFamily: 'monospace', fontSize: 11, opacity: 0.6 }}>({db.tableCount})</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setActiveDb('cross')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600,
            background: activeDb === 'cross' ? (isDark ? '#121820' : '#fff') : 'transparent',
            borderTop: activeDb === 'cross' ? `1px solid ${isDark ? '#22303c' : '#dbe3e9'}` : '1px solid transparent',
            borderLeft: activeDb === 'cross' ? `1px solid ${isDark ? '#22303c' : '#dbe3e9'}` : '1px solid transparent',
            borderRight: activeDb === 'cross' ? `1px solid ${isDark ? '#22303c' : '#dbe3e9'}` : '1px solid transparent',
            borderBottom: 'none', borderRadius: '8px 8px 0 0', padding: '8px 14px', cursor: 'pointer',
            color: activeDb === 'cross' ? (isDark ? '#e6edf3' : '#101820') : '#5b6b7a',
            whiteSpace: 'nowrap',
          }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c81e4f' }} />
          Entre bases <span style={{ fontFamily: 'monospace', fontSize: 11, opacity: 0.6 }}>({data.crossDb.length})</span>
        </button>
      </div>

      {activeDb !== 'cross' && (
        <ZoomPanFrame isDark={isDark}>
          <div ref={mermaidContainerRef} />
        </ZoomPanFrame>
      )}

      {activeDb === 'cross' && (
        <div style={{ border: `1px solid ${isDark ? '#22303c' : '#dbe3e9'}`, borderRadius: 12, background: isDark ? '#121820' : '#fff', padding: 18 }}>
          <CrossDbDiagram crossDb={data.crossDb} databases={data.databases} isDark={isDark} />
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.crossDb.map(rel => (
              <div key={rel.id} style={{ fontSize: 11.5, fontFamily: 'monospace', color: '#5b6b7a', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: KIND_STYLE[rel.kind].stroke, flexShrink: 0, display: 'inline-block' }} />
                <span>{rel.from.db}.{rel.from.table} → {rel.to.db}.{rel.to.table} — {rel.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{ marginTop: 18, fontSize: 10.5, color: '#94a3b8', fontFamily: 'monospace' }}>
        generado {new Date(data.generatedAt).toLocaleString('es-PE')}
      </p>
    </div>
  );
};

export default GestionDiagramaView;
