
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeColors } from '../types';

interface ImpactoCurricularViewProps {
  themeColors: ThemeColors;
  userRole?: string;
  idCarrera: number | null;
  idMallaVersion: number | null;
  nombreCarrera?: string;
  nombreMalla?: string;
}

interface KpisImpacto {
  total_impactos: number;
  total_brechas: number;
  propuestas_pendientes: number;
  propuestas_aprobadas: number;
  evidencias_verificadas: number;
  score_promedio: number | null;
  ultima_ejecucion: string | null;
}

interface Impacto {
  id_impacto: number;
  titulo_impacto: string;
  descripcion_impacto: string | null;
  nivel_impacto: 'bajo' | 'medio' | 'alto' | 'critico';
  score_impacto: number;
  estado: string;
  nombre_curso: string | null;
  numero_ciclo: number | null;
  created_at: string;
}

interface Brecha {
  id_brecha: number;
  id_impacto: number;
  tipo_brecha: string;
  descripcion_brecha: string;
  competencia_afectada: string | null;
  evidencia_resumen: string | null;
  prioridad: 'baja' | 'media' | 'alta' | 'critica';
  nombre_curso: string | null;
  titulo_impacto: string;
  score_impacto: number;
}

interface Propuesta {
  id_propuesta: number;
  id_brecha: number;
  tipo_propuesta: string;
  titulo_propuesta: string;
  descripcion_propuesta: string;
  justificacion: string;
  impacto_esperado: string | null;
  estado_revision: 'pendiente' | 'aprobada' | 'rechazada' | 'observada';
  usuario_creador: string | null;
  usuario_revisor: string | null;
  fecha_revision: string | null;
  descripcion_brecha: string;
  tipo_brecha: string;
  prioridad_brecha: string;
  nombre_curso: string | null;
}

interface Evidencia {
  id_evidencia: number;
  modulo_origen: string;
  tipo_evidencia: string;
  titulo_evidencia: string;
  descripcion_evidencia: string | null;
  fuente_url: string | null;
  nivel_confianza: number;
  estado_verificacion: string;
  peso: number;
  justificacion_relacion: string | null;
}

/* ---- Paleta unificada Visión 360 / Benchmarking / Plan de acción ---- */
const USIL = '#001a48';            // Navy primario
const CYAN = '#006876';            // Cyan secundario
const SURFACE_LOW = '#f1f4f7';     // Superficie clara
const OUTLINE_VARIANT = '#c4c6d2'; // Borde/outline
const ERROR = '#ba1a1a';           // Error / crítico
const FONT_HEAD = "'Manrope', 'Segoe UI', sans-serif";
const FONT_DATA = "'Inter', 'Segoe UI', sans-serif";

const NIVEL_IMPACTO: Record<string, { bg: string; text: string; label: string; border: string }> = {
  bajo:    { bg: '#dcfce7', text: '#166534', label: 'Bajo',    border: '#22c55e' },
  medio:   { bg: '#fef9c3', text: '#854d0e', label: 'Medio',   border: '#eab308' },
  alto:    { bg: '#ffedd5', text: '#9a3412', label: 'Alto',    border: '#f97316' },
  critico: { bg: '#ffdad6', text: '#93000a', label: 'Crítico', border: ERROR },
};
const PRIORIDAD_BADGE = NIVEL_IMPACTO;

const ESTADO_PROP: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  pendiente:  { bg: '#fef9c3', text: '#854d0e', label: 'Pendiente',  dot: '#eab308' },
  aprobada:   { bg: '#dcfce7', text: '#166534', label: 'Aprobada',   dot: '#22c55e' },
  rechazada:  { bg: '#ffdad6', text: '#93000a', label: 'Rechazada',  dot: ERROR },
  observada:  { bg: '#e0f7fb', text: '#004c5c', label: 'Observada',  dot: CYAN },
};

const MODULO_BADGE: Record<string, { bg: string; text: string }> = {
  radar:          { bg: '#e6ecfb', text: USIL },
  empleabilidad:  { bg: '#dcfce7', text: '#166534' },
  mercado_laboral:{ bg: '#ffedd5', text: '#9a3412' },
  benchmarking:   { bg: '#e0f7fb', text: '#004c5c' },
};

const normalizeKey = (value: unknown) => String(value ?? '').trim().toLowerCase();
const formatBadgeText = (value: unknown, fallback = 'Sin clasificar') => {
  const text = String(value ?? '').trim();
  return text ? text.replace(/_/g, ' ') : fallback;
};

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as any).error || `Error ${r.status}`);
  return data as T;
}

type TabMotor = 'impactos' | 'brechas' | 'propuestas';
const VALID_IMPACTO_TABS: TabMotor[] = ['impactos', 'brechas', 'propuestas'];

const ImpactoCurricularView: React.FC<ImpactoCurricularViewProps> = ({
  themeColors, userRole, idCarrera, idMallaVersion, nombreCarrera, nombreMalla,
}) => {
  const isDark   = themeColors.bg?.includes('950') || themeColors.bg?.includes('slate-900') || false;
  const card     = isDark ? '#1e293b' : '#ffffff';
  const text     = isDark ? '#f1f5f9' : '#191c1e';
  const muted    = isDark ? '#94a3b8' : '#444651';
  const border   = isDark ? 'rgba(148,163,184,0.15)' : OUTLINE_VARIANT;
  const canEdit  = userRole === 'admin';

  const [kpis, setKpis]             = useState<KpisImpacto | null>(null);
  const [impactos, setImpactos]     = useState<Impacto[]>([]);
  const [brechas, setBrechas]       = useState<Brecha[]>([]);
  const [propuestas, setPropuestas] = useState<Propuesta[]>([]);
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [selectedImpacto, setSelectedImpacto] = useState<number | null>(null);
  const [panelTitle, setPanelTitle] = useState<string>('Evidencias del Impacto');
  const [tab, setTab]               = useState<TabMotor>(() => {
    const stored = localStorage.getItem('radar_impacto_curricular_tab') as TabMotor | null;
    return stored && VALID_IMPACTO_TABS.includes(stored) ? stored : 'impactos';
  });
  const [analyzing, setAnalyzing]   = useState(false);
  const [analyzeResumen, setAnalyzeResumen] = useState<{ total: number; analizados: number; omitidos: number; errores: number; impactos: number; brechas: number; propuestas: number } | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});
  const [pesos, setPesos]           = useState({ radar: 0.25, mercado_laboral: 0.25, empleabilidad: 0.30, benchmarking: 0.20 });
  const [showPesos, setShowPesos]   = useState(false);
  const [observacion, setObservacion] = useState('');
  const [showObs, setShowObs]       = useState<{ id: number; estado: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!idCarrera || !idMallaVersion) return;
    setLoading(true);
    setError(null);
    try {
      const [kpisData, imps, bres, props] = await Promise.all([
        apiFetch<KpisImpacto>(`/api/curricular/kpis-impacto/${idCarrera}?id_malla=${idMallaVersion}`),
        apiFetch<Impacto[]>(`/api/curricular/impactos/${idCarrera}?id_malla=${idMallaVersion}`),
        apiFetch<Brecha[]>(`/api/curricular/brechas/${idCarrera}?id_malla=${idMallaVersion}`),
        apiFetch<Propuesta[]>(`/api/curricular/propuestas/${idCarrera}?id_malla=${idMallaVersion}`),
      ]);
      setKpis(kpisData);
      setImpactos(imps);
      setBrechas(bres);
      setPropuestas(props);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [idCarrera, idMallaVersion]);

  const switchTab = (nextTab: TabMotor) => {
    localStorage.setItem('radar_impacto_curricular_tab', nextTab);
    setTab(nextTab);
  };

  useEffect(() => { loadData(); }, [loadData]);

  const loadEvidencias = async (idImpacto: number, title = 'Evidencias del Impacto') => {
    setSelectedImpacto(idImpacto);
    setPanelTitle(title);
    try {
      const evs = await apiFetch<Evidencia[]>(`/api/curricular/evidencias/${idImpacto}`);
      setEvidencias(evs);
    } catch { setEvidencias([]); }
  };

  const handleAnalizar = async () => {
    if (!idCarrera || !idMallaVersion) return;
    setAnalyzing(true);
    setError(null);
    setAnalyzeResumen(null);
    try {
      const resumen = await apiFetch<typeof analyzeResumen>(`/api/curricular/analizar-impacto/${idCarrera}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_malla_version: idMallaVersion, pesos }),
      });
      setAnalyzeResumen(resumen);
      await loadData();
    } catch (e: any) { setError(e.message); }
    setAnalyzing(false);
  };

  const handleCambiarEstado = async (idPropuesta: number, estadoNuevo: string, obs?: string) => {
    setActionLoading(p => ({ ...p, [idPropuesta]: estadoNuevo }));
    try {
      await apiFetch(`/api/curricular/propuestas/${idPropuesta}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado_revision: estadoNuevo, observacion: obs ?? null }),
      });
      await loadData();
      setShowObs(null); setObservacion('');
    } catch (e: any) { setError(e.message); }
    setActionLoading(p => ({ ...p, [idPropuesta]: '' }));
  };

  const handleGenerarVersion = async (idPropuesta: number) => {
    setActionLoading(p => ({ ...p, [idPropuesta]: 'version' }));
    try {
      const r = await apiFetch<{ id: number; nombre_version: string }>(
        `/api/curricular/propuestas/${idPropuesta}/generar-version-malla`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }
      );
      alert(`✅ Nueva versión de malla generada: "${r.nombre_version}"`);
    } catch (e: any) { setError(e.message); }
    setActionLoading(p => ({ ...p, [idPropuesta]: '' }));
  };

  // Mapa brecha -> impacto, para poder enlazar cada propuesta con la evidencia real de su impacto de origen.
  const brechaById = useMemo(() => {
    const m = new Map<number, Brecha>();
    brechas.forEach(b => m.set(b.id_brecha, b));
    return m;
  }, [brechas]);

  // Conteo real por estado_revision (4 estados existentes) para el pipeline visual.
  const countByEstado = useMemo(() => {
    const c: Record<string, number> = { pendiente: 0, aprobada: 0, rechazada: 0, observada: 0 };
    propuestas.forEach(p => { c[p.estado_revision] = (c[p.estado_revision] ?? 0) + 1; });
    return c;
  }, [propuestas]);

  // Últimas decisiones reales: propuestas con fecha_revision + usuario_revisor ya registrados.
  const ultimasDecisiones = useMemo(() => {
    return propuestas
      .filter(p => p.fecha_revision && p.estado_revision !== 'pendiente')
      .sort((a, b) => new Date(b.fecha_revision as string).getTime() - new Date(a.fecha_revision as string).getTime())
      .slice(0, 5);
  }, [propuestas]);

  if (!idCarrera || !idMallaVersion) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: muted, fontFamily: FONT_DATA }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Selecciona una carrera y versión de malla para analizar el impacto curricular</div>
      </div>
    );
  }

  return (
    <div style={{ color: text, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT_DATA }}>

      {/* Encabezado de página */}
      <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: '16px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
            color: CYAN, marginBottom: 4 }}>
            Motor de Impacto Curricular
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 700, color: USIL, letterSpacing: '-0.01em' }}>
            {nombreCarrera ?? 'Carrera'} · {nombreMalla ?? 'Malla actual'}
          </div>
          {kpis?.ultima_ejecucion && (
            <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>
              Último análisis: {new Date(kpis.ultima_ejecucion).toLocaleString('es-PE')}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canEdit && (
            <button onClick={() => setShowPesos(!showPesos)}
              style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${border}`,
                background: 'transparent', color: USIL, fontWeight: 700, fontSize: 11, cursor: 'pointer',
                fontFamily: FONT_DATA }}>
              ⚙ Pesos
            </button>
          )}
          {canEdit && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <button onClick={handleAnalizar} disabled={analyzing}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none',
                  background: analyzing ? '#94a3b8' : USIL,
                  color: '#fff', fontWeight: 800, fontSize: 12, cursor: analyzing ? 'not-allowed' : 'pointer',
                  fontFamily: FONT_DATA }}>
                {analyzing ? 'Analizando...' : '▶ Analizar Impacto Curricular'}
              </button>
              {analyzeResumen && (
                <span style={{ fontSize: 10, color: analyzeResumen.impactos > 0 ? '#166534' : '#9a3412', maxWidth: 280, textAlign: 'right' }}>
                  {analyzeResumen.analizados} de {analyzeResumen.total} cursos con evidencia analizados
                  {analyzeResumen.omitidos > 0 ? ` · ${analyzeResumen.omitidos} sin evidencia` : ''}
                  {analyzeResumen.errores > 0 ? ` · ${analyzeResumen.errores} con error` : ''}
                  {' → '}{analyzeResumen.impactos} impactos, {analyzeResumen.brechas} brechas, {analyzeResumen.propuestas} propuestas
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {showPesos && (
        <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: USIL, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pesos del Motor (deben sumar 1.00)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {[
              { key: 'radar', label: 'Radar' },
              { key: 'mercado_laboral', label: 'Mercado Laboral' },
              { key: 'empleabilidad', label: 'Empleabilidad' },
              { key: 'benchmarking', label: 'Benchmarking' },
            ].map(p => (
              <div key={p.key}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, textTransform: 'uppercase' }}>
                  {p.label}
                </label>
                <input type="number" min="0" max="1" step="0.05"
                  value={(pesos as any)[p.key]}
                  onChange={e => setPesos(prev => ({ ...prev, [p.key]: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: `1px solid ${border}`,
                    background: isDark ? '#0f172a' : SURFACE_LOW, color: text, fontSize: 12, fontFamily: FONT_DATA }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: '#ffdad6', border: `1px solid ${ERROR}33`, borderRadius: 10,
          padding: '10px 14px', color: '#93000a', fontSize: 12, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* KPIs */}
      {kpis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
          {[
            { label: 'Cursos Afectados', value: kpis.total_impactos, accent: '#f97316', sub: 'impactos detectados' },
            { label: 'Brechas Detectadas', value: kpis.total_brechas, accent: ERROR, sub: 'gaps identificados' },
            { label: 'Propuestas Pendientes', value: kpis.propuestas_pendientes, accent: '#eab308', sub: 'requieren revisión' },
            { label: 'Propuestas Aprobadas', value: kpis.propuestas_aprobadas, accent: '#22c55e', sub: 'listas para aplicar' },
            { label: 'Score de Impacto', value: kpis.score_promedio !== null ? `${kpis.score_promedio}` : '—', accent: USIL, sub: 'promedio ponderado' },
          ].map((k, i) => (
            <div key={i} style={{ background: card, borderRadius: 12, padding: '14px 16px',
              border: `1px solid ${border}`, borderTop: `3px solid ${k.accent}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: muted, marginBottom: 6 }}>
                {k.label}
              </div>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 28, fontWeight: 800, color: k.accent, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 10, color: muted, marginTop: 5 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Pipeline de estados reales de propuestas */}
      {kpis && (
        <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: '18px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: muted, fontFamily: FONT_DATA }}>
            Pipeline de Propuestas Curriculares
          </h3>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
            {([
              { key: 'pendiente', label: 'Pendientes' },
              { key: 'observada', label: 'Observadas' },
              { key: 'rechazada', label: 'Rechazadas' },
              { key: 'aprobada', label: 'Aprobadas' },
            ] as { key: keyof typeof countByEstado; label: string }[]).map((step, idx, arr) => {
              const cfg = ESTADO_PROP[step.key];
              return (
                <React.Fragment key={step.key}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: cfg.bg,
                      border: `1px solid ${cfg.dot}55`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 800, color: cfg.text, marginBottom: 8 }}>
                      {countByEstado[step.key] ?? 0}
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: text }}>
                      {step.label}
                    </span>
                  </div>
                  {idx < arr.length - 1 && (
                    <div style={{ flex: 0.6, height: 2, background: OUTLINE_VARIANT, marginTop: 24, opacity: 0.6 }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `2px solid ${border}`, paddingBottom: 0 }}>
        {([
          { key: 'impactos',   label: `Impactos (${impactos.length})` },
          { key: 'brechas',    label: `Brechas (${brechas.length})` },
          { key: 'propuestas', label: `Propuestas (${propuestas.length})` },
        ] as { key: TabMotor; label: string }[]).map(t => (
          <button key={t.key} onClick={() => switchTab(t.key)}
            style={{ padding: '9px 16px', border: 'none', borderBottom: tab === t.key ? `2px solid ${USIL}` : '2px solid transparent',
              background: 'transparent', color: tab === t.key ? USIL : muted,
              fontWeight: tab === t.key ? 800 : 600, fontSize: 12, cursor: 'pointer', marginBottom: -2,
              fontFamily: FONT_DATA }}>
            {t.label}
          </button>
        ))}
        {loading && <span style={{ marginLeft: 8, fontSize: 10, color: muted, alignSelf: 'center' }}>Cargando...</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedImpacto ? '1fr 320px' : '1fr 300px', gap: 14, alignItems: 'start' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {tab === 'impactos' && (
            impactos.length === 0 ? (
              <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`,
                padding: 32, textAlign: 'center', color: muted, fontSize: 12 }}>
                {loading ? 'Cargando...' : 'Sin impactos detectados. Ejecuta el análisis para comenzar.'}
              </div>
            ) : impactos.map(imp => {
              const cfg = NIVEL_IMPACTO[imp.nivel_impacto] ?? NIVEL_IMPACTO.bajo;
              const active = selectedImpacto === imp.id_impacto;
              return (
                <div key={imp.id_impacto}
                  onClick={() => loadEvidencias(imp.id_impacto, 'Evidencias del Impacto')}
                  style={{ background: card, borderRadius: 10, border: `1px solid ${active ? USIL : border}`,
                    padding: '14px 18px', cursor: 'pointer',
                    boxShadow: active ? `0 0 0 2px ${USIL}22` : '0 1px 3px rgba(0,0,0,0.04)',
                    transition: 'border-color .15s, box-shadow .15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 13, marginBottom: 4, color: USIL }}>{imp.titulo_impacto}</div>
                      {imp.descripcion_impacto && (
                        <div style={{ fontSize: 11, color: muted, lineHeight: 1.4 }}>{imp.descripcion_impacto}</div>
                      )}
                      {imp.nombre_curso && (
                        <div style={{ fontSize: 10, color: CYAN, fontWeight: 700, marginTop: 6 }}>
                          Ciclo {imp.numero_ciclo} · {imp.nombre_curso}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 9px', borderRadius: 100,
                        background: cfg.bg, color: cfg.text }}>
                        {cfg.label}
                      </span>
                      <span style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 800, color: cfg.border, lineHeight: 1 }}>
                        {Number(imp.score_impacto).toFixed(0)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {tab === 'brechas' && (
            brechas.length === 0 ? (
              <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`,
                padding: 32, textAlign: 'center', color: muted, fontSize: 12 }}>
                {loading ? 'Cargando...' : 'Sin brechas detectadas.'}
              </div>
            ) : brechas.map(b => {
              const prioridad = normalizeKey(b.prioridad) || 'media';
              const cfg = PRIORIDAD_BADGE[prioridad] ?? PRIORIDAD_BADGE.medio;
              const active = selectedImpacto === b.id_impacto;
              return (
                <div key={b.id_brecha}
                  onClick={() => loadEvidencias(b.id_impacto, 'Evidencias de la Brecha')}
                  style={{ background: card, borderRadius: 10, border: `1px solid ${active ? USIL : border}`,
                    padding: '14px 18px', cursor: 'pointer',
                    boxShadow: active ? `0 0 0 2px ${USIL}22` : '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 9px', borderRadius: 100,
                          background: cfg.bg, color: cfg.text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {formatBadgeText(prioridad, 'media')}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 9px', borderRadius: 100,
                          background: SURFACE_LOW, color: muted }}>
                          {formatBadgeText(b.tipo_brecha)}
                        </span>
                      </div>
                      <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 13, marginBottom: 4, color: text }}>
                        {b.descripcion_brecha || 'Brecha detectada sin descripción registrada.'}
                      </div>
                      {b.competencia_afectada && (
                        <div style={{ fontSize: 11, color: muted }}>Competencia: {b.competencia_afectada}</div>
                      )}
                      {b.nombre_curso && (
                        <div style={{ fontSize: 10, color: CYAN, fontWeight: 700, marginTop: 4 }}>
                          Curso: {b.nombre_curso}
                        </div>
                      )}
                      {b.evidencia_resumen && (
                        <div style={{ fontSize: 10, color: muted, marginTop: 4, fontStyle: 'italic' }}>
                          {b.evidencia_resumen}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {tab === 'propuestas' && (
            propuestas.length === 0 ? (
              <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`,
                padding: 32, textAlign: 'center', color: muted, fontSize: 12 }}>
                {loading ? 'Cargando...' : 'Sin propuestas generadas.'}
              </div>
            ) : propuestas.map(p => {
              const estCfg = ESTADO_PROP[p.estado_revision] ?? ESTADO_PROP.pendiente;
              const busy   = !!actionLoading[p.id_propuesta];
              const brechaOrigen = brechaById.get(p.id_brecha);
              const canShowEvidencia = !!brechaOrigen;
              return (
                <div key={p.id_propuesta} style={{ background: card, borderRadius: 10,
                  border: `1px solid ${border}`, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 9px', borderRadius: 100,
                          background: estCfg.bg, color: estCfg.text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {estCfg.label}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 9px', borderRadius: 100,
                          background: SURFACE_LOW, color: muted }}>
                          {p.tipo_propuesta.replace(/_/g, ' ')}
                        </span>
                        {p.nombre_curso && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: muted }}>
                            · {p.nombre_curso}
                          </span>
                        )}
                      </div>
                      <div style={{ fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 14, color: USIL, marginBottom: 8 }}>
                        {p.titulo_propuesta}
                      </div>
                      <div style={{ fontSize: 12, color: text, marginBottom: 10, lineHeight: 1.5 }}>{p.descripcion_propuesta}</div>

                      <div style={{ display: 'grid', gridTemplateColumns: p.impacto_esperado ? '1fr 1fr' : '1fr', gap: 12,
                        background: SURFACE_LOW, padding: '10px 12px', borderRadius: 8, border: `1px solid ${border}66` }}>
                        <div>
                          <p style={{ fontSize: 9, fontWeight: 800, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
                            Brecha Detectada
                          </p>
                          <p style={{ fontSize: 11, color: text, margin: 0, lineHeight: 1.4, fontStyle: 'italic' }}>{p.justificacion}</p>
                        </div>
                        {p.impacto_esperado && (
                          <div>
                            <p style={{ fontSize: 9, fontWeight: 800, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
                              Impacto Esperado
                            </p>
                            <p style={{ fontSize: 11, color: text, margin: 0, lineHeight: 1.4 }}>{p.impacto_esperado}</p>
                          </div>
                        )}
                      </div>

                      {p.usuario_revisor && (
                        <div style={{ fontSize: 10, color: muted, marginTop: 8 }}>
                          Revisado por <strong>{p.usuario_revisor}</strong> · {p.fecha_revision ? new Date(p.fecha_revision).toLocaleDateString('es-PE') : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderTop: `1px solid ${border}`, paddingTop: 10, gap: 8, flexWrap: 'wrap' }}>
                    {canShowEvidencia ? (
                      <button
                        onClick={() => loadEvidencias(brechaOrigen!.id_impacto, `Evidencia de: ${p.titulo_propuesta}`)}
                        style={{ background: 'none', border: 'none', color: CYAN, fontWeight: 700, fontSize: 11,
                          cursor: 'pointer', padding: 0, fontFamily: FONT_DATA }}>
                        Ver evidencia relacionada →
                      </button>
                    ) : <span />}

                    {canEdit && p.estado_revision === 'pendiente' && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button onClick={() => handleCambiarEstado(p.id_propuesta, 'aprobada')} disabled={busy}
                          style={{ padding: '6px 14px', borderRadius: 8, border: 'none',
                            background: busy ? '#94a3b8' : '#1e8e3e', color: '#fff', fontWeight: 700, fontSize: 11,
                            cursor: busy ? 'not-allowed' : 'pointer', fontFamily: FONT_DATA }}>
                          ✓ Aprobar
                        </button>
                        <button onClick={() => handleCambiarEstado(p.id_propuesta, 'rechazada')} disabled={busy}
                          style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${ERROR}`,
                            background: 'transparent', color: ERROR, fontWeight: 700, fontSize: 11,
                            cursor: busy ? 'not-allowed' : 'pointer', fontFamily: FONT_DATA }}>
                          ✗ Rechazar
                        </button>
                        <button onClick={() => setShowObs({ id: p.id_propuesta, estado: 'observada' })} disabled={busy}
                          style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${border}`,
                            background: 'transparent', color: text, fontWeight: 700, fontSize: 11,
                            cursor: busy ? 'not-allowed' : 'pointer', fontFamily: FONT_DATA }}>
                          💬 Observar
                        </button>
                      </div>
                    )}
                    {canEdit && p.estado_revision === 'aprobada' && (
                      <button
                        onClick={() => handleGenerarVersion(p.id_propuesta)}
                        disabled={!!actionLoading[p.id_propuesta]}
                        style={{ padding: '6px 14px', borderRadius: 8, border: 'none',
                          background: actionLoading[p.id_propuesta] === 'version' ? '#94a3b8' : USIL,
                          color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: FONT_DATA }}>
                        {actionLoading[p.id_propuesta] === 'version' ? 'Generando...' : '📋 Generar Nueva Versión de Malla'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Columna derecha: evidencia contextual (si hay selección) + widgets agregados reales */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 10 }}>

          {selectedImpacto && (
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ background: USIL, color: '#fff', padding: '10px 14px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {panelTitle}
                </span>
                <button onClick={() => { setSelectedImpacto(null); setEvidencias([]); }}
                  style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
                  ×
                </button>
              </div>
              <div style={{ maxHeight: 420, overflowY: 'auto', padding: '12px 14px',
                display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                {evidencias.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: muted, fontSize: 11 }}>
                    Sin evidencias registradas
                  </div>
                ) : evidencias.map(ev => {
                  const mod = MODULO_BADGE[ev.modulo_origen] ?? { bg: SURFACE_LOW, text: muted };
                  return (
                    <div key={ev.id_evidencia} style={{ background: isDark ? '#0f172a' : SURFACE_LOW,
                      borderRadius: 8, border: `1px solid ${border}`, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 8px', borderRadius: 100,
                          background: mod.bg, color: mod.text, textTransform: 'uppercase' }}>
                          {ev.modulo_origen.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 600, color: muted }}>
                          {ev.tipo_evidencia.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: muted, marginLeft: 'auto' }}>
                          {Math.round(Number(ev.nivel_confianza) * 100)}%
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4, color: text }}>{ev.titulo_evidencia}</div>
                      {ev.descripcion_evidencia && (
                        <div style={{ fontSize: 10, color: muted, lineHeight: 1.4 }}>{ev.descripcion_evidencia}</div>
                      )}
                      {ev.fuente_url && (
                        <a href={ev.fuente_url} target="_blank" rel="noreferrer"
                          style={{ fontSize: 9, color: CYAN, textDecoration: 'none', display: 'block', marginTop: 4, fontWeight: 700 }}>
                          Ver fuente →
                        </a>
                      )}
                      {ev.justificacion_relacion && (
                        <div style={{ fontSize: 9, color: muted, fontStyle: 'italic', marginTop: 4,
                          borderTop: `1px solid ${border}`, paddingTop: 4 }}>
                          {ev.justificacion_relacion}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Resumen del motor (datos agregados reales, en lugar de matriz de priorización sin datos fuente) */}
          {kpis && (
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: '16px 18px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <h3 style={{ margin: '0 0 12px', fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 700, color: USIL }}>
                Resumen del Motor
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { icon: '🎯', label: 'Cursos Afectados', value: kpis.total_impactos },
                  { icon: '⚠', label: 'Brechas Detectadas', value: kpis.total_brechas },
                  { icon: '⏳', label: 'Propuestas Pendientes', value: kpis.propuestas_pendientes },
                  { icon: '✓', label: 'Propuestas Aprobadas', value: kpis.propuestas_aprobadas },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: text }}>
                      <span style={{ fontSize: 12 }}>{row.icon}</span> {row.label}
                    </div>
                    <span style={{ fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 12, color: USIL,
                      background: SURFACE_LOW, padding: '2px 9px', borderRadius: 100 }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Últimas decisiones reales (fecha_revision + usuario_revisor de cada propuesta) */}
          {ultimasDecisiones.length > 0 && (
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: '16px 18px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <h3 style={{ margin: '0 0 12px', fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 700, color: USIL }}>
                Últimas Decisiones
              </h3>
              <div style={{ position: 'relative', borderLeft: `2px solid ${border}`, marginLeft: 6, paddingLeft: 14,
                display: 'flex', flexDirection: 'column', gap: 12 }}>
                {ultimasDecisiones.map(d => {
                  const cfg = ESTADO_PROP[d.estado_revision] ?? ESTADO_PROP.pendiente;
                  return (
                    <div key={d.id_propuesta} style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: -19, top: 3, width: 9, height: 9, borderRadius: '50%',
                        background: cfg.dot, border: '2px solid ' + card }} />
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: text }}>
                        Propuesta {cfg.label.toLowerCase()}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 10, color: muted }}>
                        {d.titulo_propuesta} · {d.fecha_revision ? new Date(d.fecha_revision).toLocaleDateString('es-PE') : ''}
                      </p>
                      {d.usuario_revisor && (
                        <p style={{ margin: '1px 0 0', fontSize: 9, color: muted, fontStyle: 'italic' }}>{d.usuario_revisor}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {showObs && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,26,72,0.55)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowObs(null); }}>
          <div style={{ background: card, borderRadius: 14, padding: '26px 28px', width: 420,
            maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', color: text }}>
            <h3 style={{ margin: '0 0 4px', fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 800, color: USIL }}>
              Agregar Observación
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: 11, color: muted }}>
              La propuesta quedará marcada como <strong>Observada</strong> junto con tu comentario.
            </p>
            <textarea value={observacion} onChange={e => setObservacion(e.target.value)}
              rows={4} placeholder="Escribe tu observación aquí..."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${border}`,
                background: isDark ? '#0f172a' : SURFACE_LOW, color: text, fontSize: 12,
                boxSizing: 'border-box', resize: 'vertical', fontFamily: FONT_DATA, marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowObs(null); setObservacion(''); }}
                style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${border}`,
                  background: 'transparent', color: text, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                  fontFamily: FONT_DATA }}>
                Cancelar
              </button>
              <button onClick={() => handleCambiarEstado(showObs.id, showObs.estado, observacion)}
                style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none',
                  background: USIL, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  fontFamily: FONT_DATA }}>
                Guardar observación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImpactoCurricularView;
