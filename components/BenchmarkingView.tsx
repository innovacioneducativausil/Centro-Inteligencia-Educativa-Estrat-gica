// components/BenchmarkingView.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { ThemeColors } from '../types';

interface BenchmarkingViewProps {
  themeColors: ThemeColors;
  userRole?: string;
}

type TipoBenchmark = 'competencia_directa' | 'referente_nacional' | 'referente_internacional' | 'referente_tecnologico';

interface Universidad {
  id_universidad_benchmark: number;
  nombre_universidad: string;
  pais: string;
  ciudad: string | null;
  tipo_benchmark: TipoBenchmark;
  sitio_web: string | null;
  activo: number;
}

interface Programa {
  id_programa_benchmark: number;
  id_universidad_benchmark: number;
  nombre_programa: string;
  url_programa: string | null;
  carrera_equivalente_id: number | null;
  modalidad: string | null;
  duracion: string | null;
  estado_extraccion: 'pendiente' | 'procesado' | 'error' | 'verificado';
  observaciones: string | null;
  fecha_captura: string | null;
  nombre_universidad: string;
  tipo_benchmark: TipoBenchmark;
  pais: string;
  total_competencias?: number;
  total_cursos?: number;
  total_fuentes?: number;
  fuentes_validadas?: number;
  fuentes_pendientes?: number;
}

interface Competencia {
  nombre_competencia: string;
  tipo_competencia: string;
  nombre_programa: string;
  nombre_universidad: string;
  pais: string;
}

interface FiltroCarrera {
  id_carrera: number;
  nombre_carrera: string;
  nombre_facultad: string;
}

interface CoberturaCarrera extends FiltroCarrera {
  benchmarking: Partial<Record<TipoBenchmark, {
    total_programas: number;
    total_fuentes: number;
    fuentes_validadas: number;
    fuentes_pendientes: number;
    ultima_revision: string | null;
  }>>;
}

const USIL = '#002855';
const CYAN = '#00A3E0';

const TIPO_LABELS: Record<TipoBenchmark, string> = {
  competencia_directa:     'Competencia Directa',
  referente_nacional:      'Referentes Nacionales',
  referente_internacional: 'Referentes Internacionales',
  referente_tecnologico:   'Referentes Tecnológicos',
};

const ESTADO_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  pendiente:   { bg: '#fef9c3', text: '#854d0e', label: 'Pendiente' },
  procesado:   { bg: '#dbeafe', text: '#1d4ed8', label: 'Procesado' },
  error:       { bg: '#fee2e2', text: '#991b1b', label: 'Error' },
  verificado:  { bg: '#dcfce7', text: '#166534', label: 'Verificado' },
};

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as any).error || `Error ${r.status}`);
  return data as T;
}

const BenchmarkingView: React.FC<BenchmarkingViewProps> = ({ themeColors, userRole }) => {
  const isDark   = themeColors.bg?.includes('950') || themeColors.bg?.includes('slate-900') || false;
  const bg       = isDark ? '#0f172a' : '#f8fafc';
  const card     = isDark ? '#1e293b' : '#ffffff';
  const text     = isDark ? '#f1f5f9' : '#1e293b';
  const muted    = isDark ? '#94a3b8' : '#64748b';
  const border   = isDark ? 'rgba(148,163,184,0.15)' : '#e2e8f0';
  const canEdit  = userRole === 'admin';

  const [tipo, setTipo]             = useState<TipoBenchmark>('competencia_directa');
  const [universidades, setUniversidades] = useState<Universidad[]>([]);
  const [programas, setProgramas]   = useState<Programa[]>([]);
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [carreras, setCarreras]     = useState<FiltroCarrera[]>([]);
  const [cobertura, setCobertura]   = useState<CoberturaCarrera[]>([]);
  const [selectedCarrera, setSelectedCarrera] = useState<number | ''>('');
  const [selectedPrograma, setSelectedPrograma] = useState<number | null>(null);
  const [loadingUnivs, setLoadingUnivs] = useState(false);
  const [loadingProgs, setLoadingProgs] = useState(false);
  const [loadingComp, setLoadingComp]   = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});
  const [error, setError]           = useState<string | null>(null);
  const [notice, setNotice]         = useState<string | null>(null);
  const [seeding, setSeeding]       = useState(false);
  const [showAddUniv, setShowAddUniv] = useState(false);
  const [showAddProg, setShowAddProg] = useState(false);
  const [showManualText, setShowManualText] = useState<number | null>(null);
  const [manualText, setManualText]  = useState('');
  const [manualUrl, setManualUrl]    = useState('');
  const [newUniv, setNewUniv]        = useState({ nombre_universidad: '', pais: 'Peru', ciudad: '', sitio_web: '' });
  const [newProg, setNewProg]        = useState({ nombre_programa: '', url_programa: '', modalidad: '', duracion: '' });
  const [selectedUnivForProg, setSelectedUnivForProg] = useState<number | ''>('');

  useEffect(() => {
    fetch('/api/curricular/filtros', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (!d.error && d.carreras) setCarreras(d.carreras); })
      .catch(() => {});
    fetch('/api/mercado-laboral/benchmarking/cobertura', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setCobertura(d); })
      .catch(() => {});
  }, []);

  const loadUniversidades = useCallback(() => {
    setLoadingUnivs(true);
    setError(null);
    apiFetch<Universidad[]>(`/api/mercado-laboral/benchmarking/universidades?tipo=${tipo}`)
      .then(setUniversidades)
      .catch(e => setError(e.message))
      .finally(() => setLoadingUnivs(false));
  }, [tipo]);

  useEffect(() => { loadUniversidades(); }, [loadUniversidades]);

  const loadProgramas = useCallback(() => {
    if (!selectedCarrera) { setProgramas([]); setCompetencias([]); return; }
    setLoadingProgs(true);
    apiFetch<{ programas: Programa[]; competencias: Competencia[] }>(
      `/api/mercado-laboral/benchmarking/comparar/${selectedCarrera}/${tipo}`
    )
      .then(d => { setProgramas(d.programas); setCompetencias(d.competencias); })
      .catch(e => setError(e.message))
      .finally(() => setLoadingProgs(false));
  }, [selectedCarrera, tipo]);

  useEffect(() => { loadProgramas(); }, [loadProgramas]);

  const handleScraping = async (idPrograma: number) => {
    setActionLoading(p => ({ ...p, [idPrograma]: 'scraping' }));
    setError(null);
    try {
      await apiFetch('/api/mercado-laboral/benchmarking/scraping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [idPrograma] }),
      });
      loadProgramas();
    } catch (e: any) {
      setError(e.message);
    }
    setActionLoading(p => ({ ...p, [idPrograma]: '' }));
  };

  const handleNormalizarIA = async (idPrograma: number) => {
    setActionLoading(p => ({ ...p, [idPrograma]: 'ia' }));
    setError(null);
    try {
      await apiFetch('/api/mercado-laboral/benchmarking/normalizar-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_programa: idPrograma }),
      });
      loadProgramas();
    } catch (e: any) {
      setError(e.message);
    }
    setActionLoading(p => ({ ...p, [idPrograma]: '' }));
  };

  const handleCargarManual = async (idPrograma: number) => {
    if (!manualText.trim()) return;
    setActionLoading(p => ({ ...p, [idPrograma]: 'manual' }));
    try {
      await apiFetch('/api/mercado-laboral/benchmarking/scraping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_programa: idPrograma, texto_manual: manualText, url_origen: manualUrl }),
      });
      setShowManualText(null); setManualText(''); setManualUrl('');
      loadProgramas();
    } catch (e: any) { setError(e.message); }
    setActionLoading(p => ({ ...p, [idPrograma]: '' }));
  };

  const handleAddUniversidad = async () => {
    if (!newUniv.nombre_universidad.trim()) return;
    try {
      await apiFetch('/api/mercado-laboral/benchmarking/universidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newUniv, tipo_benchmark: tipo }),
      });
      setShowAddUniv(false);
      setNewUniv({ nombre_universidad: '', pais: 'Peru', ciudad: '', sitio_web: '' });
      loadUniversidades();
    } catch (e: any) { setError(e.message); }
  };

  const handleAddPrograma = async () => {
    if (!newProg.nombre_programa.trim() || !selectedUnivForProg) return;
    try {
      await apiFetch('/api/mercado-laboral/benchmarking/programas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newProg,
          id_universidad_benchmark: selectedUnivForProg,
          carrera_equivalente_id: selectedCarrera || null,
        }),
      });
      setShowAddProg(false);
      setNewProg({ nombre_programa: '', url_programa: '', modalidad: '', duracion: '' });
      loadProgramas();
    } catch (e: any) { setError(e.message); }
  };

  const handleSeedInicial = async () => {
    setError(null);
    setNotice(null);
    setSeeding(true);
    try {
      const result = await apiFetch<{
        carrerasLeidas: number;
        carrerasMapeadas: number;
        universidadesCreadas: number;
        programasCreados: number;
        fuentesCreadas: number;
      }>('/api/mercado-laboral/benchmarking/seed-inicial', { method: 'POST' });
      const d = await fetch('/api/mercado-laboral/benchmarking/cobertura', { credentials: 'include' }).then(r => r.json());
      if (Array.isArray(d)) setCobertura(d);
      loadUniversidades();
      loadProgramas();
      setNotice(`Benchmarking base configurado: ${result.carrerasMapeadas}/${result.carrerasLeidas} carreras, ${result.programasCreados} programas nuevos y ${result.fuentesCreadas} fuentes nuevas.`);
    } catch (e: any) { setError(e.message); }
    finally { setSeeding(false); }
  };

  const competenciasUnicas = [...new Set(competencias.map(c => c.nombre_competencia))];
  const universidadesConPrograma = [...new Set(programas.map(p => p.nombre_universidad))];

  return (
    <div style={{ padding: 0, color: text }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['competencia_directa', 'referente_nacional', 'referente_internacional', 'referente_tecnologico'] as TipoBenchmark[]).map(t => (
          <button key={t} onClick={() => setTipo(t)}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 12,
              background: tipo === t ? USIL : (isDark ? '#334155' : '#e2e8f0'),
              color: tipo === t ? '#fff' : text,
            }}>
            {TIPO_LABELS[t]}
          </button>
        ))}
        {canEdit && (
          <button onClick={handleSeedInicial} disabled={seeding}
            style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, border: `1px solid ${border}`,
              background: card, color: seeding ? muted : USIL, fontWeight: 800, fontSize: 12,
              cursor: seeding ? 'not-allowed' : 'pointer' }}>
            {seeding ? 'Configurando...' : 'Configurar benchmarking base'}
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8,
          padding: '10px 14px', marginBottom: 12, color: '#991b1b', fontSize: 12 }}>
          {error}
        </div>
      )}

      {notice && (
        <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 8,
          padding: '10px 14px', marginBottom: 12, color: '#166534', fontSize: 12, fontWeight: 700 }}>
          {notice}
        </div>
      )}

      {!selectedCarrera && cobertura.length > 0 && (
        <div style={{ background: card, borderRadius: 10, border: `1px solid ${border}`, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ background: isDark ? '#1e293b' : '#f1f5f9', padding: '10px 16px',
            borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: 12, color: USIL, textTransform: 'uppercase' }}>
              Cobertura de benchmarking por carrera
            </span>
            <span style={{ fontSize: 10, color: muted }}>
              Selecciona una carrera para ver programas y fuentes
            </span>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr style={{ background: isDark ? '#0f172a' : '#f8fafc' }}>
                  {['Facultad', 'Carrera', 'Directa', 'Nacional', 'Internacional', 'Tecnológica', 'Validadas', 'Pendientes'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700,
                      color: muted, borderBottom: `1px solid ${border}`, whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cobertura.map(c => {
                  const tipos = c.benchmarking || {};
                  const total = (t: TipoBenchmark, key: 'total_programas' | 'fuentes_validadas' | 'fuentes_pendientes') => tipos[t]?.[key] ?? 0;
                  const validadas = (Object.keys(tipos) as TipoBenchmark[]).reduce((acc, t) => acc + (tipos[t]?.fuentes_validadas ?? 0), 0);
                  const pendientes = (Object.keys(tipos) as TipoBenchmark[]).reduce((acc, t) => acc + (tipos[t]?.fuentes_pendientes ?? 0), 0);
                  return (
                    <tr key={c.id_carrera} onClick={() => setSelectedCarrera(c.id_carrera)}
                      style={{ borderBottom: `1px solid ${border}`, cursor: 'pointer' }}>
                      <td style={{ padding: '8px 10px', color: muted }}>{c.nombre_facultad}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700 }}>{c.nombre_carrera}</td>
                      <td style={{ padding: '8px 10px' }}>{total('competencia_directa', 'total_programas')}</td>
                      <td style={{ padding: '8px 10px' }}>{total('referente_nacional', 'total_programas')}</td>
                      <td style={{ padding: '8px 10px' }}>{total('referente_internacional', 'total_programas')}</td>
                      <td style={{ padding: '8px 10px' }}>{total('referente_tecnologico', 'total_programas')}</td>
                      <td style={{ padding: '8px 10px', color: '#166534', fontWeight: 800 }}>{validadas}</td>
                      <td style={{ padding: '8px 10px', color: '#854d0e', fontWeight: 800 }}>{pendientes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12, alignItems: 'start' }}>

        {/* Panel izquierdo: Universidades */}
        <div style={{ background: card, borderRadius: 10, border: `1px solid ${border}`, overflow: 'hidden' }}>
          <div style={{ background: USIL, color: '#fff', padding: '10px 14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {TIPO_LABELS[tipo]}
            </span>
            {canEdit && (
              <button onClick={() => setShowAddUniv(true)}
                style={{ background: CYAN, border: 'none', borderRadius: 4, padding: '3px 8px',
                  color: '#fff', fontWeight: 700, fontSize: 10, cursor: 'pointer' }}>
                + Agregar
              </button>
            )}
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {loadingUnivs ? (
              <div style={{ padding: 20, textAlign: 'center', color: muted, fontSize: 12 }}>Cargando...</div>
            ) : universidades.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: muted, fontSize: 12 }}>
                Sin universidades configuradas
              </div>
            ) : universidades.map(u => (
              <div key={u.id_universidad_benchmark}
                style={{ padding: '10px 14px', borderBottom: `1px solid ${border}`,
                  fontSize: 12, fontWeight: 600 }}>
                <div style={{ color: text }}>{u.nombre_universidad}</div>
                <div style={{ color: muted, fontSize: 10, marginTop: 2 }}>{u.pais}{u.ciudad ? ` · ${u.ciudad}` : ''}</div>
                {u.sitio_web && (
                  <a href={u.sitio_web} target="_blank" rel="noreferrer"
                    style={{ color: CYAN, fontSize: 10, textDecoration: 'none' }}>
                    {u.sitio_web.replace(/^https?:\/\//, '').substring(0, 35)}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Panel derecho: Carrera + Programas + Comparativa */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Selector de carrera */}
          <div style={{ background: card, borderRadius: 10, border: `1px solid ${border}`, padding: '12px 16px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted,
                  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Carrera propia a comparar
                </label>
                <select value={selectedCarrera} onChange={e => setSelectedCarrera(e.target.value ? Number(e.target.value) : '')}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${border}`,
                    background: isDark ? '#0f172a' : '#f8fafc', color: text, fontSize: 12, fontWeight: 600 }}>
                  <option value="">— Seleccionar carrera —</option>
                  {carreras.map(c => (
                    <option key={c.id_carrera} value={c.id_carrera}>
                      {c.nombre_carrera} ({c.nombre_facultad})
                    </option>
                  ))}
                </select>
              </div>
              {canEdit && selectedCarrera && (
                <button onClick={() => setShowAddProg(true)}
                  style={{ padding: '8px 14px', borderRadius: 8, border: 'none',
                    background: USIL, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  + Agregar programa
                </button>
              )}
            </div>
          </div>

          {/* Tabla de programas */}
          {selectedCarrera && (
            <div style={{ background: card, borderRadius: 10, border: `1px solid ${border}`, overflow: 'hidden' }}>
              <div style={{ background: isDark ? '#1e293b' : '#f1f5f9', padding: '10px 16px',
                borderBottom: `1px solid ${border}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: 12, color: USIL, textTransform: 'uppercase' }}>
                  Programas encontrados ({programas.length})
                </span>
                {loadingProgs && <span style={{ fontSize: 10, color: muted }}>Cargando...</span>}
              </div>

              {programas.length === 0 && !loadingProgs ? (
                <div style={{ padding: 24, textAlign: 'center', color: muted, fontSize: 12 }}>
                  No hay programas cargados para esta carrera y tipo. Agrega programas y ejecuta el scraping.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: isDark ? '#0f172a' : '#f8fafc' }}>
                        {['Universidad', 'País', 'Programa', 'Estado', 'Fuentes', 'Competencias', 'Captura', 'Acciones'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700,
                            color: muted, borderBottom: `1px solid ${border}`, whiteSpace: 'nowrap' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {programas.map(p => {
                        const est = ESTADO_BADGE[p.estado_extraccion] ?? ESTADO_BADGE.pendiente;
                        const isBusy = !!actionLoading[p.id_programa_benchmark];
                        return (
                          <tr key={p.id_programa_benchmark} style={{ borderBottom: `1px solid ${border}` }}>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{p.nombre_universidad}</td>
                            <td style={{ padding: '8px 10px', color: muted }}>{p.pais}</td>
                            <td style={{ padding: '8px 10px', maxWidth: 180 }}>
                              <div style={{ fontWeight: 600 }}>{p.nombre_programa}</div>
                              {p.url_programa && (
                                <a href={p.url_programa} target="_blank" rel="noreferrer"
                                  style={{ color: CYAN, fontSize: 10, textDecoration: 'none' }}>
                                  Ver URL
                                </a>
                              )}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px',
                                borderRadius: 10, background: est.bg, color: est.text }}>
                                {est.label}
                              </span>
                              {p.observaciones && (
                                <div style={{ fontSize: 9, color: muted, marginTop: 2, maxWidth: 120 }}
                                  title={p.observaciones}>
                                  {p.observaciones.substring(0, 40)}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '8px 10px', fontSize: 10, whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 800, color: USIL }}>{p.total_fuentes ?? 0} links</div>
                              <div style={{ color: '#166534' }}>{p.fuentes_validadas ?? 0} validadas</div>
                              <div style={{ color: '#854d0e' }}>{p.fuentes_pendientes ?? 0} pendientes</div>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: USIL }}>
                              {p.total_competencias ?? 0}
                            </td>
                            <td style={{ padding: '8px 10px', color: muted, fontSize: 10 }}>
                              {p.fecha_captura ? new Date(p.fecha_captura).toLocaleDateString('es-PE') : '—'}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              {canEdit && (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  <button
                                    onClick={() => handleScraping(p.id_programa_benchmark)}
                                    disabled={isBusy}
                                    title="Ejecutar scraping automático"
                                    style={{ padding: '3px 7px', borderRadius: 4, border: 'none',
                                      background: isBusy && actionLoading[p.id_programa_benchmark] === 'scraping' ? '#94a3b8' : USIL,
                                      color: '#fff', fontWeight: 700, fontSize: 9, cursor: isBusy ? 'not-allowed' : 'pointer' }}>
                                    {actionLoading[p.id_programa_benchmark] === 'scraping' ? '...' : 'Scraping'}
                                  </button>
                                  <button
                                    onClick={() => { setShowManualText(p.id_programa_benchmark); setManualUrl(p.url_programa ?? ''); }}
                                    title="Cargar texto fuente manualmente"
                                    style={{ padding: '3px 7px', borderRadius: 4, border: `1px solid ${border}`,
                                      background: 'transparent', color: text, fontWeight: 700, fontSize: 9, cursor: 'pointer' }}>
                                    Manual
                                  </button>
                                  {p.estado_extraccion !== 'pendiente' && (
                                    <button
                                      onClick={() => handleNormalizarIA(p.id_programa_benchmark)}
                                      disabled={isBusy}
                                      title="Normalizar con IA"
                                      style={{ padding: '3px 7px', borderRadius: 4, border: 'none',
                                        background: isBusy && actionLoading[p.id_programa_benchmark] === 'ia' ? '#94a3b8' : CYAN,
                                        color: '#fff', fontWeight: 700, fontSize: 9, cursor: isBusy ? 'not-allowed' : 'pointer' }}>
                                      {actionLoading[p.id_programa_benchmark] === 'ia' ? '...' : 'IA'}
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tabla comparativa de competencias */}
          {competencias.length > 0 && (
            <div style={{ background: card, borderRadius: 10, border: `1px solid ${border}`, overflow: 'hidden' }}>
              <div style={{ background: isDark ? '#1e293b' : '#f1f5f9', padding: '10px 16px',
                borderBottom: `1px solid ${border}` }}>
                <span style={{ fontWeight: 800, fontSize: 12, color: USIL, textTransform: 'uppercase' }}>
                  Competencias detectadas en benchmarking ({competencias.length})
                </span>
                <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>
                  {universidadesConPrograma.length} universidades · {competenciasUnicas.length} competencias únicas
                </div>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr style={{ background: isDark ? '#0f172a' : '#f8fafc' }}>
                      {['Universidad', 'País', 'Programa', 'Competencia', 'Tipo'].map(h => (
                        <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700,
                          color: muted, borderBottom: `1px solid ${border}` }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {competencias.map((c, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>{c.nombre_universidad}</td>
                        <td style={{ padding: '7px 10px', color: muted }}>{c.pais}</td>
                        <td style={{ padding: '7px 10px', color: muted, maxWidth: 140 }}>{c.nombre_programa}</td>
                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>{c.nombre_competencia}</td>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px',
                            borderRadius: 8, background: '#dbeafe', color: '#1d4ed8' }}>
                            {c.tipo_competencia}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: agregar universidad */}
      {showAddUniv && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddUniv(false); }}>
          <div style={{ background: card, borderRadius: 12, padding: '24px 28px', width: 420,
            maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', color: text }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: USIL }}>
              Agregar Universidad — {TIPO_LABELS[tipo]}
            </h3>
            {[
              { key: 'nombre_universidad', label: 'Nombre de la Universidad *', ph: 'Ej. Universidad de Lima' },
              { key: 'pais', label: 'País', ph: 'Peru' },
              { key: 'ciudad', label: 'Ciudad', ph: 'Lima' },
              { key: 'sitio_web', label: 'Sitio web', ph: 'https://...' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, textTransform: 'uppercase' }}>
                  {f.label}
                </label>
                <input
                  value={(newUniv as any)[f.key]}
                  onChange={e => setNewUniv(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${border}`,
                    background: isDark ? '#0f172a' : '#f8fafc', color: text, fontSize: 12, boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowAddUniv(false)}
                style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${border}`,
                  background: 'transparent', color: text, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleAddUniversidad}
                disabled={!newUniv.nombre_universidad.trim()}
                style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none',
                  background: newUniv.nombre_universidad.trim() ? USIL : '#94a3b8',
                  color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: agregar programa */}
      {showAddProg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddProg(false); }}>
          <div style={{ background: card, borderRadius: 12, padding: '24px 28px', width: 460,
            maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', color: text }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: USIL }}>
              Agregar Programa Benchmark
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, textTransform: 'uppercase' }}>
                Universidad *
              </label>
              <select value={selectedUnivForProg}
                onChange={e => setSelectedUnivForProg(e.target.value ? Number(e.target.value) : '')}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${border}`,
                  background: isDark ? '#0f172a' : '#f8fafc', color: text, fontSize: 12 }}>
                <option value="">— Seleccionar —</option>
                {universidades.map(u => (
                  <option key={u.id_universidad_benchmark} value={u.id_universidad_benchmark}>
                    {u.nombre_universidad}
                  </option>
                ))}
              </select>
            </div>
            {[
              { key: 'nombre_programa', label: 'Nombre del Programa *', ph: 'Ej. Ingeniería de Software' },
              { key: 'url_programa', label: 'URL del programa', ph: 'https://...' },
              { key: 'modalidad', label: 'Modalidad', ph: 'Presencial, Virtual, Híbrido' },
              { key: 'duracion', label: 'Duración', ph: '5 años, 10 ciclos...' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, textTransform: 'uppercase' }}>
                  {f.label}
                </label>
                <input
                  value={(newProg as any)[f.key]}
                  onChange={e => setNewProg(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${border}`,
                    background: isDark ? '#0f172a' : '#f8fafc', color: text, fontSize: 12, boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowAddProg(false)}
                style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${border}`,
                  background: 'transparent', color: text, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleAddPrograma}
                disabled={!newProg.nombre_programa.trim() || !selectedUnivForProg}
                style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none',
                  background: newProg.nombre_programa.trim() && selectedUnivForProg ? USIL : '#94a3b8',
                  color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: carga manual de texto */}
      {showManualText !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowManualText(null); }}>
          <div style={{ background: card, borderRadius: 12, padding: '24px 28px', width: 520,
            maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', color: text }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: USIL }}>
              Carga Manual de Texto Fuente
            </h3>
            <p style={{ fontSize: 11, color: muted, marginBottom: 14 }}>
              Si el scraping automático está bloqueado, copia y pega aquí el texto del plan de estudios o perfil de egreso de la página.
            </p>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, textTransform: 'uppercase' }}>
                URL de origen
              </label>
              <input value={manualUrl} onChange={e => setManualUrl(e.target.value)} placeholder="https://..."
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${border}`,
                  background: isDark ? '#0f172a' : '#f8fafc', color: text, fontSize: 12, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, textTransform: 'uppercase' }}>
                Texto fuente * (mínimo 20 caracteres)
              </label>
              <textarea value={manualText} onChange={e => setManualText(e.target.value)}
                rows={8} placeholder="Pega aquí el texto del plan de estudios, perfil de egreso, cursos, etc."
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${border}`,
                  background: isDark ? '#0f172a' : '#f8fafc', color: text, fontSize: 12,
                  boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowManualText(null); setManualText(''); setManualUrl(''); }}
                style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${border}`,
                  background: 'transparent', color: text, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => handleCargarManual(showManualText!)}
                disabled={manualText.trim().length < 20}
                style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none',
                  background: manualText.trim().length >= 20 ? USIL : '#94a3b8',
                  color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Guardar texto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BenchmarkingView;
