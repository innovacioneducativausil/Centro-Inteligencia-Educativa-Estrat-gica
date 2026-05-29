// components/MonitoreoView.tsx — Vista de monitoreo de actividad (restringida)
import React, { useState, useEffect, useCallback } from 'react';
import { ThemeColors } from '../types';

interface MonitoreoViewProps {
  themeColors: ThemeColors;
}

interface ActividadRow {
  id: number;
  correo: string;
  evento: string;
  modulo: string | null;
  elemento_tipo: string | null;
  elemento_titulo: string | null;
  ip: string | null;
  fecha_hora: string;
}

const EVENTO_LABELS: Record<string, string> = {
  login:              'Inicio de sesión',
  logout:             'Cierre de sesión',
  nav_modulo:         'Acceso a módulo',
  ver_senal:          'Ver señal',
  ver_tendencia:      'Ver tendencia',
  ver_escenario:      'Ver escenario',
  descargar_informe:  'Descargar informe',
};

const EVENTO_COLOR: Record<string, string> = {
  login:             '#10b981',
  logout:            '#94a3b8',
  nav_modulo:        '#3b82f6',
  ver_senal:         '#0D9488',
  ver_tendencia:     '#8b5cf6',
  ver_escenario:     '#f59e0b',
  descargar_informe: '#e74c3c',
};

function fmtFecha(s: string) {
  return new Date(s).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const PAGE_LIMIT = 50;

const MonitoreoView: React.FC<MonitoreoViewProps> = ({ themeColors }) => {
  const isDark = themeColors.bg.includes('950') || themeColors.bg.includes('slate-900');

  const [rows, setRows]         = useState<ActividadRow[]>([]);
  const [total, setTotal]       = useState(0);
  const [pages, setPages]       = useState(1);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Filtros
  const [correoFilter, setCorreoFilter] = useState('');
  const [eventoFilter, setEventoFilter] = useState('');
  const [desdeFilter,  setDesdeFilter]  = useState('');
  const [hastaFilter,  setHastaFilter]  = useState('');
  const [correosList,  setCorreosList]  = useState<{ correo: string; nombre: string; rol: string }[]>([]);
  const [eventosList,  setEventosList]  = useState<string[]>([]);

  // Cargar listas de correos y eventos una vez
  useEffect(() => {
    fetch('/api/actividad/usuarios', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(j => setCorreosList(j.data || []))
      .catch(() => {});

    fetch('/api/actividad/eventos', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(j => setEventosList(j.data || []))
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
      if (correoFilter) params.set('correo', correoFilter);
      if (eventoFilter) params.set('evento', eventoFilter);
      if (desdeFilter)  params.set('desde', desdeFilter);
      if (hastaFilter)  params.set('hasta', hastaFilter);

      const r = await fetch(`/api/actividad?${params}`, { credentials: 'include' });
      if (!r.ok) { setError('Error al cargar actividad.'); return; }
      const j = await r.json();
      setRows(j.data || []);
      setTotal(j.total || 0);
      setPages(j.pages || 1);
    } catch {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }, [page, correoFilter, eventoFilter, desdeFilter, hastaFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetFiltros = () => {
    setCorreoFilter(''); setEventoFilter('');
    setDesdeFilter(''); setHastaFilter('');
    setPage(1);
  };

  const inputCls = `px-3 py-1.5 text-xs rounded-lg border outline-none transition-all ${
    isDark
      ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-500'
      : 'bg-white border-slate-200 text-slate-700 placeholder-slate-400'
  }`;
  const selectCls = inputCls;

  return (
    <div style={{ padding: '32px 32px 0' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: isDark ? '#e2e8f0' : '#0F2A3F', marginBottom: 4 }}>
          Monitoreo de Actividad
        </h2>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>
          Registro de acciones de usuarios en el sistema.{' '}
          <span style={{ fontWeight: 600, color: '#0D9488' }}>{total.toLocaleString()}</span> eventos registrados.
        </p>
      </div>

      {/* Filtros */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20,
          padding: '14px 16px', borderRadius: 12,
          background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.07)'}`,
        }}
      >
        <select
          value={correoFilter}
          onChange={e => { setCorreoFilter(e.target.value); setPage(1); }}
          className={selectCls}
          style={{ minWidth: 200 }}
        >
          <option value="">Todos los usuarios</option>
          {correosList.map(u => (
            <option key={u.correo} value={u.correo}>
              {u.nombre} — {u.correo} ({u.rol})
            </option>
          ))}
        </select>

        <select
          value={eventoFilter}
          onChange={e => { setEventoFilter(e.target.value); setPage(1); }}
          className={selectCls}
          style={{ minWidth: 180 }}
        >
          <option value="">Todos los eventos</option>
          {eventosList.map(e => (
            <option key={e} value={e}>{EVENTO_LABELS[e] || e}</option>
          ))}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>Desde</span>
          <input
            type="date"
            value={desdeFilter}
            onChange={e => { setDesdeFilter(e.target.value); setPage(1); }}
            className={inputCls}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>Hasta</span>
          <input
            type="date"
            value={hastaFilter}
            onChange={e => { setHastaFilter(e.target.value); setPage(1); }}
            className={inputCls}
          />
        </div>

        {(correoFilter || eventoFilter || desdeFilter || hastaFilter) && (
          <button
            onClick={resetFiltros}
            style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
          >
            Limpiar filtros
          </button>
        )}

        <button
          onClick={fetchData}
          style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'white', background: '#0D9488', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}
        >
          Actualizar
        </button>
      </div>

      {/* Tabla */}
      <div
        style={{
          borderRadius: 12, border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.08)'}`,
          background: isDark ? '#1e293b' : 'white',
          overflow: 'hidden', marginBottom: 20,
        }}
      >
        {loading ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
            Cargando actividad...
          </div>
        ) : error ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: '#ef4444' }}>
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
            No hay registros con los filtros aplicados.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9' }}>
                  {['Usuario', 'Evento', 'Módulo', 'Elemento', 'IP', 'Fecha y hora'].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 14px', textAlign: 'left', fontWeight: 700,
                        fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.6px',
                        color: isDark ? '#94a3b8' : '#64748b',
                        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.id}
                    style={{
                      background: i % 2 === 0
                        ? (isDark ? 'transparent' : 'white')
                        : (isDark ? 'rgba(255,255,255,0.02)' : '#fafafa'),
                      borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9'}`,
                    }}
                  >
                    <td style={{ padding: '9px 14px', color: isDark ? '#cbd5e1' : '#1e293b', fontWeight: 500 }}>
                      {r.correo}
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{
                        display: 'inline-block', fontSize: 10, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 100,
                        background: (EVENTO_COLOR[r.evento] || '#94a3b8') + '20',
                        color: EVENTO_COLOR[r.evento] || '#94a3b8',
                      }}>
                        {EVENTO_LABELS[r.evento] || r.evento}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', color: isDark ? '#94a3b8' : '#64748b' }}>
                      {r.modulo || '—'}
                    </td>
                    <td style={{ padding: '9px 14px', color: isDark ? '#94a3b8' : '#64748b', maxWidth: 260 }}>
                      {r.elemento_titulo
                        ? <span title={r.elemento_titulo} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.elemento_tipo && (
                              <span style={{ fontSize: 9, fontWeight: 700, marginRight: 4,
                                color: r.elemento_tipo === 'señal' ? '#0D9488' : r.elemento_tipo === 'tendencia' ? '#8b5cf6' : '#f59e0b' }}>
                                [{r.elemento_tipo}]
                              </span>
                            )}
                            {r.elemento_titulo}
                          </span>
                        : '—'}
                    </td>
                    <td style={{ padding: '9px 14px', color: isDark ? '#64748b' : '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}>
                      {r.ip || '—'}
                    </td>
                    <td style={{ padding: '9px 14px', color: isDark ? '#64748b' : '#94a3b8', whiteSpace: 'nowrap' }}>
                      {fmtFecha(r.fecha_hora)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginación */}
      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 32 }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, background: 'none', cursor: page <= 1 ? 'default' : 'pointer', color: page <= 1 ? '#94a3b8' : (isDark ? '#cbd5e1' : '#1e293b') }}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: 11, color: '#94a3b8', padding: '0 8px' }}>
            Pág. {page} / {pages}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, background: 'none', cursor: page >= pages ? 'default' : 'pointer', color: page >= pages ? '#94a3b8' : (isDark ? '#cbd5e1' : '#1e293b') }}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
};

export default MonitoreoView;
