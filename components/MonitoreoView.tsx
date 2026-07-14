import React, { useState, useEffect, useCallback } from 'react';
import { ThemeColors } from '../types';

interface MonitoreoViewProps {
  themeColors: ThemeColors;
  onVolver?: () => void;
}

interface ActividadRow {
  id: number;
  correo: string | null;
  rol: string | null;
  evento: string;
  accion: string | null;
  modulo: string | null;
  entidad: string | null;
  entidad_id: string | null;
  elemento_tipo: string | null;
  elemento_titulo: string | null;
  detalle: string | null;
  ip: string | null;
  user_agent: string | null;
  // El driver MySQL ya entrega las columnas JSON como objeto parseado, no
  // como texto; puede llegar en cualquiera de las dos formas.
  metadata: Record<string, unknown> | string | null;
  fecha_hora: string;
}

//----------------TI-44 / TI-59----------------
const EVENTO_LABELS: Record<string, string> = {
  login: 'Inicio de sesion',
  logout: 'Cierre de sesion',
  nav_modulo: 'Acceso a modulo',
  ui_click: 'Click en interfaz',
  ui_change: 'Cambio en interfaz',
  ver_senal: 'Ver senal',
  ver_tendencia: 'Ver tendencia',
  ver_escenario: 'Ver escenario',
  descargar_informe: 'Descargar informe',
  login_exitoso: 'Login exitoso',
  login_fallido: 'Login fallido',
  login_bloqueado: 'Login bloqueado',
  login_otp_generado: 'OTP enviado',
  otp_fallido: 'OTP fallido',
  otp_expirado: 'OTP expirado',
  otp_bloqueado: 'OTP bloqueado',
  password_reset: 'Cambio password',
  usuario_creado: 'Usuario creado',
  usuario_actualizado: 'Usuario actualizado',
  usuario_password_reseteado: 'Password reseteado',
  api_mutacion: 'Cambio tecnico',
  auditoria_exportada: 'Auditoria exportada',
};

const EVENTO_COLOR: Record<string, string> = {
  login: '#10b981',
  logout: '#94a3b8',
  nav_modulo: '#3b82f6',
  ui_click: '#64748b',
  ui_change: '#0D9488',
  ver_senal: '#0D9488',
  ver_tendencia: '#8b5cf6',
  ver_escenario: '#f59e0b',
  descargar_informe: '#e74c3c',
  login_exitoso: '#10b981',
  login_fallido: '#ef4444',
  login_bloqueado: '#dc2626',
  login_otp_generado: '#0ea5e9',
  otp_fallido: '#f97316',
  otp_expirado: '#f59e0b',
  otp_bloqueado: '#dc2626',
  password_reset: '#8b5cf6',
  usuario_creado: '#16a34a',
  usuario_actualizado: '#3b82f6',
  usuario_password_reseteado: '#f97316',
  api_mutacion: '#0f766e',
  auditoria_exportada: '#14b8a6',
};

function fmtFecha(s: string) {
  return new Date(s).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type MetadataInput = Record<string, unknown> | string | null | undefined;

function parseMetadata(value: MetadataInput) {
  if (!value) return null;
  // El driver MySQL entrega las columnas JSON ya parseadas como objeto; solo
  // hace falta JSON.parse cuando de verdad llega como texto (p.ej. CSV/otros).
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try { return JSON.parse(value); } catch { return null; }
}

//----------------TI-09----------------
const ESTADO_ID_LABELS: Record<string, string> = {
  '1': 'Publicado',
  '2': 'En revisión',
  '3': 'Borrador',
  '4': 'Archivado',
};

function snapshotTexto(snapshot: Record<string, unknown>) {
  return Object.entries(snapshot)
    .map(([k, v]) => `${k}=${k === 'id_estado' ? (ESTADO_ID_LABELS[String(v)] || v) : v}`)
    .join(', ');
}

function metadataSummary(value: MetadataInput) {
  const data = parseMetadata(value);
  if (!data || typeof data !== 'object') return '';
  const parts: string[] = [];
  // La columna VISTA ya muestra este dato traducido; no repetirlo en Detalle.
  if (data.usuarioObjetivo) parts.push(`Usuario afectado: ${data.usuarioObjetivo}`);
  if (data.anio) parts.push(`Año: ${data.anio}`);
  if (data.unidad) parts.push(`Unidad: ${data.unidad}`);
  if (data.facultad) parts.push(`Facultad: ${data.facultad}`);
  if (data.ruta) parts.push(`Ruta: ${data.ruta}`);
  if (data.estadoHttp) parts.push(`HTTP: ${data.estadoHttp}`);
  if (data.datos && typeof data.datos === 'object' && Object.keys(data.datos).length) {
    parts.push(`Datos: ${Object.keys(data.datos).slice(0, 6).join(', ')}`);
  }
  if (Array.isArray(data.cambios) && data.cambios.length) {
    parts.push(`Cambios: ${data.cambios.map((c: any) => c.campo).join(', ')}`);
  }
  //----------------TI-09----------------
  if (data.antes && typeof data.antes === 'object' && Object.keys(data.antes).length) {
    parts.push(`Antes: ${snapshotTexto(data.antes)}`);
  }
  if (data.ahora && typeof data.ahora === 'object' && Object.keys(data.ahora).length) {
    parts.push(`Ahora: ${snapshotTexto(data.ahora)}`);
  }
  return parts.join(' | ');
}

function metadataValue(value: MetadataInput, key: string) {
  const data = parseMetadata(value);
  if (!data || typeof data !== 'object') return '';
  return typeof data[key] === 'string' || typeof data[key] === 'number' ? String(data[key]) : '';
}

function userAgentSummary(value: string | null) {
  if (!value) return '-';
  const browser = /Edg\//.test(value) ? 'Edge'
    : /Chrome\//.test(value) ? 'Chrome'
    : /Firefox\//.test(value) ? 'Firefox'
    : /Safari\//.test(value) ? 'Safari'
    : 'Navegador';
  const os = /Windows/i.test(value) ? 'Windows'
    : /Android/i.test(value) ? 'Android'
    : /iPhone|iPad/i.test(value) ? 'iOS'
    : /Mac OS/i.test(value) ? 'macOS'
    : /Linux/i.test(value) ? 'Linux'
    : 'SO no identificado';
  return `${browser} / ${os}`;
}

function cleanElementLabel(value: string) {
  const raw = value.replace(/\s+/g, ' ').trim();
  const iconToken = raw.match(/^([a-z][a-z0-9_]{2,})(?=[A-ZÁÉÍÓÚÑ])/);
  if (iconToken) {
    return raw.slice(iconToken[1].length).replace(/^[\s_-]+/, '').trim();
  }
  return raw;
}

function auditKey(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

const MODULE_LABELS: Record<string, string> = {
  inicio: 'Inicio',
  radar: 'Radar',
  empleabilidad: 'Empleo',
  certificaciones: 'Certificaciones',
  impactos: 'Informes',
  curricular: 'Curricular',
  mercadoLaboral: 'Mercado',
  informes: 'Informes',
  gestion: 'Gestión',
  gestion_usuarios: 'Gestión de usuarios',
};

const VIEW_LABELS_BY_MODULE: Record<string, Record<string, string>> = {
  gestion: {
    radar: 'Radar',
    senales: 'Señales',
    tendencias: 'Tendencias',
    escenarios: 'Escenarios',
    importar: 'Importar',
    empleo: 'Empleo',
    curricular: 'Curricular',
    mercado: 'Mercado',
    usuarios: 'Usuarios y Accesos',
    alertas: 'Alertas',
    monitoreo: 'Monitoreo',
    gestion: 'Gestión',
  },
  empleabilidad: {
    'informacion general': 'Información General',
    'egresados en actividad laboral': 'Egresados en Actividad Laboral',
    'egresados emprendedores': 'Egresados Emprendedores',
    'egresados en busqueda laboral': 'Egresados en Búsqueda Laboral',
    'descarga de informes': 'Descarga de Informes',
    empleabilidad: 'Empleo',
  },
  certificaciones: {
    constructor: 'Constructor',
    certificaciones: 'Certificaciones',
  },
  curricular: {
    'mapa curricular': 'Mapa Curricular',
    'mapa silabos': 'Mapa Sílabos',
    benchmarking: 'Benchmarking',
    'impacto curricular': 'Impacto Curricular',
    curricular: 'Curricular',
  },
  mercadoLaboral: {
    'como se elaboraron': 'Como se elaboraron',
    'ver informes': 'Ver Informes',
    'informes de mercado laboral': 'Ver Informes',
    informes: 'Ver Informes',
    'mercado laboral': 'Mercado',
    mercadolaboral: 'Mercado',
  },
  radar: {
    senales: 'Señales',
    tendencias: 'Tendencias',
    escenarios: 'Escenarios',
    'cadena causal': 'Cadena Causal',
    radar: 'Radar',
  },
  informes: {
    informes: 'Informes',
  },
};

function moduleLabel(value: string | null) {
  if (!value) return '-';
  return MODULE_LABELS[value] || value;
}

function viewLabelFor(moduleName: string | null, value: string) {
  if (!moduleName || !value || value === '-') return value || '-';
  return VIEW_LABELS_BY_MODULE[moduleName]?.[auditKey(value)] || value;
}

function normalizeRowAudit(r: ActividadRow) {
  // "vista" es siempre la seccion (metadata.vista, con Radar agrupando sus
  // sub-pestañas); "elemento" es el detalle mas fino (p.ej. que sub-pestaña
  // de Radar, o el boton/campo especifico) y solo se oculta cuando es
  // literalmente el mismo texto que la vista ya mostrada (redundante).
  const metadataVista = metadataValue(r.metadata, 'vista');
  const rawVista = metadataVista || r.modulo || '-';
  const vista = viewLabelFor(r.modulo, rawVista);
  const elementoTipoLabel = r.elemento_tipo ? viewLabelFor(r.modulo, r.elemento_tipo) : '';
  const rawElemento = cleanElementLabel(
    r.elemento_titulo || metadataValue(r.metadata, 'etiqueta') || metadataValue(r.metadata, 'usuarioObjetivo') || elementoTipoLabel || '-'
  );
  const elemento = auditKey(rawElemento) === auditKey(vista) ? '-' : rawElemento;
  return { modulo: moduleLabel(r.modulo), vista, elemento };
}

const PAGE_LIMIT = 50;

//----------------TI-44 / TI-59----------------
const MonitoreoView: React.FC<MonitoreoViewProps> = ({ themeColors, onVolver }) => {
  const isDark = themeColors.bg.includes('950') || themeColors.bg.includes('slate-900');
  const [rows, setRows] = useState<ActividadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correoFilter, setCorreoFilter] = useState('');
  const [eventoFilter, setEventoFilter] = useState('');
  const [accionFilter, setAccionFilter] = useState('');
  const [moduloFilter, setModuloFilter] = useState('');
  const [ipFilter, setIpFilter] = useState('');
  const [qFilter, setQFilter] = useState('');
  const [desdeFilter, setDesdeFilter] = useState('');
  const [hastaFilter, setHastaFilter] = useState('');
  const [correosList, setCorreosList] = useState<{ correo: string; nombre: string; rol: string }[]>([]);
  const [eventosList, setEventosList] = useState<string[]>([]);
  const [accionesList, setAccionesList] = useState<string[]>([]);
  const [modulosList, setModulosList] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/actividad/usuarios', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(j => setCorreosList(j.data || []))
      .catch(() => {});

    fetch('/api/actividad/eventos', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(j => setEventosList(j.data || []))
      .catch(() => {});

    fetch('/api/actividad/acciones', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(j => setAccionesList(j.data || []))
      .catch(() => {});

    fetch('/api/actividad/modulos', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(j => setModulosList(j.data || []))
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
      if (correoFilter) params.set('correo', correoFilter);
      if (eventoFilter) params.set('evento', eventoFilter);
      if (accionFilter) params.set('accion', accionFilter);
      if (moduloFilter) params.set('modulo', moduloFilter);
      if (ipFilter) params.set('ip', ipFilter);
      if (qFilter) params.set('q', qFilter);
      if (desdeFilter) params.set('desde', desdeFilter);
      if (hastaFilter) params.set('hasta', hastaFilter);

      const r = await fetch(`/api/actividad?${params}`, { credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error || 'Error al cargar actividad.');
        return;
      }
      setRows(j.data || []);
      setTotal(j.total || 0);
      setPages(j.pages || 1);
    } catch {
      setError('Error de conexion.');
    } finally {
      setLoading(false);
    }
  }, [page, correoFilter, eventoFilter, accionFilter, moduloFilter, ipFilter, qFilter, desdeFilter, hastaFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetFiltros = () => {
    setCorreoFilter('');
    setEventoFilter('');
    setAccionFilter('');
    setModuloFilter('');
    setIpFilter('');
    setQFilter('');
    setDesdeFilter('');
    setHastaFilter('');
    setPage(1);
  };

  const buildFilterParams = () => {
    const params = new URLSearchParams();
    if (correoFilter) params.set('correo', correoFilter);
    if (eventoFilter) params.set('evento', eventoFilter);
    if (accionFilter) params.set('accion', accionFilter);
    if (moduloFilter) params.set('modulo', moduloFilter);
    if (ipFilter) params.set('ip', ipFilter);
    if (qFilter) params.set('q', qFilter);
    if (desdeFilter) params.set('desde', desdeFilter);
    if (hastaFilter) params.set('hasta', hastaFilter);
    return params;
  };

  const exportCsv = () => {
    const qs = buildFilterParams().toString();
    window.open(`/api/actividad/export${qs ? `?${qs}` : ''}`, '_blank', 'noopener,noreferrer');
  };

  const inputCls = `px-3 py-1.5 text-xs rounded-lg border outline-none transition-all ${
    isDark
      ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-500'
      : 'bg-white border-slate-200 text-slate-700 placeholder-slate-400'
  }`;

  return (
    <div style={{ padding: '32px 32px 0' }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: isDark ? '#e2e8f0' : '#0F2A3F', marginBottom: 4 }}>
            Monitoreo de Auditoria
          </h2>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>
            Accesos, cambios, descargas y gestion de usuarios. <span style={{ fontWeight: 700, color: '#0D9488' }}>{total.toLocaleString()}</span> eventos registrados.
          </p>
        </div>
        {onVolver && (
          <button
            type="button"
            onClick={onVolver}
            style={{ border: '1px solid #cbd5e1', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#e2e8f0' : '#334155', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Volver a Gestion
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(210px, 1.4fr) minmax(160px, .8fr) minmax(150px, .8fr) 140px 140px minmax(180px, 1fr) minmax(150px, .8fr) 110px auto auto', alignItems: 'center', gap: 10, marginBottom: 20, padding: '14px 16px', borderRadius: 12, background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.07)'}`, overflowX: 'auto' }}>
        <select value={correoFilter} onChange={e => { setCorreoFilter(e.target.value); setPage(1); }} className={inputCls} style={{ width: '100%' }}>
          <option value="">Todos los usuarios</option>
          {correosList.map(u => <option key={u.correo} value={u.correo}>{u.nombre} - {u.correo} ({u.rol})</option>)}
        </select>

        <select value={eventoFilter} onChange={e => { setEventoFilter(e.target.value); setPage(1); }} className={inputCls} style={{ width: '100%' }}>
          <option value="">Todos los eventos</option>
          {eventosList.map(e => <option key={e} value={e}>{EVENTO_LABELS[e] || e}</option>)}
        </select>

        <select value={moduloFilter} onChange={e => { setModuloFilter(e.target.value); setPage(1); }} className={inputCls} style={{ width: '100%' }}>
          <option value="">Todos los modulos</option>
          {modulosList.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <input type="date" value={desdeFilter} onChange={e => { setDesdeFilter(e.target.value); setPage(1); }} className={inputCls} />
        <input type="date" value={hastaFilter} onChange={e => { setHastaFilter(e.target.value); setPage(1); }} className={inputCls} />

        <input value={qFilter} onChange={e => { setQFilter(e.target.value); setPage(1); }} className={inputCls} placeholder="Buscar detalle, IP o usuario" style={{ width: '100%' }} />

        <select value={accionFilter} onChange={e => { setAccionFilter(e.target.value); setPage(1); }} className={inputCls} style={{ width: '100%' }}>
          <option value="">Todas las acciones</option>
          {accionesList.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <input value={ipFilter} onChange={e => { setIpFilter(e.target.value); setPage(1); }} className={inputCls} placeholder="IP" style={{ width: '100%' }} />

        {(correoFilter || eventoFilter || accionFilter || moduloFilter || ipFilter || qFilter || desdeFilter || hastaFilter) && (
          <button onClick={resetFiltros} style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', whiteSpace: 'nowrap' }}>
            Limpiar filtros
          </button>
        )}

        <button onClick={exportCsv} style={{ fontSize: 11, fontWeight: 800, color: '#0f766e', background: '#ccfbf1', border: '1px solid #99f6e4', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Exportar CSV
        </button>

        <button onClick={fetchData} style={{ fontSize: 11, fontWeight: 800, color: 'white', background: '#0D9488', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Actualizar
        </button>
      </div>

      <div style={{ borderRadius: 12, border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.08)'}`, background: isDark ? '#1e293b' : 'white', overflow: 'hidden', marginBottom: 20 }}>
        {loading ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Cargando auditoria...</div>
        ) : error ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: '#ef4444' }}>{error}</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>No hay registros con los filtros aplicados.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9' }}>
                  {['Usuario', 'Evento', 'Accion', 'Modulo', 'Vista', 'Elemento', 'Detalle', 'IP', 'Dispositivo', 'Fecha y hora'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, fontSize: 10, textTransform: 'uppercase', color: isDark ? '#94a3b8' : '#64748b', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const auditDisplay = normalizeRowAudit(r);
                  const vista = auditDisplay.vista;
                  const elemento = auditDisplay.elemento;
                  const extra = r.evento === 'ui_click' ? '' : metadataSummary(r.metadata);
                  const detalleBase = [r.elemento_titulo, r.detalle].filter(Boolean).join(' - ')
                    || (r.entidad ? `${r.entidad}${r.entidad_id ? ` ${r.entidad_id}` : ''}` : '');
                  const detalle = r.evento === 'ui_click'
                    ? `[${r.elemento_tipo || 'boton'}]`
                    : [detalleBase, extra].filter(Boolean).join(' | ');
                  return (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? (isDark ? 'transparent' : 'white') : (isDark ? 'rgba(255,255,255,0.02)' : '#fafafa'), borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9'}` }}>
                      <td style={{ padding: '9px 14px', color: isDark ? '#cbd5e1' : '#1e293b', fontWeight: 600 }}>
                        {r.correo || '-'}
                        {r.rol && <span style={{ display: 'block', fontSize: 10, color: '#94a3b8' }}>{r.rol}</span>}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100, background: (EVENTO_COLOR[r.evento] || '#94a3b8') + '20', color: EVENTO_COLOR[r.evento] || '#94a3b8' }}>
                          {EVENTO_LABELS[r.evento] || r.evento}
                        </span>
                      </td>
                      <td style={{ padding: '9px 14px', color: isDark ? '#94a3b8' : '#64748b' }}>{r.accion || '-'}</td>
                      <td style={{ padding: '9px 14px', color: isDark ? '#94a3b8' : '#64748b' }}>{auditDisplay.modulo}</td>
                      <td style={{ padding: '9px 14px', color: isDark ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap' }}>{vista}</td>
                      <td style={{ padding: '9px 14px', color: isDark ? '#94a3b8' : '#64748b', minWidth: 180, maxWidth: 260 }}>
                        <span title={elemento} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{elemento}</span>
                      </td>
                      <td style={{ padding: '9px 14px', color: isDark ? '#94a3b8' : '#64748b', minWidth: 260, maxWidth: 460 }}>
                        <span title={detalle} style={{ display: 'block', lineHeight: 1.45, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                          {r.evento !== 'ui_click' && r.elemento_tipo && <strong>[{r.elemento_tipo}] </strong>}
                          {detalle || '-'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 14px', color: isDark ? '#64748b' : '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}>{r.ip || '-'}</td>
                      <td style={{ padding: '9px 14px', color: isDark ? '#64748b' : '#94a3b8', minWidth: 150 }}>
                        <span title={r.user_agent || ''}>{userAgentSummary(r.user_agent)}</span>
                      </td>
                      <td style={{ padding: '9px 14px', color: isDark ? '#64748b' : '#94a3b8', whiteSpace: 'nowrap' }}>{fmtFecha(r.fecha_hora)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 32 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, background: 'none', cursor: page <= 1 ? 'default' : 'pointer', color: page <= 1 ? '#94a3b8' : (isDark ? '#cbd5e1' : '#1e293b') }}>
            Anterior
          </button>
          <span style={{ fontSize: 11, color: '#94a3b8', padding: '0 8px' }}>Pag. {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, background: 'none', cursor: page >= pages ? 'default' : 'pointer', color: page >= pages ? '#94a3b8' : (isDark ? '#cbd5e1' : '#1e293b') }}>
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
};

export default MonitoreoView;
