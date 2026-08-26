import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ThemeColors } from '../types';

interface GestionTamanoViewProps {
  themeColors: ThemeColors;
  onVolver?: () => void;
}

interface TablaTamano {
  name: string;
  rowCount: number;
  dataBytes: number;
  indexBytes: number;
}

interface BaseTamano {
  key: string;
  label: string;
  color: string;
  tables: TablaTamano[];
}

interface SchemaSizesResponse {
  generatedAt: string;
  databases: BaseTamano[];
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function fmtRows(n: number): string {
  return n.toLocaleString('es-PE');
}

const GestionTamanoView: React.FC<GestionTamanoViewProps> = ({ themeColors, onVolver }) => {
  const isDark = themeColors.bg.includes('950') || themeColors.bg.includes('slate-900');
  const [data, setData] = useState<SchemaSizesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDb, setActiveDb] = useState<string>('');
  const [sortBy, setSortBy] = useState<'dataBytes' | 'rowCount'>('dataBytes');

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/admin/schema-tamano', { credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'Error al cargar el tamaño de las tablas.'); return; }
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

  const chartData = useMemo(() => {
    if (!activeBase) return [];
    return [...activeBase.tables]
      .sort((a, b) => b[sortBy] - a[sortBy])
      .slice(0, 15)
      .map(t => ({ ...t, totalBytes: t.dataBytes + t.indexBytes }));
  }, [activeBase, sortBy]);

  const totals = useMemo(() => {
    if (!data) return { rows: 0, bytes: 0, tables: 0 };
    let rows = 0, bytes = 0, tables = 0;
    for (const db of data.databases) {
      tables += db.tables.length;
      for (const t of db.tables) { rows += t.rowCount; bytes += t.dataBytes + t.indexBytes; }
    }
    return { rows, bytes, tables };
  }, [data]);

  if (loading && !data) {
    return (
      <div style={{ padding: '32px 32px 0' }}>
        <p style={{ fontSize: 13, color: '#94a3b8' }}>Calculando tamaño de tablas…</p>
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

  const cardBg = isDark ? '#121820' : '#ffffff';
  const border = isDark ? '#22303c' : '#dbe3e9';
  const textDim = '#5b6b7a';

  return (
    <div style={{ padding: '32px 32px 40px' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: isDark ? '#e2e8f0' : '#0F2A3F', marginBottom: 4 }}>
            Tamaño y crecimiento de tablas
          </h2>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>
            <span style={{ fontWeight: 700, color: '#0D9488' }}>{fmtRows(totals.rows)}</span> filas ·{' '}
            <span style={{ fontWeight: 700, color: '#0D9488' }}>{fmtBytes(totals.bytes)}</span> ocupados ·{' '}
            {totals.tables} tablas en las 3 bases.
          </p>
        </div>
        {onVolver && (
          <button type="button" onClick={onVolver}
            style={{ border: '1px solid #cbd5e1', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#e2e8f0' : '#334155', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Volver a Gestión
          </button>
        )}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 20 }}>
        {data.databases.map(db => {
          const dbRows = db.tables.reduce((a, t) => a + t.rowCount, 0);
          const dbBytes = db.tables.reduce((a, t) => a + t.dataBytes + t.indexBytes, 0);
          return (
            <div key={db.key} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: db.color }} />
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: textDim, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{db.label}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: db.color, fontFamily: 'monospace' }}>{fmtBytes(dbBytes)}</div>
              <div style={{ fontSize: 11, color: textDim, marginTop: 2 }}>{fmtRows(dbRows)} filas · {db.tables.length} tablas</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${border}` }}>
          {data.databases.map(db => (
            <button
              key={db.key}
              type="button"
              onClick={() => setActiveDb(db.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600,
                background: activeDb === db.key ? cardBg : 'transparent',
                borderTop: activeDb === db.key ? `1px solid ${border}` : '1px solid transparent',
                borderLeft: activeDb === db.key ? `1px solid ${border}` : '1px solid transparent',
                borderRight: activeDb === db.key ? `1px solid ${border}` : '1px solid transparent',
                borderBottom: 'none', borderRadius: '8px 8px 0 0', padding: '8px 14px', cursor: 'pointer',
                color: activeDb === db.key ? (isDark ? '#e6edf3' : '#101820') : textDim,
              }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: db.color }} />
              {db.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['dataBytes', 'rowCount'] as const).map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setSortBy(opt)}
              style={{
                fontSize: 11, fontWeight: 600, padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${sortBy === opt ? '#0D9488' : border}`,
                background: sortBy === opt ? (isDark ? '#0f2622' : '#e6f6f3') : 'transparent',
                color: sortBy === opt ? '#0D9488' : textDim,
              }}>
              {opt === 'dataBytes' ? 'Por tamaño' : 'Por filas'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: '18px 18px 8px' }}>
        {chartData.length === 0 ? (
          <p style={{ fontSize: 12.5, color: textDim, padding: '24px 0', textAlign: 'center' }}>Sin tablas para mostrar.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 34)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={190}
                tick={{ fontSize: 11, fontFamily: 'monospace', fill: isDark ? '#8b98a5' : '#5b6b7a' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, key: string) =>
                  key === 'totalBytes' ? [fmtBytes(value), 'Tamaño'] : [fmtRows(value), 'Filas']
                }
              />
              <Bar dataKey={sortBy === 'dataBytes' ? 'totalBytes' : 'rowCount'} radius={[0, 4, 4, 0]} barSize={18}>
                {chartData.map((t, i) => (
                  <Cell key={t.name} fill={activeBase?.color || '#0D9488'} fillOpacity={1 - i * 0.035} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <p style={{ marginTop: 18, fontSize: 10.5, color: '#94a3b8', fontFamily: 'monospace' }}>
        generado {new Date(data.generatedAt).toLocaleString('es-PE')} · TABLE_ROWS es un estimado de InnoDB, no un COUNT(*) exacto.
      </p>
    </div>
  );
};

export default GestionTamanoView;
