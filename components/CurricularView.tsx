import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ThemeColors } from '../types';
import ImpactoCurricularView from './ImpactoCurricularView';
import BenchmarkingView from './BenchmarkingView';
import { downloadExcel } from '../services/excelExport';
import { logActividad } from '../services/actividadService';

interface CurricularViewProps {
  themeColors: ThemeColors;
  userRole?: string;
}

type EstadoCurso = 'alineado' | 'riesgo' | 'critico' | 'oportunidad';

interface Recomendacion {
  impacto: 'ALTO' | 'MEDIO' | 'BAJO';
  urgencia: 'CRÍTICA' | 'ALTA' | 'MEDIA' | 'BAJA';
  texto: string;
}

interface Curso {
  id: number;
  nombre: string;
  codigo?: string | null;
  ciclo: number;
  orden?: number | null;
  creditos: number | null;
  tipoCurso: string;
  horasTeoria?: number | null;
  horasPractica?: number | null;
  horasLab?: number | null;
  prerequisito?: string | null;
  mencion?: string | null;
  creditosMinimos?: number | null;
  estado: EstadoCurso | null;
  pct: number | null;
  tendencias: string[];
  gaps: string[];
  recomendaciones: Recomendacion[];
}

interface CicloData {
  label: string;
  numero: number;
  cursos: Curso[];
}

interface KPIs {
  totalCursos: number;
  pctRiesgo: number;
  pctAlineado: number;
  oportunidades: number;
  criticos: number;
  pctAlineacionPromedio: number | null;
}

interface MallaOpcion {
  id_malla: number;
  nombre_version: string;
  anio_inicio: number;
  es_vigente: number;
  nombre_carrera: string;
  nombre_facultad: string;
  total_cursos: number;
}

interface Vision360Data {
  malla: MallaOpcion & {
    periodo_aplicacion?: string | null;
    modalidad?: string | null;
    total_creditos?: number | null;
  };
  fundamento: {
    codigoPrograma?: string | null;
    gradoOtorgado?: string | null;
    tituloOtorgado?: string | null;
    regimenEstudios?: string | null;
    duracionMeses?: number | null;
    fechaAprobacion?: string | null;
    objetivoAcademico?: string | null;
    perfilIngreso?: string | null;
    perfilEgreso?: string | null;
    objetivosEducacionales?: string | null;
    resumenPlan?: unknown;
  } | null;
  competencias: {
    idCompetencia: number;
    codigo: string;
    nombre: string;
    tipo?: string | null;
    niveles: { nivel: number; etiqueta?: string | null; descripcion?: string | null }[];
  }[];
  cursos: {
    detalles: Record<string, Record<string, any>>;
    sumillas: Record<string, Record<string, any>>;
    competencias: Record<string, {
      codigo: string;
      nombre: string;
      tipo?: string | null;
      nivel: number;
      evidencia?: string | null;
    }[]>;
  };
  electivos: {
    idElectivo: number;
    cicloSugerido?: number | null;
    codigoCurso?: string | null;
    nombreCurso: string;
    creditos?: number | null;
    condicion?: string | null;
    mencion?: string | null;
  }[];
  menciones: {
    idMencion: number;
    codigo?: string | null;
    nombre: string;
    tipo: string;
    cursos: {
      codigoCurso?: string | null;
      nombreCurso: string;
      ciclo?: number | null;
      condicion?: string | null;
    }[];
  }[];
}

interface FiltrosData {
  facultades: { id_facultad: number; nombre_facultad: string }[];
  carreras:   { id_carrera: number; nombre_carrera: string; id_facultad: number; nombre_facultad: string }[];
}

const EST: Record<EstadoCurso, { bg: string; border: string; label: string; text: string; dot: string }> = {
  alineado:    { bg: '#dcfce7', border: '#22c55e', label: 'Alineado',       text: '#166534', dot: '#22c55e' },
  riesgo:      { bg: '#ffedd5', border: '#f97316', label: 'Riesgo Parcial', text: '#9a3412', dot: '#f97316' },
  critico:     { bg: '#ffdad6', border: '#ba1a1a', label: 'Obsolescente',   text: '#93000a', dot: '#ba1a1a' },
  oportunidad: { bg: '#dbeafe', border: '#3b82f6', label: 'Oportunidad',    text: '#1d4ed8', dot: '#3b82f6' },
};

const USIL = '#001a48';
const CYAN = '#006876';
const CYAN_LIGHT = '#58e6ff';
const SURFACE_LOW = '#f1f4f7';
const OUTLINE_VARIANT = '#c4c6d2';
const FONT_HEAD = "'Manrope', 'Segoe UI', sans-serif";
const FONT_DATA = "'Inter', 'Segoe UI', sans-serif";
// Tokens adicionales tomados del mockup (DESIGN.md de Visión 360) que no estaban
// declarados como constantes: tertiary-container (verde oscuro) y error (rojo).
const TERTIARY_CONTAINER = '#003a0a';
const TERTIARY_FIXED = '#a3f69c';
const ERROR = '#ba1a1a';

const IMP_COLOR: Record<string, { bg: string; text: string }> = {
  ALTO:  { bg: '#dcfce7', text: '#166534' },
  MEDIO: { bg: '#dbeafe', text: '#1d4ed8' },
  BAJO:  { bg: '#f3f4f6', text: '#374151' },
};
const URG_COLOR: Record<string, { bg: string; text: string }> = {
  'CRÍTICA': { bg: '#fee2e2', text: '#991b1b' },
  ALTA:      { bg: '#ffedd5', text: '#9a3412' },
  MEDIA:     { bg: '#fef9c3', text: '#854d0e' },
  BAJA:      { bg: '#f0fdf4', text: '#166534' },
};

const EMPTY_KPIS: KPIs = { totalCursos: 0, pctRiesgo: 0, pctAlineado: 0, oportunidades: 0, criticos: 0, pctAlineacionPromedio: null };

function compactText(value?: string | null, max = 280) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max).trim()}...` : clean;
}

function normalizeCurricularName(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function pickRichCurricularCareer(carreras: FiltrosData['carreras']) {
  const enrichedCareers = [
    'educacion inicial',
    'educacion secundaria con especialidad en ingles',
  ];
  return carreras.find(c => enrichedCareers.includes(normalizeCurricularName(c.nombre_carrera)))
    ?? carreras.find(c => normalizeCurricularName(c.nombre_facultad).includes('educacion'))
    ?? carreras[0];
}

function pickMallaVersion(rows: MallaOpcion[], carrera: string) {
  const normalized = normalizeCurricularName(carrera);
  if (normalized === 'educacion inicial' || normalized === 'educacion secundaria con especialidad en ingles') {
    const enriched = rows.find(m => normalizeCurricularName(m.nombre_version).includes('xlsm'))
      ?? rows.find(m => Number(m.total_cursos) === (normalized === 'educacion inicial' ? 58 : 55));
    if (enriched) return enriched;
  }
  return rows.find((m: MallaOpcion) => m.es_vigente === 1) || rows[0];
}

interface ImportPreview {
  totalRows: number;
  headers: string[];
  facultades: number;
  carreras: number;
  preview: { facultad: string; carrera: string; version: string; ciclo: string; curso: string }[];
}

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  total: number;
  errors: { fila: number; error: string }[];
}

type TabCurricular = 'mapa' | 'silabos' | 'benchmarking' | 'impacto';
const VALID_CURRICULAR_TABS: TabCurricular[] = ['mapa', 'benchmarking', 'impacto'];


function MapaSilabosView({ card, text, muted, border, isDark, selCarrera, carrerasFiltradas, selFacultad, filtros }: {
  card: string; text: string; muted: string; border: string; isDark: boolean;
  selCarrera: string; selFacultad: string;
  carrerasFiltradas: { id_carrera: number; nombre_carrera: string; id_facultad: number; nombre_facultad: string }[];
  filtros: FiltrosData;
}) {
  const [selCiclo,  setSelCiclo]  = React.useState('');
  const [selCurso,  setSelCurso]  = React.useState('');

  const cardStyle: React.CSSProperties = {
    background: card, borderRadius: 12, border: `1px solid ${border}`,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  };


  const silabosEjemplo = selCarrera !== 'Todas' ? [
    { ciclo: 1, curso: 'Fundamentos de la Carrera',   estado: 'Pendiente', creditos: 4, codigo: 'FND101' },
    { ciclo: 1, curso: 'Matemática Básica',            estado: 'Pendiente', creditos: 3, codigo: 'MAT101' },
    { ciclo: 2, curso: 'Diseño y Metodología',         estado: 'Pendiente', creditos: 4, codigo: 'DIS201' },
    { ciclo: 2, curso: 'Comunicación Profesional',     estado: 'Pendiente', creditos: 3, codigo: 'COM201' },
  ] : [];

  const ciclosFiltrados = selCiclo ? silabosEjemplo.filter(s => String(s.ciclo) === selCiclo) : silabosEjemplo;
  const cursosFinales   = selCurso ? ciclosFiltrados.filter(s => s.curso.toLowerCase().includes(selCurso.toLowerCase())) : ciclosFiltrados;

  const estadoColor = (e: string) => e === 'Disponible' ? '#10b981' : e === 'Revisión' ? '#f59e0b' : '#94a3b8';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <div style={{ ...cardStyle, padding: '14px 18px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 120 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Ciclo</div>
          <select value={selCiclo} onChange={e => setSelCiclo(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`, background: isDark ? '#0f172a' : '#f8fafc', color: text, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <option value="">Todos</option>
            {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>Ciclo {n}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Buscar curso</div>
          <input value={selCurso} onChange={e => setSelCurso(e.target.value)} placeholder="Nombre del curso..."
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`, background: isDark ? '#0f172a' : '#f8fafc', color: text, fontSize: 12, boxSizing: 'border-box' }} />
        </div>
      </div>


      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: muted }}>Sílabos de cursos</span>
          <span style={{ fontSize: 10, color: muted }}>
            {selCarrera !== 'Todas' ? `${cursosFinales.length} curso(s) encontrados` : 'Selecciona una carrera para ver los sílabos'}
          </span>
        </div>
        {selCarrera === 'Todas' ? (
          <div style={{ padding: '50px 16px', textAlign: 'center', color: muted }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, display: 'block', marginBottom: 10, opacity: 0.4 }}>menu_book</span>
            <p style={{ fontSize: 13, fontWeight: 600 }}>Selecciona una carrera en los filtros superiores</p>
            <p style={{ fontSize: 11, marginTop: 4 }}>Los sílabos se mostrarán por ciclo y curso.</p>
          </div>
        ) : cursosFinales.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: muted, fontSize: 12 }}>Sin resultados para los filtros seleccionados.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc' }}>
                {['Ciclo', 'Código', 'Curso', 'Créditos', 'Estado', 'Sílabo'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: muted, borderBottom: `1px solid ${border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cursosFinales.map((s, idx) => (
                <tr key={idx} style={{ borderBottom: idx < cursosFinales.length - 1 ? `1px solid ${border}` : 'none' }}>
                  <td style={{ padding: '11px 14px', fontSize: 11, fontWeight: 700, color: text }}>Ciclo {s.ciclo}</td>
                  <td style={{ padding: '11px 14px', fontSize: 11, color: muted }}>{s.codigo}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, fontWeight: 600, color: text }}>{s.curso}</td>
                  <td style={{ padding: '11px 14px', fontSize: 11, color: muted, textAlign: 'center' }}>{s.creditos}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100, background: estadoColor(s.estado) + '22', color: estadoColor(s.estado) }}>{s.estado}</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <button style={{ fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 7, border: `1px solid ${border}`, background: card, color: muted, cursor: 'not-allowed', opacity: 0.6 }}>
                      Ver sílabo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>


      <div style={{ padding: '12px 16px', borderRadius: 10, background: isDark ? 'rgba(59,130,246,0.08)' : '#eff6ff', border: `1px solid ${isDark ? 'rgba(59,130,246,0.2)' : '#bfdbfe'}`, fontSize: 11, color: isDark ? '#93c5fd' : '#1d4ed8', fontWeight: 500 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }}>info</span>
        Esta vista está preparada para integrar sílabos por carrera, ciclo y curso. Permite en el futuro analizar contenidos, competencias y relación con el mercado laboral.
      </div>
    </div>
  );
}

const CurricularView: React.FC<CurricularViewProps> = ({ themeColors: C, userRole }) => {
  const [activeTab, setActiveTab]  = useState<TabCurricular>(() => {
    const stored = localStorage.getItem('radar_curricular_tab') as TabCurricular | null;
    return stored && VALID_CURRICULAR_TABS.includes(stored) ? stored : 'mapa';
  });


  const [filtros,      setFiltros]     = useState<FiltrosData>({ facultades: [], carreras: [] });
  const [selFacultad,  setSelFacultad] = useState('Todas');
  const [selCarrera,   setSelCarrera]  = useState('Todas');
  const [selCarreraId, setSelCarreraId] = useState<number | null>(null);
  const [mallas,       setMallas]      = useState<MallaOpcion[]>([]);
  const [selMallaId,   setSelMallaId]  = useState<number | null>(null);


  const [ciclos,       setCiclos]      = useState<CicloData[]>([]);
  const [kpis,         setKpis]        = useState<KPIs>(EMPTY_KPIS);
  const [vision360,    setVision360]   = useState<Vision360Data | null>(null);
  const [vistaMapa,    setVistaMapa]   = useState<'malla' | 'prioridad'>('malla');
  const [loading,      setLoading]     = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const [selectedCurso, setSelectedCurso] = useState<Curso | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);


  const [showImport,    setShowImport]    = useState(false);
  const [importFile,    setImportFile]    = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [previewing,    setPreviewing]    = useState(false);
  const [importing,     setImporting]     = useState(false);
  const [importResult,  setImportResult]  = useState<ImportResult | null>(null);
  const [importError,   setImportError]   = useState<string | null>(null);

  const isDark = C.cardBg?.includes('slate-9') ?? false;
  const bg     = isDark ? '#0f172a' : '#f8fafc';
  const card   = isDark ? '#1e293b' : '#ffffff';
  const text   = isDark ? '#f1f5f9' : '#1e293b';
  const muted  = isDark ? '#94a3b8' : '#64748b';
  const border = isDark ? 'rgba(148,163,184,0.15)' : '#e2e8f0';
  const canImport = userRole === 'admin';
  const switchTab = (tab: TabCurricular) => {
    localStorage.setItem('radar_curricular_tab', tab);
    setActiveTab(tab);
  };

  const headers = {};

  useEffect(() => {
    fetch('/api/curricular/filtros', { headers, credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setFiltros(d);
          if (d.carreras?.length) {
            const primera = pickRichCurricularCareer(d.carreras);
            setSelFacultad(primera.nombre_facultad);
            setSelCarrera(primera.nombre_carrera);
            setSelCarreraId(primera.id_carrera);
          }
        }
      })
      .catch(() => {});
  }, []);

  const carrerasFiltradas = selFacultad === 'Todas'
    ? filtros.carreras
    : filtros.carreras.filter(c => c.nombre_facultad === selFacultad);

  useEffect(() => {
    if (selCarrera === 'Todas') { setMallas([]); setSelMallaId(null); setSelCarreraId(null); return; }
    const p = new URLSearchParams({ carrera: selCarrera });
    if (selFacultad !== 'Todas') p.set('facultad', selFacultad);
    fetch(`/api/curricular/mallas?${p}`, { headers, credentials: 'include' })
      .then(r => r.json())
      .then(rows => {
        if (Array.isArray(rows)) {
          setMallas(rows);
          const vigente = pickMallaVersion(rows, selCarrera);
          setSelMallaId(vigente?.id_malla ?? null);
        }
      })
      .catch(() => {});
  }, [selCarrera, selFacultad]);

  const fetchMalla = useCallback(async () => {
    if (!selMallaId) {
      setCiclos([]);
      setKpis(EMPTY_KPIS);
      setVision360(null);
      setSelectedCurso(null);
      return;
    }
    setLoading(true);
    try {
      const [ciclosData, kpisData, visionData] = await Promise.all([
        fetch(`/api/curricular/mapa/${selMallaId}`,  { headers, credentials: 'include' }).then(r => r.json()),
        fetch(`/api/curricular/kpis/${selMallaId}`,  { headers, credentials: 'include' }).then(r => r.json()),
        fetch(`/api/curricular/mallas/${selMallaId}/vision360`, { headers, credentials: 'include' }).then(r => r.json()),
      ]);
      if (Array.isArray(ciclosData)) {
        setCiclos(ciclosData);
        const primero = ciclosData.flatMap((c: CicloData) => c.cursos).find((c: Curso) => c.estado !== null) ?? ciclosData[0]?.cursos[0] ?? null;
        setSelectedCurso(primero);
      }
      if (!kpisData.error) setKpis(kpisData);
      setVision360(!visionData.error ? visionData : null);
    } catch {}
    setLoading(false);
  }, [selMallaId]);

  useEffect(() => { fetchMalla(); }, [fetchMalla]);

  const [analyzingMapa, setAnalyzingMapa] = useState(false);
  const [analyzeMapaError, setAnalyzeMapaError] = useState<string | null>(null);

  const handleAnalizarMapa = async () => {
    if (!selCarreraId || !selMallaId) return;
    setAnalyzingMapa(true);
    setAnalyzeMapaError(null);
    try {
      const r = await fetch(`/api/curricular/analizar-mapa/${selCarreraId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id_malla_version: selMallaId }),
      });
      const d = await r.json();
      if (!r.ok || d.error) {
        setAnalyzeMapaError(d.error || 'No se pudo analizar el mapa curricular');
      } else {
        await fetchMalla();
      }
    } catch (e: any) {
      setAnalyzeMapaError(e.message ?? 'Error al analizar el mapa curricular');
    }
    setAnalyzingMapa(false);
  };

  const handleFacultadChange = (fac: string) => {
    setSelFacultad(fac);
    const carrerasDeFac = fac === 'Todas'
      ? filtros.carreras
      : filtros.carreras.filter(c => c.nombre_facultad === fac);
    const primera = pickRichCurricularCareer(carrerasDeFac);
    if (primera) {
      setSelCarrera(primera.nombre_carrera);
      setSelCarreraId(primera.id_carrera);
    } else {
      setSelCarrera('Todas');
      setSelCarreraId(null);
      setMallas([]);
      setSelMallaId(null);
    }
  };

  const handleCarreraChange = (nombre: string) => {
    setSelCarrera(nombre);
    const found = filtros.carreras.find(c => c.nombre_carrera === nombre);
    setSelCarreraId(found?.id_carrera ?? null);
  };


  const openImportModal = () => {
    setShowImport(true);
    setImportFile(null);
    setImportPreview(null);
    setImportResult(null);
    setImportError(null);
  };

  const handleFileSelect = async (file: File) => {
    setImportFile(file);
    setImportPreview(null);
    setImportResult(null);
    setImportError(null);
    setPreviewing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/curricular/preview', { method: 'POST', body: fd, credentials: 'include' });
      const d = await r.json();
      if (d.error) { setImportError(d.error); }
      else { setImportPreview(d); }
    } catch (e: any) {
      setImportError(e.message ?? 'Error al leer el archivo');
    }
    setPreviewing(false);
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportError(null);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const r = await fetch('/api/curricular/importar', { method: 'POST', body: fd, credentials: 'include' });
      const d: ImportResult = await r.json();
      if ((d as any).error) { setImportError((d as any).error); }
      else {
        setImportResult(d);
        fetch('/api/curricular/filtros', { credentials: 'include' })
          .then(r2 => r2.json())
          .then(df => {
            if (!df.error) {
              setFiltros(df);
              if (df.carreras?.length && selCarrera === 'Todas') {
                const primera = pickRichCurricularCareer(df.carreras);
                setSelFacultad(primera.nombre_facultad);
                setSelCarrera(primera.nombre_carrera);
                setSelCarreraId(primera.id_carrera);
              }
            }
          })
          .catch(() => {});
      }
    } catch (e: any) {
      setImportError(e.message ?? 'Error al importar');
    }
    setImporting(false);
  };

  const mallaActual = mallas.find(m => m.id_malla === selMallaId);
  const selectedCursoKey = selectedCurso?.id ? String(selectedCurso.id) : '';
  const selectedCursoSumilla = selectedCursoKey ? vision360?.cursos.sumillas[selectedCursoKey] : null;
  const selectedCursoCompetencias = selectedCursoKey ? (vision360?.cursos.competencias[selectedCursoKey] || []) : [];
  const allCursos = ciclos.flatMap(c => c.cursos);
  const cursosPrioridad = [...allCursos].sort((a, b) => {
    const rank: Record<string, number> = { critico: 0, riesgo: 1, oportunidad: 2, alineado: 3 };
    return (rank[a.estado || 'alineado'] ?? 4) - (rank[b.estado || 'alineado'] ?? 4)
      || a.ciclo - b.ciclo
      || (a.orden || 999) - (b.orden || 999);
  }).slice(0, 14);
  const totalCreditos = vision360?.malla.total_creditos ?? allCursos.reduce((sum, curso) => sum + (Number(curso.creditos) || 0), 0);
  const cursosAlineados = allCursos.filter(curso => curso.estado === 'alineado').length;
  const cursosRevision = allCursos.filter(curso => curso.estado === 'riesgo' || curso.estado === 'critico').length;
  const cursosPrioritariosTotal = cursosPrioridad.filter(curso => curso.estado === 'riesgo' || curso.estado === 'critico').length;
  const sumillasCount = Object.keys(vision360?.cursos.sumillas || {}).length;
  const hasStructuredVision = Boolean(
    vision360?.fundamento
    || (vision360?.competencias.length ?? 0) > 0
    || (vision360?.menciones.length ?? 0) > 0
    || (vision360?.electivos.length ?? 0) > 0
    || sumillasCount > 0
  );
  const promptAnalisisCurricular = vision360 && mallaActual ? [
    `Actua como especialista senior en diseno curricular universitario para USIL.`,
    `Analiza la malla "${mallaActual.nombre_carrera}" (${mallaActual.nombre_version}) usando solo la informacion oficial estructurada en la base de datos.`,
    ``,
    `Datos disponibles:`,
    `- Codigo del programa: ${vision360.fundamento?.codigoPrograma || 'no registrado'}`,
    `- Grado: ${vision360.fundamento?.gradoOtorgado || 'no registrado'}`,
    `- Titulo: ${vision360.fundamento?.tituloOtorgado || 'no registrado'}`,
    `- Cursos: ${allCursos.length}`,
    `- Creditos: ${totalCreditos || 'no registrado'}`,
    `- Competencias: ${vision360.competencias.length}`,
    `- Sumillas: ${sumillasCount}`,
    `- Menciones/certificaciones: ${vision360.menciones.length}`,
    `- Electivos: ${vision360.electivos.length}`,
    ``,
    `Perfil de egreso:`,
    compactText(vision360.fundamento?.perfilEgreso, 900) || 'No registrado.',
    ``,
    `Menciones:`,
    vision360.menciones.length
      ? vision360.menciones.map(m => `- ${m.nombre}: ${m.cursos.map(c => c.nombreCurso).join('; ')}`).join('\n')
      : '- No hay menciones registradas.',
    ``,
    `Tareas:`,
    `1. Cruza perfil de egreso, competencias, sumillas, cursos y menciones para detectar brechas reales.`,
    `2. Senala los cursos afectados por ciclo y el tipo de ajuste sugerido.`,
    `3. Propone acciones curriculares con prioridad alta, media o baja.`,
    `4. No inventes cursos, competencias ni menciones fuera de la base de datos.`,
  ].join('\n') : '';

  const handleCopyPrompt = async () => {
    if (!promptAnalisisCurricular) return;
    try {
      await navigator.clipboard.writeText(promptAnalisisCurricular);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 1800);
    } catch {
      setPromptCopied(false);
    }
  };

  const handleExportMapaExcel = async () => {
    if (!mallaActual) return;
    const cursosRows = ciclos.flatMap(c => c.cursos.map(curso => ({
      ciclo: c.numero,
      curso: curso.nombre,
      codigo: curso.codigo || '',
      creditos: curso.creditos ?? '',
      tipo: curso.tipoCurso,
      estado: curso.estado ? EST[curso.estado].label : '',
      alineacion: curso.pct ?? '',
      tendencias: curso.tendencias.join(', '),
      gaps: curso.gaps.join(', '),
    })));

    await downloadExcel(`Malla_${mallaActual.nombre_carrera.replace(/\s+/g, '_')}`, [
      {
        name: 'KPIs',
        columns: [{ header: 'Indicador', key: 'indicador', width: 30 }, { header: 'Valor', key: 'valor', width: 20 }],
        rows: [
          { indicador: 'Carrera', valor: mallaActual.nombre_carrera },
          { indicador: 'Facultad', valor: mallaActual.nombre_facultad },
          { indicador: 'Versión de malla', valor: mallaActual.nombre_version },
          { indicador: '% en riesgo/crítico', valor: kpis.pctRiesgo },
          { indicador: '% alineado', valor: kpis.pctAlineado },
          { indicador: 'Total cursos', valor: kpis.totalCursos },
          { indicador: 'Oportunidades', valor: kpis.oportunidades },
          { indicador: 'Críticos', valor: kpis.criticos },
        ],
      },
      {
        name: 'Cursos',
        columns: [
          { header: 'Ciclo', key: 'ciclo', width: 10 },
          { header: 'Curso', key: 'curso', width: 40 },
          { header: 'Código', key: 'codigo', width: 14 },
          { header: 'Créditos', key: 'creditos', width: 12 },
          { header: 'Tipo', key: 'tipo', width: 16 },
          { header: 'Estado', key: 'estado', width: 18 },
          { header: '% Alineación', key: 'alineacion', width: 14 },
          { header: 'Tendencias', key: 'tendencias', width: 40 },
          { header: 'Gaps', key: 'gaps', width: 40 },
        ],
        rows: cursosRows,
      },
    ]);

    logActividad('descargar_informe', {
      modulo: 'curricular',
      elementoTipo: 'malla',
      elementoTitulo: mallaActual.nombre_carrera,
      metadata: { formato: 'xlsx', carrera: mallaActual.nombre_carrera, idMalla: mallaActual.id_malla },
    });
  };

  return (
    <div style={{ padding: '14px 20px', background: bg, minHeight: '100%', color: text, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT_DATA }}>


      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, borderBottom: `1px solid ${border}`, paddingBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.15, fontWeight: 800, color: USIL, fontFamily: FONT_HEAD }}>
            Visión 360 - Curricular
          </h1>
          <nav style={{ display: 'flex', gap: 22, alignItems: 'center', height: 34 }}>
            {([
              { key: 'mapa', label: 'Visión 360' },
              { key: 'benchmarking', label: 'Benchmarking' },
              { key: 'impacto', label: 'Plan de acción' },
            ] as { key: TabCurricular; label: string }[]).map(t => {
              const active = activeTab === t.key;
              return (
                <button key={t.key} onClick={() => switchTab(t.key)}
                  style={{ height: 34, padding: 0, border: 'none', borderBottom: active ? `2px solid ${CYAN}` : '2px solid transparent',
                    background: 'transparent', color: active ? USIL : text, cursor: 'pointer',
                    fontFamily: FONT_DATA, fontSize: 12, fontWeight: active ? 800 : 600 }}>
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
        {activeTab === 'mapa' && mallaActual && (
          <button onClick={handleExportMapaExcel}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              height: 36, padding: '0 14px', borderRadius: 6, border: 'none',
              background: USIL, color: '#fff', fontSize: 12, fontWeight: 800,
              cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Export
          </button>
        )}
      </div>


      {activeTab === 'mapa' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end',
          padding: '4px 0 2px' }}>
          <div style={{ width: 160 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Facultad
            </label>
            <select value={selFacultad} onChange={e => handleFacultadChange(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`,
                background: card, color: text, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <option>Todas</option>
              {filtros.facultades.map(f => <option key={f.id_facultad}>{f.nombre_facultad}</option>)}
            </select>
          </div>
          <div style={{ width: 340, maxWidth: '100%' }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Carrera
            </label>
            <select value={selCarrera} onChange={e => handleCarreraChange(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`,
                background: card, color: text, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <option>Todas</option>
              {carrerasFiltradas.map(c => <option key={c.id_carrera}>{c.nombre_carrera}</option>)}
            </select>
          </div>
          {canImport && mallaActual && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button onClick={handleAnalizarMapa} disabled={analyzingMapa}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  height: 36, padding: '0 14px', borderRadius: 8, border: 'none',
                  background: analyzingMapa ? '#94a3b8' : CYAN, color: '#fff', fontSize: 12, fontWeight: 700,
                  cursor: analyzingMapa ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {analyzingMapa ? 'sync' : 'model_training'}
                </span>
                {analyzingMapa ? 'Analizando cursos…' : 'Analizar mapa curricular'}
              </button>
              {analyzeMapaError && (
                <span style={{ fontSize: 10, color: '#ba1a1a', maxWidth: 260 }}>{analyzeMapaError}</span>
              )}
            </div>
          )}
        </div>
      )}


      {activeTab === 'mapa' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: muted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Carrera</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.2, fontWeight: 800, letterSpacing: '-0.01em', color: USIL, fontFamily: FONT_HEAD }}>
                {mallaActual?.nombre_carrera || selCarrera || 'Selecciona una carrera'}
              </h1>
              <span style={{ background: SURFACE_LOW, color: text, border: `1px solid ${OUTLINE_VARIANT}`, borderRadius: 999, padding: '4px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em' }}>
                {mallaActual?.nombre_version || 'Plan vigente'}
              </span>
              <span style={{ background: TERTIARY_FIXED, color: '#002204', borderRadius: 999, padding: '4px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Tendencia
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>trending_up</span>
                Estable
              </span>
            </div>
          </div>
          {mallaActual && (
            <div style={{ fontSize: 11, color: muted, textAlign: 'right' }}>
              {mallaActual.nombre_facultad} / {totalCreditos || '-'} creditos
            </div>
          )}
        </div>
      )}


      {activeTab === 'mapa' && (
        <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: '12px 16px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,45,114,0.06)' }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: text, paddingRight: 14, borderRight: `1px solid ${border}` }}>
            Evidencia que alimenta este analisis
          </div>
          {[
            { icon: 'storefront', label: 'Mercado' },
            { icon: 'work_outline', label: 'Empleabilidad' },
            { icon: 'query_stats', label: 'Benchmark' },
            { icon: 'public', label: 'Global Trends' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: CYAN }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: text, lineHeight: 1.2 }}>{item.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}


      {activeTab === 'benchmarking' && (
        // La gestion de fuentes (Competencia Directa/Internacional) se movio a
        // Gestion > Curricular; aqui solo queda el comparador de referencia.
        <BenchmarkingView themeColors={C} userRole={userRole} tiposDisponibles={['referente_nacional', 'referente_internacional']} />
      )}


      {activeTab === 'silabos' && (
        <MapaSilabosView card={card} text={text} muted={muted} border={border} isDark={isDark}
          selCarrera={selCarrera} carrerasFiltradas={carrerasFiltradas}
          selFacultad={selFacultad} filtros={filtros} />
      )}


      {activeTab === 'impacto' && (
        <ImpactoCurricularView
          themeColors={C}
          userRole={userRole}
          idCarrera={selCarreraId}
          idMallaVersion={selMallaId}
          nombreCarrera={selCarrera !== 'Todas' ? selCarrera : undefined}
          nombreMalla={mallaActual?.nombre_version}
        />
      )}


      {activeTab === 'mapa' && (
        <>
          {vision360?.fundamento && (
            <div style={{ background: card, borderRadius: 8, border: `1px solid ${border}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,45,114,0.08)' }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: CYAN }}>badge</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: USIL, fontFamily: FONT_HEAD }}>Ficha del programa</span>
              </div>
              <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(260px, .8fr)', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  {[
                    ['Código', vision360.fundamento.codigoPrograma],
                    ['Grado', vision360.fundamento.gradoOtorgado],
                    ['Título', vision360.fundamento.tituloOtorgado],
                    ['Régimen', vision360.fundamento.regimenEstudios],
                  ].map(([label, value]) => (
                    <div key={label} style={{ border: `1px solid ${border}`, borderRadius: 6, padding: '10px 12px', background: isDark ? '#0f172a' : SURFACE_LOW }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: text, lineHeight: 1.35 }}>{value || 'No registrado'}</div>
                    </div>
                  ))}
                </div>
                <div style={{ border: `1px solid ${border}`, borderRadius: 6, padding: '12px 14px', background: isDark ? '#0f172a' : SURFACE_LOW }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: USIL, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                    Perfil de egreso
                  </div>
                  <div style={{ fontSize: 12, color: text, lineHeight: 1.5 }}>
                    {compactText(vision360.fundamento.perfilEgreso, 420) || 'Aún no hay perfil de egreso estructurado para esta malla.'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {hasStructuredVision ? (
            <div style={{ background: card, borderRadius: 8, border: `1px solid ${border}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,45,114,0.08)' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: CYAN, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 4 }}>
                    Lectura estratégica con IA
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: USIL, fontFamily: FONT_HEAD }}>
                    Prompt curricular alimentado por la BD
                  </div>
                  <div style={{ fontSize: 11, color: muted, marginTop: 3 }}>
                    Usa perfil, competencias, sumillas, menciones, electivos y cursos de la malla seleccionada.
                  </div>
                </div>
                <button onClick={handleCopyPrompt}
                  style={{ height: 36, padding: '0 14px', borderRadius: 6, border: 'none',
                    background: USIL, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                    {promptCopied ? 'check' : 'content_copy'}
                  </span>
                  {promptCopied ? 'Copiado' : 'Copiar prompt'}
                </button>
              </div>
              <div style={{ padding: '12px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                {[
                  { label: 'Perfil', value: vision360?.fundamento?.perfilEgreso ? 'Registrado' : 'Pendiente' },
                  { label: 'Competencias', value: `${vision360?.competencias.length ?? 0}` },
                  { label: 'Sumillas', value: `${sumillasCount}` },
                  { label: 'Menciones', value: `${vision360?.menciones.length ?? 0}` },
                  { label: 'Electivos', value: `${vision360?.electivos.length ?? 0}` },
                ].map(item => (
                  <div key={item.label} style={{ border: `1px solid ${border}`, borderRadius: 6, padding: '9px 11px', background: isDark ? '#0f172a' : SURFACE_LOW }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>{item.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: USIL, marginTop: 3, fontFamily: FONT_HEAD }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '0 18px 16px' }}>
                <pre style={{ margin: 0, maxHeight: 190, overflowY: 'auto', whiteSpace: 'pre-wrap',
                  border: `1px solid ${border}`, borderRadius: 6, padding: 12,
                  background: isDark ? '#020617' : SURFACE_LOW, color: text,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: 11, lineHeight: 1.45 }}>
                  {promptAnalisisCurricular}
                </pre>
              </div>
            </div>
          ) : (
            <div style={{ background: card, borderRadius: 8, border: `1px dashed ${OUTLINE_VARIANT}`, padding: '18px 20px', color: muted, fontSize: 12 }}>
              Selecciona Educación Inicial o Educación Secundaria con Especialidad en Inglés para ver la estructura enriquecida del Excel: perfil, competencias, menciones, electivos, sumillas y prompt de análisis.
            </div>
          )}

          {/* KPI Banner: solo label (label-caps, mixed-case tal cual el mockup) + valor grande en Manrope.
              Sin badges de color ni texto descriptivo adicional, siguiendo fielmente code.html de la Vista 1. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 16 }}>
            <div style={{ background: card, borderRadius: 8, padding: '18px 18px', borderTop: `4px solid ${USIL}`, boxShadow: '0 2px 8px rgba(0,45,114,0.08)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: muted, marginBottom: 8 }}>Índice de Alineación</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 30, fontWeight: 700, color: USIL, fontFamily: FONT_HEAD, letterSpacing: '-0.01em' }}>
                  {kpis.pctAlineacionPromedio ?? kpis.pctAlineado}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, color: muted }}>%</span>
              </div>
            </div>
            <div style={{ background: card, borderRadius: 8, padding: '18px 18px', borderTop: `4px solid ${TERTIARY_CONTAINER}`, boxShadow: '0 2px 8px rgba(0,45,114,0.08)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: muted, marginBottom: 8 }}>Cursos alineados</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: TERTIARY_CONTAINER, fontFamily: FONT_HEAD, letterSpacing: '-0.01em' }}>
                {cursosAlineados}/{allCursos.length}
              </div>
            </div>
            <div style={{ background: card, borderRadius: 8, padding: '18px 18px', borderTop: `4px solid ${ERROR}`, boxShadow: '0 2px 8px rgba(0,45,114,0.08)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: muted, marginBottom: 8 }}>Cursos en revisión</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: ERROR, fontFamily: FONT_HEAD, letterSpacing: '-0.01em' }}>
                {cursosRevision}
              </div>
            </div>
            <div style={{ background: card, borderRadius: 8, padding: '18px 18px', borderTop: `4px solid ${text}`, boxShadow: '0 2px 8px rgba(0,45,114,0.08)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: muted, marginBottom: 8 }}>Cursos prioritarios</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: text, fontFamily: FONT_HEAD, letterSpacing: '-0.01em' }}>
                {cursosPrioritariosTotal}
              </div>
            </div>
            <div style={{ gridColumn: 'span 2', background: card, borderRadius: 8, padding: '18px 18px', borderTop: `4px solid ${CYAN_LIGHT}`, boxShadow: '0 2px 8px rgba(0,45,114,0.08)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: muted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                Oportunidades
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: CYAN_LIGHT }}>temp_preferences_custom</span>
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, color: CYAN, fontFamily: FONT_HEAD, letterSpacing: '-0.01em' }}>
                {kpis.oportunidades}
              </div>
            </div>
          </div>


          {selMallaId === null ? (
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: 40,
              textAlign: 'center', color: muted, fontSize: 13 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 8, opacity: 0.4 }}>school</span>
              Selecciona una carrera para ver el mapa de malla curricular
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 12, alignItems: 'start' }}>

              <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`,
                padding: '14px 16px', display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: USIL, fontFamily: FONT_HEAD }}>
                    {vistaMapa === 'malla' ? 'Mapa de pertinencia curricular' : 'Matriz de prioridad curricular'}
                  </h2>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', background: isDark ? '#0f172a' : '#f1f5f9', borderRadius: 8, padding: 3, border: `1px solid ${border}` }}>
                      {[
                        { key: 'malla' as const, label: 'Ciclos' },
                        { key: 'prioridad' as const, label: 'Prioridad' },
                      ].map(item => (
                        <button key={item.key} onClick={() => setVistaMapa(item.key)}
                          style={{ border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 10, fontWeight: 800, cursor: 'pointer',
                            background: vistaMapa === item.key ? '#fff' : 'transparent',
                            color: vistaMapa === item.key ? USIL : muted,
                            boxShadow: vistaMapa === item.key ? '0 1px 3px rgba(15,23,42,.12)' : 'none' }}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                    {Object.entries(EST).map(([key, val]) => (
                      <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: muted }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: val.dot, flexShrink: 0 }} />
                        {val.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ overflowX: 'auto', overflowY: 'visible',
                  paddingBottom: 8, scrollbarWidth: 'thin', scrollbarColor: `${border} transparent` }}>
                  {ciclos.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: muted, fontSize: 12 }}>
                      {loading ? 'Cargando cursos…' : 'No hay cursos cargados en esta malla'}
                    </div>
                  ) : vistaMapa === 'prioridad' ? (
                    // Matriz de prioridad (2x2). El backend no expone campos independientes de
                    // "brecha curricular actual" ni "oportunidad futura", así que se derivan por
                    // heurística de los campos ya existentes en Curso:
                    //  - Brecha actual ALTA  = estado en {'critico', 'riesgo'} (columna derecha).
                    //  - Brecha actual BAJA  = estado en {'alineado', 'oportunidad'} (columna izquierda).
                    //  - Oportunidad futura ALTA = estado === 'oportunidad' o pct < 50 (fila superior).
                    //  - Oportunidad futura BAJA = resto de los casos (fila inferior).
                    (() => {
                      const brechaAlta = (c: Curso) => c.estado === 'critico' || c.estado === 'riesgo';
                      const oportunidadAlta = (c: Curso) => c.estado === 'oportunidad' || (c.pct !== null && c.pct < 50);
                      const cInnovar = cursosPrioridad.filter(c => !brechaAlta(c) && oportunidadAlta(c));
                      const cActuar = cursosPrioridad.filter(c => brechaAlta(c) && oportunidadAlta(c));
                      const cMantener = cursosPrioridad.filter(c => !brechaAlta(c) && !oportunidadAlta(c));
                      const cOptimizar = cursosPrioridad.filter(c => brechaAlta(c) && !oportunidadAlta(c));

                      const chip = (c: Curso, color: string) => (
                        <button key={c.id} onClick={() => setSelectedCurso(c)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: isDark ? '#1e293b' : '#ffffff',
                            border: `1px solid ${color}`, borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 700,
                            color: isDark ? text : '#181c1e', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                            outline: selectedCurso?.id === c.id ? `2px solid ${USIL}` : 'none' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          {c.nombre}
                        </button>
                      );

                      const quadrant = (title: string, color: string, cursosQ: Curso[], extra: React.CSSProperties) => (
                        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', ...extra }}>
                          <span style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: '0.05em' }}>{title}</span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start' }}>
                            {cursosQ.length === 0
                              ? <span style={{ fontSize: 10, color: muted }}>Sin cursos</span>
                              : cursosQ.map(c => chip(c, color))}
                          </div>
                        </div>
                      );

                      return (
                        <div style={{ position: 'relative', background: isDark ? '#0f172a' : '#fff',
                          border: `1px solid ${border}`, borderRadius: 10, padding: '20px 24px 36px 40px', minHeight: 440 }}>
                          <div style={{ position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%) rotate(-90deg)',
                            transformOrigin: 'center', fontSize: 9, fontWeight: 800, color: muted, letterSpacing: '0.05em',
                            textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                            Oportunidad futura (Baja → Alta)
                          </div>
                          <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                            fontSize: 9, fontWeight: 800, color: muted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                            Brecha curricular actual (Baja → Alta)
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
                            height: 380, border: `2px solid ${OUTLINE_VARIANT}`, borderRadius: 6, overflow: 'hidden' }}>
                            {quadrant('INNOVAR', CYAN, cInnovar, {
                              borderRight: `1px dashed ${OUTLINE_VARIANT}`, borderBottom: `1px dashed ${OUTLINE_VARIANT}`,
                              background: isDark ? 'rgba(255,255,255,0.02)' : SURFACE_LOW })}
                            {quadrant('ACTUAR AHORA', ERROR, cActuar, {
                              borderBottom: `1px dashed ${OUTLINE_VARIANT}`,
                              background: isDark ? 'rgba(186,26,26,0.06)' : '#fef2f2' })}
                            {quadrant('MANTENER / MONITOREAR', muted, cMantener, {
                              borderRight: `1px dashed ${OUTLINE_VARIANT}`, justifyContent: 'flex-end' })}
                            {quadrant('OPTIMIZAR', CYAN, cOptimizar, {
                              justifyContent: 'flex-end', background: isDark ? 'rgba(255,255,255,0.02)' : SURFACE_LOW })}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div style={{ display: 'flex', gap: 10, minWidth: 'max-content' }}>
                      {ciclos.map(ciclo => (
                        <div key={ciclo.numero} style={{ width: 240, flexShrink: 0, background: isDark ? '#0f172a' : SURFACE_LOW, borderRadius: 8, padding: 8 }}>
                          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 11, color: muted,
                            textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 4px 10px',
                            borderBottom: `1px solid ${OUTLINE_VARIANT}`, marginBottom: 8 }}>
                            {ciclo.label}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {ciclo.cursos.map(curso => {
                              const cfg   = curso.estado ? EST[curso.estado] : null;
                              const sel   = selectedCurso?.id === curso.id;
                              const hasAnalysis = curso.estado !== null;
                              const stateColor = cfg ? cfg.dot : OUTLINE_VARIANT;
                              const stateIcon = curso.estado === 'critico' ? 'warning'
                                : curso.estado === 'riesgo' ? 'error_outline'
                                : curso.estado === 'oportunidad' ? 'auto_awesome'
                                : 'check_circle';
                              return (
                                <div key={curso.id}
                                  onClick={() => setSelectedCurso(curso)}
                                  style={{
                                    background: isDark ? '#1e293b' : '#ffffff',
                                    borderLeft: `4px solid ${stateColor}`,
                                    borderRadius: 6, padding: '10px 12px', cursor: 'pointer',
                                    position: 'relative',
                                    boxShadow: sel ? `0 0 0 2px ${USIL}` : '0 2px 8px rgba(0,45,114,0.08)',
                                    transition: 'box-shadow .15s',
                                    opacity: hasAnalysis ? 1 : 0.65,
                                  }}>
                                  {hasAnalysis && curso.estado === 'oportunidad' && (
                                    <span className="material-symbols-outlined" title="Oportunidad emergente"
                                      style={{ position: 'absolute', top: 8, right: 8, fontSize: 15, color: CYAN }}>
                                      temp_preferences_custom
                                    </span>
                                  )}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                                    {hasAnalysis && (
                                      <span className="material-symbols-outlined" style={{ fontSize: 13, color: stateColor }}>{stateIcon}</span>
                                    )}
                                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
                                      color: hasAnalysis ? stateColor : muted }}>
                                      {hasAnalysis ? `${cfg!.label}${curso.pct !== null ? ` (${curso.pct}%)` : ''}` : 'Sin análisis'}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, color: isDark ? text : '#181c1e',
                                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 8 }}>
                                    {curso.nombre}
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 10, color: muted }}>
                                      {curso.creditos != null ? `${curso.creditos} CRD` : ''}
                                    </span>
                                    {curso.codigo && (
                                      <span style={{ fontSize: 10, fontWeight: 700, background: isDark ? '#0f172a' : SURFACE_LOW,
                                        borderRadius: 4, padding: '2px 6px', color: text }}>
                                        {curso.codigo}
                                      </span>
                                    )}
                                  </div>
                                  {curso.tipoCurso === 'Electivo' && (
                                    <span style={{ display: 'inline-block', marginTop: 6, fontSize: 9, fontWeight: 800,
                                      color: '#7c2d12', background: '#ffedd5', borderRadius: 4, padding: '1px 5px' }}>
                                      Electivo
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>


              <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`,
                display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,45,114,0.1)',
                position: 'sticky', top: 12, maxHeight: 'calc(100vh - 120px)' }}>
                <div style={{ background: `linear-gradient(135deg, ${USIL}, #002d72)`, color: '#fff', padding: '14px 16px', flexShrink: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                    color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>
                    Curso seleccionado
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, marginBottom: 8, fontFamily: FONT_HEAD }}>
                    {selectedCurso?.nombre ?? '—'}
                  </div>
                  {selectedCurso?.estado && (
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 9px', borderRadius: 999,
                      background: `${EST[selectedCurso.estado].dot}35`,
                      border: `1px solid ${EST[selectedCurso.estado].dot}90`, color: '#fff' }}>
                      ESTADO: {EST[selectedCurso.estado].label.toUpperCase()}
                    </span>
                  )}
                  {selectedCurso && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {selectedCurso.codigo && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                          background: 'rgba(255,255,255,0.16)', color: '#fff' }}>
                          {selectedCurso.codigo}
                        </span>
                      )}
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                        background: selectedCurso.tipoCurso === 'Electivo' ? '#ffedd5' : 'rgba(255,255,255,0.16)',
                        color: selectedCurso.tipoCurso === 'Electivo' ? '#7c2d12' : '#fff' }}>
                        {selectedCurso.tipoCurso}
                      </span>
                      {selectedCurso.creditos !== null && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                          background: 'rgba(255,255,255,0.16)', color: '#fff' }}>
                          {selectedCurso.creditos} cr.
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {!selectedCurso ? (
                    <p style={{ fontSize: 12, color: muted, textAlign: 'center', marginTop: 40 }}>
                      Selecciona un curso en el mapa
                    </p>
                  ) : (
                    <>
                      {/* "¿Por qué CIE lo señala?": el backend no expone 4 puntajes independientes
                          (Mercado/Empleabilidad/Benchmark/Tendencias) como en el mockup, así que se
                          aproxima con los campos reales ya disponibles del curso (tendencias, gaps,
                          pct y estado), sin inventar cifras. */}
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 8 }}>
                          ¿Por qué CIE lo señala?
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                          <div style={{ padding: '8px 10px', borderRadius: 8, background: isDark ? '#0f172a' : SURFACE_LOW, border: `1px solid ${border}` }}>
                            <div style={{ fontSize: 10, color: muted, marginBottom: 3 }}>Tendencias detectadas</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: CYAN }}>
                              {selectedCurso.tendencias.length > 0 ? `${selectedCurso.tendencias.length} señales` : '—'}
                            </div>
                          </div>
                          <div style={{ padding: '8px 10px', borderRadius: 8, background: isDark ? '#0f172a' : SURFACE_LOW, border: `1px solid ${border}` }}>
                            <div style={{ fontSize: 10, color: muted, marginBottom: 3 }}>Brechas identificadas</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: selectedCurso.gaps.length > 0 ? ERROR : text }}>
                              {selectedCurso.gaps.length > 0 ? `${selectedCurso.gaps.length} brechas` : '—'}
                            </div>
                          </div>
                          <div style={{ padding: '8px 10px', borderRadius: 8, background: isDark ? '#0f172a' : SURFACE_LOW, border: `1px solid ${border}` }}>
                            <div style={{ fontSize: 10, color: muted, marginBottom: 3 }}>Alineación con mercado</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: text }}>
                              {selectedCurso.pct !== null ? `${selectedCurso.pct}%` : '—'}
                            </div>
                          </div>
                          <div style={{ padding: '8px 10px', borderRadius: 8, background: isDark ? '#0f172a' : SURFACE_LOW, border: `1px solid ${border}` }}>
                            <div style={{ fontSize: 10, color: muted, marginBottom: 3 }}>Estado de revisión</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: selectedCurso.estado ? EST[selectedCurso.estado].dot : text }}>
                              {selectedCurso.estado ? EST[selectedCurso.estado].label : '—'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {(selectedCurso.prerequisito || selectedCurso.mencion || selectedCurso.horasTeoria != null || selectedCurso.horasPractica != null || selectedCurso.horasLab != null) && (
                        <div style={{ background: isDark ? '#0f172a' : '#f8fafc',
                          border: `1px solid ${border}`, borderRadius: 8, padding: '10px 12px',
                          display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {selectedCurso.prerequisito && (
                            <div style={{ fontSize: 10, color: muted }}>
                              <strong style={{ color: text }}>Prerrequisito:</strong> {selectedCurso.prerequisito}
                            </div>
                          )}
                          {selectedCurso.mencion && (
                            <div style={{ fontSize: 10, color: muted }}>
                              <strong style={{ color: text }}>MenciÃ³n:</strong> {selectedCurso.mencion}
                            </div>
                          )}
                          {(selectedCurso.horasTeoria != null || selectedCurso.horasPractica != null || selectedCurso.horasLab != null) && (
                            <div style={{ fontSize: 10, color: muted }}>
                              <strong style={{ color: text }}>Horas:</strong> T {selectedCurso.horasTeoria ?? 0} / P {selectedCurso.horasPractica ?? 0} / L {selectedCurso.horasLab ?? 0}
                            </div>
                          )}
                        </div>
                      )}

                      {(selectedCursoSumilla?.sumilla || selectedCursoSumilla?.resultado_aprendizaje) && (
                        <div style={{ background: isDark ? '#0f172a' : '#f8fafc',
                          border: `1px solid ${border}`, borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', color: USIL, marginBottom: 7 }}>
                            Evidencia academica del curso
                          </div>
                          {selectedCursoSumilla?.sumilla && (
                            <p style={{ margin: '0 0 8px', fontSize: 11, color: text, lineHeight: 1.45 }}>
                              <strong>Sumilla:</strong> {compactText(selectedCursoSumilla.sumilla, 360)}
                            </p>
                          )}
                          {selectedCursoSumilla?.resultado_aprendizaje && (
                            <p style={{ margin: 0, fontSize: 11, color: text, lineHeight: 1.45 }}>
                              <strong>Resultado:</strong> {compactText(selectedCursoSumilla.resultado_aprendizaje, 260)}
                            </p>
                          )}
                        </div>
                      )}

                      {selectedCursoCompetencias.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px',
                            color: muted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>hub</span>
                            Competencias asociadas
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {selectedCursoCompetencias.slice(0, 6).map((comp, i) => (
                              <div key={`${comp.codigo}-${i}`} style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '8px 10px', background: isDark ? '#0f172a' : '#fff' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                                  <span style={{ fontSize: 10, fontWeight: 900, color: USIL }}>{comp.codigo}</span>
                                  <span style={{ fontSize: 10, fontWeight: 800, color: muted }}>Nivel {comp.nivel}</span>
                                </div>
                                <div style={{ fontSize: 11, color: text, fontWeight: 700, lineHeight: 1.35 }}>{comp.nombre}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedCurso.pct !== null && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: text }}>Alineación con el mercado</span>
                            <span style={{ fontSize: 15, fontWeight: 900, color: selectedCurso.estado ? EST[selectedCurso.estado].dot : muted }}>
                              {selectedCurso.pct}%
                            </span>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: isDark ? '#334155' : '#e2e8f0', overflow: 'hidden' }}>
                            <div style={{ width: `${selectedCurso.pct}%`, height: '100%', borderRadius: 4,
                              background: selectedCurso.estado ? EST[selectedCurso.estado].dot : muted,
                              transition: 'width .6s ease' }} />
                          </div>
                        </div>
                      )}

                      {selectedCurso.tendencias.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px',
                            color: muted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>trending_up</span>
                            Tendencias de Impacto
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {selectedCurso.tendencias.map((t, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: text }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                                {t}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedCurso.gaps.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px',
                            color: '#ef4444', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#ef4444' }}>warning</span>
                            Brechas Detectadas (Gaps)
                          </div>
                          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px' }}>
                            <ul style={{ margin: 0, paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {selectedCurso.gaps.map((g, i) => (
                                <li key={i} style={{ fontSize: 11, color: '#7f1d1d' }}>{g}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      {selectedCurso.recomendaciones.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px',
                            color: USIL, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4,
                            paddingTop: 8, borderTop: `1px solid ${border}` }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13, color: USIL }}>bolt</span>
                            Recomendaciones IA
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {selectedCurso.recomendaciones.map((r, i) => (
                              <div key={i} style={{ background: isDark ? '#1e293b' : '#f8fafc',
                                border: `1px solid ${border}`, borderRadius: 8, padding: '10px 12px' }}>
                                <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                                    background: IMP_COLOR[r.impacto]?.bg ?? '#f3f4f6', color: IMP_COLOR[r.impacto]?.text ?? '#374151' }}>
                                    Impacto: {r.impacto}
                                  </span>
                                  <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                                    background: URG_COLOR[r.urgencia]?.bg ?? '#f3f4f6', color: URG_COLOR[r.urgencia]?.text ?? '#374151' }}>
                                    Urgencia: {r.urgencia}
                                  </span>
                                </div>
                                <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: text, lineHeight: 1.4 }}>
                                  {r.texto}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {!selectedCurso.estado && selectedCurso.tendencias.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: muted, fontSize: 11 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 32, display: 'block', marginBottom: 6 }}>pending</span>
                          Aún no se ha ejecutado el análisis IA para este curso
                        </div>
                      )}

                      {selectedCurso.estado && selectedCurso.tendencias.length === 0 && selectedCurso.gaps.length === 0 && selectedCurso.recomendaciones.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: muted, fontSize: 11 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 32, display: 'block', marginBottom: 6 }}>check_circle</span>
                          Curso alineado sin brechas detectadas
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div style={{ padding: '10px 14px', borderTop: `1px solid ${border}`, flexShrink: 0 }}>
                  <button
                    onClick={() => switchTab('impacto')}
                    style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none',
                      background: USIL, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0,40,85,0.25)' }}>
                    Ver Impacto Curricular Completo
                  </button>
                </div>
              </div>
            </div>
          )}

          {hasStructuredVision && (
            <section style={{ background: card, borderRadius: 10, borderLeft: `4px solid ${USIL}`, padding: 20, boxShadow: '0 2px 8px rgba(0,45,114,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <span className="material-symbols-outlined" style={{ color: CYAN, fontSize: 20 }}>temp_preferences_custom</span>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: USIL, fontFamily: FONT_HEAD }}>Lectura Estratégica con IA</h2>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
                    {[
                      { icon: 'school', title: 'Perfil y competencias', body: `${vision360?.competencias.length ?? 0} competencias y ${sumillasCount} sumillas disponibles para cruce.` },
                      { icon: 'workspace_premium', title: 'Menciones', body: `${vision360?.menciones.length ?? 0} rutas con cursos asociados para certificaciones.` },
                      { icon: 'psychology', title: 'Prompt IA', body: 'Genera brechas, cursos afectados y acciones sin inventar data fuera de la BD.' },
                    ].map(item => (
                      <div key={item.title} style={{ display: 'flex', gap: 10 }}>
                        <span className="material-symbols-outlined" style={{ color: CYAN, fontSize: 18, marginTop: 2 }}>{item.icon}</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 900, color: text, marginBottom: 3 }}>{item.title}</div>
                          <div style={{ fontSize: 12, color: muted, lineHeight: 1.45 }}>{item.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={handleCopyPrompt}
                    style={{ height: 40, padding: '0 14px', borderRadius: 8, border: `1px solid ${border}`,
                      background: card, color: USIL, cursor: 'pointer', fontSize: 12, fontWeight: 800,
                      display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{promptCopied ? 'check' : 'content_copy'}</span>
                    {promptCopied ? 'Copiado' : 'Copiar prompt'}
                  </button>
                  <button onClick={() => switchTab('impacto')}
                    style={{ height: 40, padding: '0 18px', borderRadius: 8, border: 'none',
                      background: USIL, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 900,
                      display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(0,40,85,0.25)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>assignment_add</span>
                    Generar Plan de Acción
                  </button>
                </div>
              </div>
            </section>
          )}

          {vision360 && (vision360.menciones.length > 0 || vision360.electivos.length > 0 || vision360.competencias.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(280px, .9fr)', gap: 12 }}>
              <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: USIL, fontFamily: FONT_HEAD }}>Menciones y certificaciones</div>
                  <div style={{ fontSize: 11, color: muted }}>{vision360.menciones.length} menciones / {vision360.electivos.length} electivos</div>
                </div>
                <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                  {vision360.menciones.length === 0 ? (
                    <div style={{ fontSize: 12, color: muted }}>No hay menciones estructuradas para esta malla.</div>
                  ) : vision360.menciones.map(mencion => (
                    <div key={mencion.idMencion} style={{ border: `1px solid ${border}`, borderRadius: 8, overflow: 'hidden', background: isDark ? '#0f172a' : '#fff' }}>
                      <div style={{ padding: '9px 11px', background: '#eff6ff', borderBottom: `1px solid ${border}` }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: USIL, lineHeight: 1.35 }}>{mencion.nombre}</div>
                        <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>{mencion.cursos.length} cursos asociados</div>
                      </div>
                      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                        {mencion.cursos.map((curso, idx) => (
                          <div key={`${mencion.idMencion}-${idx}`} style={{ padding: '8px 11px', borderBottom: idx < mencion.cursos.length - 1 ? `1px solid ${border}` : 'none' }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: text, lineHeight: 1.35 }}>{curso.nombreCurso}</div>
                            <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>
                              {[curso.codigoCurso, curso.ciclo ? `Ciclo ${curso.ciclo}` : null, curso.condicion].filter(Boolean).join(' / ')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: USIL, fontFamily: FONT_HEAD }}>Competencias del programa</div>
                  <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>Tomadas desde la matriz académica del Excel.</div>
                </div>
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 330, overflowY: 'auto' }}>
                  {vision360.competencias.slice(0, 12).map(comp => (
                    <div key={comp.idCompetencia} style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '9px 11px', background: isDark ? '#0f172a' : '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 900, color: USIL }}>{comp.codigo}</div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: muted }}>{comp.niveles.length} niveles</div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: text, lineHeight: 1.35, marginTop: 4 }}>{comp.nombre}</div>
                      {comp.tipo && <div style={{ fontSize: 10, color: muted, marginTop: 3 }}>{comp.tipo}</div>}
                    </div>
                  ))}
                  {vision360.competencias.length === 0 && (
                    <div style={{ fontSize: 12, color: muted }}>No hay competencias estructuradas para esta malla.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>


      {showImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget && !importing) setShowImport(false); }}>
          <div style={{ background: card, borderRadius: 14, padding: '28px 32px', width: 560,
            maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', color: text, maxHeight: '85vh', overflowY: 'auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: USIL }}>
                Importar Mallas Curriculares
              </h2>
              {!importing && (
                <button onClick={() => setShowImport(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, fontSize: 22, lineHeight: 1 }}>
                  ×
                </button>
              )}
            </div>

            {!importPreview && !importResult && (
              <div style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${border}`,
                borderRadius: 8, padding: '12px 14px', marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: muted, marginBottom: 6 }}>
                  Columnas requeridas en el Excel
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['FACULTAD','CARRERA','VERSION_MALLA','ANIO_INICIO','ES_VIGENTE','CICLO','NOMBRE_CURSO','TIPO_CURSO','CREDITOS'].map(col => (
                    <span key={col} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: isDark ? '#1e293b' : '#e2e8f0', color: text }}>
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {!importFile && !previewing && !importResult && (
              <div
                style={{ border: `2px dashed ${border}`, borderRadius: 10, padding: '32px 20px',
                  textAlign: 'center', cursor: 'pointer', marginBottom: 16 }}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) handleFileSelect(f);
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 36, color: muted, display: 'block', marginBottom: 8 }}>
                  upload_file
                </span>
                <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 4 }}>
                  Arrastra tu archivo .xlsx aquí
                </div>
                <div style={{ fontSize: 11, color: muted }}>o haz clic para seleccionar</div>
              </div>
            )}

            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />

            {previewing && (
              <div style={{ textAlign: 'center', padding: '30px 0', color: muted }}>
                <span className="material-symbols-outlined"
                  style={{ fontSize: 32, display: 'block', marginBottom: 8, animation: 'spin 1.2s linear infinite' }}>
                  sync
                </span>
                Leyendo archivo…
              </div>
            )}

            {importError && (
              <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '12px 14px', marginBottom: 16, color: '#991b1b', fontSize: 12 }}>
                <strong>Error:</strong> {importError}
              </div>
            )}

            {importPreview && !importResult && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
                  {[
                    { label: 'Total filas',  value: importPreview.totalRows },
                    { label: 'Facultades',   value: importPreview.facultades },
                    { label: 'Carreras',     value: importPreview.carreras },
                  ].map(k => (
                    <div key={k.label} style={{ background: isDark ? '#0f172a' : '#f0f9ff',
                      border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: USIL }}>{k.value}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: muted }}>{k.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: muted, marginBottom: 8 }}>
                  Vista previa (primeras 5 filas)
                </div>
                <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${border}` }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: isDark ? '#0f172a' : '#f1f5f9' }}>
                        {['Facultad','Carrera','Versión','Ciclo','Curso'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: muted, borderBottom: `1px solid ${border}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.preview.map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                          <td style={{ padding: '7px 10px' }}>{row.facultad}</td>
                          <td style={{ padding: '7px 10px' }}>{row.carrera}</td>
                          <td style={{ padding: '7px 10px' }}>{row.version}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' }}>{row.ciclo}</td>
                          <td style={{ padding: '7px 10px' }}>{row.curso}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                  <button onClick={() => { setImportFile(null); setImportPreview(null); }}
                    style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${border}`,
                      background: 'transparent', color: text, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    Cambiar archivo
                  </button>
                  <button onClick={handleImport} disabled={importing}
                    style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none',
                      background: importing ? '#94a3b8' : USIL, color: '#fff',
                      fontWeight: 700, fontSize: 13, cursor: importing ? 'not-allowed' : 'pointer' }}>
                    {importing ? 'Importando…' : `Importar ${importPreview.totalRows} filas`}
                  </button>
                </div>
              </div>
            )}

            {importResult && (
              <div>
                <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10,
                  padding: '16px 20px', marginBottom: 16, textAlign: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#16a34a', display: 'block', marginBottom: 6 }}>
                    check_circle
                  </span>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#15803d' }}>Importación completada</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Importados', value: importResult.imported, color: '#22c55e' },
                    { label: 'Omitidos',   value: importResult.skipped,  color: '#f59e0b' },
                    { label: 'Total',      value: importResult.total,    color: USIL      },
                  ].map(k => (
                    <div key={k.label} style={{ background: isDark ? '#0f172a' : '#f8fafc',
                      border: `1px solid ${border}`, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: k.color }}>{k.value}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: muted }}>{k.label}</div>
                    </div>
                  ))}
                </div>
                {importResult.errors.length > 0 && (
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8,
                    padding: '12px 14px', marginBottom: 16, maxHeight: 120, overflowY: 'auto' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#9a3412', marginBottom: 6 }}>
                      Filas con error ({importResult.errors.length})
                    </div>
                    {importResult.errors.map((e, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#7c2d12', marginBottom: 3 }}>
                        Fila {e.fila}: {e.error}
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => setShowImport(false)}
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none',
                    background: USIL, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CurricularView;
