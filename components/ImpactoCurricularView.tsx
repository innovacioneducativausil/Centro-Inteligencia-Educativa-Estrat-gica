
import React, { useCallback, useEffect, useState } from 'react';
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

const USIL = '#002855';
const CYAN = '#00A3E0';

const NIVEL_IMPACTO: Record<string, { bg: string; text: string; label: string; border: string }> = {
  bajo:    { bg: '#f0fdf4', text: '#166534', label: 'Bajo',    border: '#22c55e' },
  medio:   { bg: '#fef9c3', text: '#854d0e', label: 'Medio',   border: '#eab308' },
  alto:    { bg: '#ffedd5', text: '#9a3412', label: 'Alto',    border: '#f97316' },
  critico: { bg: '#fee2e2', text: '#991b1b', label: 'Crítico', border: '#ef4444' },
};
const PRIORIDAD_BADGE = NIVEL_IMPACTO;

const ESTADO_PROP: Record<string, { bg: string; text: string; label: string }> = {
  pendiente:  { bg: '#fef9c3', text: '#854d0e', label: 'Pendiente' },
  aprobada:   { bg: '#dcfce7', text: '#166534', label: 'Aprobada' },
  rechazada:  { bg: '#fee2e2', text: '#991b1b', label: 'Rechazada' },
  observada:  { bg: '#dbeafe', text: '#1d4ed8', label: 'Observada' },
};

const MODULO_BADGE: Record<string, { bg: string; text: string }> = {
  radar:          { bg: '#e0e7ff', text: '#3730a3' },
  empleabilidad:  { bg: '#dcfce7', text: '#166534' },
  mercado_laboral:{ bg: '#ffedd5', text: '#9a3412' },
  benchmarking:   { bg: '#f0fdf4', text: '#065f46' },
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
  const bg       = isDark ? '#0f172a' : '#f8fafc';
  const card     = isDark ? '#1e293b' : '#ffffff';
  const text     = isDark ? '#f1f5f9' : '#1e293b';
  const muted    = isDark ? '#94a3b8' : '#64748b';
  const border   = isDark ? 'rgba(148,163,184,0.15)' : '#e2e8f0';
  const canEdit  = userRole === 'admin' || userRole === 'analista';

  const [kpis, setKpis]             = useState<KpisImpacto | null>(null);
  const [impactos, setImpactos]     = useState<Impacto[]>([]);
  const [brechas, setBrechas]       = useState<Brecha[]>([]);
  const [propuestas, setPropuestas] = useState<Propuesta[]>([]);
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [selectedImpacto, setSelectedImpacto] = useState<number | null>(null);
  const [tab, setTab]               = useState<TabMotor>(() => {
    const stored = localStorage.getItem('radar_impacto_curricular_tab') as TabMotor | null;
    return stored && VALID_IMPACTO_TABS.includes(stored) ? stored : 'impactos';
  });
  const [analyzing, setAnalyzing]   = useState(false);
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

  const loadEvidencias = async (idImpacto: number) => {
    setSelectedImpacto(idImpacto);
    try {
      const evs = await apiFetch<Evidencia[]>(`/api/curricular/evidencias/${idImpacto}`);
      setEvidencias(evs);
    } catch { setEvidencias([]); }
  };

  const handleAnalizar = async () => {
    if (!idCarrera || !idMallaVersion) return;
    setAnalyzing(true);
    setError(null);
    try {
      await apiFetch(`/api/curricular/analizar-impacto/${idCarrera}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_malla_version: idMallaVersion, pesos }),
      });
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

  if (!idCarrera || !idMallaVersion) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: muted }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Selecciona una carrera y versión de malla para analizar el impacto curricular</div>
      </div>
    );
  }

  return (
    <div style={{ color: text, display: 'flex', flexDirection: 'column', gap: 12 }}>


      <div style={{ background: USIL, borderRadius: 10, padding: '14px 18px', color: '#fff',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
            color: 'rgba(147,197,253,0.9)', marginBottom: 3 }}>
            Motor de Impacto Curricular
          </div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>
            {nombreCarrera ?? 'Carrera'} · {nombreMalla ?? 'Malla actual'}
          </div>
          {kpis?.ultima_ejecucion && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>
              Último análisis: {new Date(kpis.ultima_ejecucion).toLocaleString('es-PE')}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canEdit && (
            <button onClick={() => setShowPesos(!showPesos)}
              style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)',
                background: 'transparent', color: '#fff', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>
              ⚙ Pesos
            </button>
          )}
          {canEdit && (
            <button onClick={handleAnalizar} disabled={analyzing}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none',
                background: analyzing ? '#94a3b8' : CYAN,
                color: '#fff', fontWeight: 800, fontSize: 12, cursor: analyzing ? 'not-allowed' : 'pointer' }}>
              {analyzing ? 'Analizando...' : '▶ Analizar Impacto Curricular'}
            </button>
          )}
        </div>
      </div>


      {showPesos && (
        <div style={{ background: card, borderRadius: 10, border: `1px solid ${border}`, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: USIL, marginBottom: 10 }}>
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
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${border}`,
                    background: isDark ? '#0f172a' : '#f8fafc', color: text, fontSize: 12 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8,
          padding: '10px 14px', color: '#991b1b', fontSize: 12 }}>
          {error}
        </div>
      )}


      {kpis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
          {[
            { label: 'Cursos Afectados', value: kpis.total_impactos, accent: '#f97316', bg: '#fff7ed', sub: 'impactos detectados' },
            { label: 'Brechas Detectadas', value: kpis.total_brechas, accent: '#ef4444', bg: '#fff1f2', sub: 'gaps identificados' },
            { label: 'Propuestas Pendientes', value: kpis.propuestas_pendientes, accent: '#eab308', bg: '#fefce8', sub: 'requieren revisión' },
            { label: 'Propuestas Aprobadas', value: kpis.propuestas_aprobadas, accent: '#22c55e', bg: '#f0fdf4', sub: 'listas para aplicar' },
            { label: 'Score de Impacto', value: kpis.score_promedio !== null ? `${kpis.score_promedio}` : '—', accent: USIL, bg: '#eff6ff', sub: 'promedio ponderado' },
          ].map((k, i) => (
            <div key={i} style={{ background: k.bg, borderRadius: 10, padding: '12px 14px',
              borderLeft: `3px solid ${k.accent}`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: muted, marginBottom: 4 }}>
                {k.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: k.accent, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 10, color: muted, marginTop: 4 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      )}


      <div style={{ display: 'flex', gap: 4, borderBottom: `2px solid ${border}`, paddingBottom: 0 }}>
        {([
          { key: 'impactos',   label: `Impactos (${impactos.length})` },
          { key: 'brechas',    label: `Brechas (${brechas.length})` },
          { key: 'propuestas', label: `Propuestas (${propuestas.length})` },
        ] as { key: TabMotor; label: string }[]).map(t => (
          <button key={t.key} onClick={() => switchTab(t.key)}
            style={{ padding: '8px 16px', border: 'none', borderBottom: tab === t.key ? `2px solid ${USIL}` : '2px solid transparent',
              background: 'transparent', color: tab === t.key ? USIL : muted,
              fontWeight: tab === t.key ? 800 : 600, fontSize: 12, cursor: 'pointer', marginBottom: -2 }}>
            {t.label}
          </button>
        ))}
        {loading && <span style={{ marginLeft: 8, fontSize: 10, color: muted, alignSelf: 'center' }}>Cargando...</span>}
      </div>


      <div style={{ display: 'grid', gridTemplateColumns: selectedImpacto ? '1fr 320px' : '1fr', gap: 12, alignItems: 'start' }}>


        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>


          {tab === 'impactos' && (
            impactos.length === 0 ? (
              <div style={{ background: card, borderRadius: 10, border: `1px solid ${border}`,
                padding: 32, textAlign: 'center', color: muted, fontSize: 12 }}>
                {loading ? 'Cargando...' : 'Sin impactos detectados. Ejecuta el análisis para comenzar.'}
              </div>
            ) : impactos.map(imp => {
              const cfg = NIVEL_IMPACTO[imp.nivel_impacto] ?? NIVEL_IMPACTO.bajo;
              return (
                <div key={imp.id_impacto}
                  onClick={() => loadEvidencias(imp.id_impacto)}
                  style={{ background: card, borderRadius: 10, border: `1px solid ${border}`,
                    borderLeft: `4px solid ${cfg.border}`, padding: '12px 16px', cursor: 'pointer',
                    boxShadow: selectedImpacto === imp.id_impacto ? `0 0 0 2px ${USIL}` : '0 1px 3px rgba(0,0,0,0.06)',
                    transition: 'box-shadow .15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{imp.titulo_impacto}</div>
                      {imp.descripcion_impacto && (
                        <div style={{ fontSize: 11, color: muted, lineHeight: 1.4 }}>{imp.descripcion_impacto}</div>
                      )}
                      {imp.nombre_curso && (
                        <div style={{ fontSize: 10, color: USIL, fontWeight: 700, marginTop: 4 }}>
                          Ciclo {imp.numero_ciclo} · {imp.nombre_curso}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 8,
                        background: cfg.bg, color: cfg.text }}>
                        {cfg.label}
                      </span>
                      <span style={{ fontSize: 18, fontWeight: 900, color: cfg.border, lineHeight: 1 }}>
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
              <div style={{ background: card, borderRadius: 10, border: `1px solid ${border}`,
                padding: 32, textAlign: 'center', color: muted, fontSize: 12 }}>
                {loading ? 'Cargando...' : 'Sin brechas detectadas.'}
              </div>
            ) : brechas.map(b => {
              const prioridad = normalizeKey(b.prioridad) || 'media';
              const cfg = PRIORIDAD_BADGE[prioridad] ?? PRIORIDAD_BADGE.media;
              return (
                <div key={b.id_brecha}
                  onClick={() => loadEvidencias(b.id_impacto)}
                  style={{ background: card, borderRadius: 10, border: `1px solid ${border}`,
                    borderLeft: `4px solid ${cfg.border}`, padding: '12px 16px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 8,
                          background: cfg.bg, color: cfg.text }}>
                          {formatBadgeText(prioridad, 'media').toUpperCase()}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 8,
                          background: '#f3f4f6', color: '#374151' }}>
                          {formatBadgeText(b.tipo_brecha)}
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
                        {b.descripcion_brecha || 'Brecha detectada sin descripción registrada.'}
                      </div>
                      {b.competencia_afectada && (
                        <div style={{ fontSize: 11, color: muted }}>Competencia: {b.competencia_afectada}</div>
                      )}
                      {b.nombre_curso && (
                        <div style={{ fontSize: 10, color: USIL, fontWeight: 700, marginTop: 4 }}>
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
              <div style={{ background: card, borderRadius: 10, border: `1px solid ${border}`,
                padding: 32, textAlign: 'center', color: muted, fontSize: 12 }}>
                {loading ? 'Cargando...' : 'Sin propuestas generadas.'}
              </div>
            ) : propuestas.map(p => {
              const estCfg = ESTADO_PROP[p.estado_revision] ?? ESTADO_PROP.pendiente;
              const busy   = !!actionLoading[p.id_propuesta];
              return (
                <div key={p.id_propuesta} style={{ background: card, borderRadius: 10,
                  border: `1px solid ${border}`, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 8,
                          background: estCfg.bg, color: estCfg.text }}>
                          {estCfg.label}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 8,
                          background: '#f3f4f6', color: '#374151' }}>
                          {p.tipo_propuesta.replace(/_/g, ' ')}
                        </span>
                        {p.nombre_curso && (
                          <span style={{ fontSize: 9, fontWeight: 600, color: muted }}>
                            {p.nombre_curso}
                          </span>
                        )}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 12, color: USIL, marginBottom: 6 }}>{p.titulo_propuesta}</div>
                      <div style={{ fontSize: 11, color: text, marginBottom: 4 }}>{p.descripcion_propuesta}</div>
                      <div style={{ fontSize: 10, color: muted, fontStyle: 'italic' }}>
                        <strong>Justificación:</strong> {p.justificacion}
                      </div>
                      {p.impacto_esperado && (
                        <div style={{ fontSize: 10, color: muted, marginTop: 4, fontStyle: 'italic' }}>
                          <strong>Impacto esperado:</strong> {p.impacto_esperado}
                        </div>
                      )}
                      {p.usuario_revisor && (
                        <div style={{ fontSize: 9, color: muted, marginTop: 6 }}>
                          Revisado por {p.usuario_revisor} · {p.fecha_revision ? new Date(p.fecha_revision).toLocaleDateString('es-PE') : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  {canEdit && p.estado_revision === 'pendiente' && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: `1px solid ${border}`, paddingTop: 10 }}>
                      <button onClick={() => handleCambiarEstado(p.id_propuesta, 'aprobada')} disabled={busy}
                        style={{ padding: '5px 12px', borderRadius: 6, border: 'none',
                          background: busy ? '#94a3b8' : '#22c55e', color: '#fff', fontWeight: 700, fontSize: 11, cursor: busy ? 'not-allowed' : 'pointer' }}>
                        ✓ Aprobar
                      </button>
                      <button onClick={() => handleCambiarEstado(p.id_propuesta, 'rechazada')} disabled={busy}
                        style={{ padding: '5px 12px', borderRadius: 6, border: 'none',
                          background: busy ? '#94a3b8' : '#ef4444', color: '#fff', fontWeight: 700, fontSize: 11, cursor: busy ? 'not-allowed' : 'pointer' }}>
                        ✗ Rechazar
                      </button>
                      <button onClick={() => setShowObs({ id: p.id_propuesta, estado: 'observada' })} disabled={busy}
                        style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${border}`,
                          background: 'transparent', color: text, fontWeight: 700, fontSize: 11, cursor: busy ? 'not-allowed' : 'pointer' }}>
                        💬 Observar
                      </button>
                    </div>
                  )}
                  {canEdit && p.estado_revision === 'aprobada' && (
                    <div style={{ borderTop: `1px solid ${border}`, paddingTop: 10 }}>
                      <button
                        onClick={() => handleGenerarVersion(p.id_propuesta)}
                        disabled={!!actionLoading[p.id_propuesta]}
                        style={{ padding: '6px 14px', borderRadius: 6, border: 'none',
                          background: actionLoading[p.id_propuesta] === 'version' ? '#94a3b8' : USIL,
                          color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                        {actionLoading[p.id_propuesta] === 'version' ? 'Generando...' : '📋 Generar Nueva Versión de Malla'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>


        {selectedImpacto && (
          <div style={{ background: card, borderRadius: 10, border: `1px solid ${border}`, overflow: 'hidden',
            position: 'sticky', top: 10 }}>
            <div style={{ background: USIL, color: '#fff', padding: '10px 14px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: 11, textTransform: 'uppercase' }}>
                Evidencias del Impacto
              </span>
              <button onClick={() => { setSelectedImpacto(null); setEvidencias([]); }}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }}>
                ×
              </button>
            </div>
            <div style={{ maxHeight: 460, overflowY: 'auto', padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 10 }}>
              {evidencias.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: muted, fontSize: 11 }}>
                  Sin evidencias registradas
                </div>
              ) : evidencias.map(ev => {
                const mod = MODULO_BADGE[ev.modulo_origen] ?? { bg: '#f3f4f6', text: '#374151' };
                return (
                  <div key={ev.id_evidencia} style={{ background: isDark ? '#0f172a' : '#f8fafc',
                    borderRadius: 8, border: `1px solid ${border}`, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 8,
                        background: mod.bg, color: mod.text, textTransform: 'uppercase' }}>
                        {ev.modulo_origen.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 600, color: muted }}>
                        {ev.tipo_evidencia.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: muted, marginLeft: 'auto' }}>
                        Confianza: {Math.round(Number(ev.nivel_confianza) * 100)}%
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4 }}>{ev.titulo_evidencia}</div>
                    {ev.descripcion_evidencia && (
                      <div style={{ fontSize: 10, color: muted, lineHeight: 1.4 }}>{ev.descripcion_evidencia}</div>
                    )}
                    {ev.fuente_url && (
                      <a href={ev.fuente_url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 9, color: CYAN, textDecoration: 'none', display: 'block', marginTop: 4 }}>
                        Ver fuente
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
      </div>


      {showObs && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowObs(null); }}>
          <div style={{ background: card, borderRadius: 12, padding: '24px 28px', width: 400,
            maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', color: text }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: USIL }}>
              Agregar Observación
            </h3>
            <textarea value={observacion} onChange={e => setObservacion(e.target.value)}
              rows={4} placeholder="Escribe tu observación aquí..."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${border}`,
                background: isDark ? '#0f172a' : '#f8fafc', color: text, fontSize: 12,
                boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowObs(null); setObservacion(''); }}
                style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${border}`,
                  background: 'transparent', color: text, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => handleCambiarEstado(showObs.id, showObs.estado, observacion)}
                style={{ flex: 2, padding: '8px', borderRadius: 8, border: 'none',
                  background: USIL, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
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
