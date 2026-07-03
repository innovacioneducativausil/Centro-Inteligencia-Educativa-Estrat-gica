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

interface FiltrosData {
  facultades: { id_facultad: number; nombre_facultad: string }[];
  carreras:   { id_carrera: number; nombre_carrera: string; id_facultad: number; nombre_facultad: string }[];
}

const EST: Record<EstadoCurso, { bg: string; border: string; label: string; text: string; dot: string }> = {
  alineado:    { bg: '#dcfce7', border: '#22c55e', label: 'Alineado',       text: '#166534', dot: '#22c55e' },
  riesgo:      { bg: '#ffedd5', border: '#f97316', label: 'Riesgo Parcial', text: '#9a3412', dot: '#f97316' },
  critico:     { bg: '#fee2e2', border: '#ef4444', label: 'Obsolescente',   text: '#991b1b', dot: '#ef4444' },
  oportunidad: { bg: '#dbeafe', border: '#3b82f6', label: 'Oportunidad',    text: '#1d4ed8', dot: '#3b82f6' },
};

const USIL = '#002855';

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
const VALID_CURRICULAR_TABS: TabCurricular[] = ['mapa', 'silabos', 'benchmarking', 'impacto'];


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
  const [loading,      setLoading]     = useState(false);

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
  const canImport = userRole === 'admin' || userRole === 'analista';
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
            const preferida = d.carreras.find((c: FiltrosData['carreras'][number]) =>
              c.nombre_facultad === 'Arquitectura'
              && c.nombre_carrera === 'Arquitectura, Urbanismo y Territorio'
            );
            const primera = preferida ?? d.carreras[0];
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
          const vigente = rows.find((m: MallaOpcion) => m.es_vigente === 1) || rows[0];
          setSelMallaId(vigente?.id_malla ?? null);
        }
      })
      .catch(() => {});
  }, [selCarrera, selFacultad]);

  const fetchMalla = useCallback(async () => {
    if (!selMallaId) { setCiclos([]); setKpis(EMPTY_KPIS); setSelectedCurso(null); return; }
    setLoading(true);
    try {
      const [ciclosData, kpisData] = await Promise.all([
        fetch(`/api/curricular/mapa/${selMallaId}`,  { headers, credentials: 'include' }).then(r => r.json()),
        fetch(`/api/curricular/kpis/${selMallaId}`,  { headers, credentials: 'include' }).then(r => r.json()),
      ]);
      if (Array.isArray(ciclosData)) {
        setCiclos(ciclosData);
        const primero = ciclosData.flatMap((c: CicloData) => c.cursos).find((c: Curso) => c.estado !== null) ?? ciclosData[0]?.cursos[0] ?? null;
        setSelectedCurso(primero);
      }
      if (!kpisData.error) setKpis(kpisData);
    } catch {}
    setLoading(false);
  }, [selMallaId]);

  useEffect(() => { fetchMalla(); }, [fetchMalla]);

  const handleFacultadChange = (fac: string) => {
    setSelFacultad(fac);
    const carrerasDeFac = fac === 'Todas'
      ? filtros.carreras
      : filtros.carreras.filter(c => c.nombre_facultad === fac);
    const primera = carrerasDeFac[0];
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
                const primera = df.carreras[0];
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
    <div style={{ padding: '14px 20px', background: bg, minHeight: '100%', color: text, display: 'flex', flexDirection: 'column', gap: 12 }}>


      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px', borderRadius: 10,
        background: '#FFF7ED', border: '1.5px solid #FED7AA',
        boxShadow: '0 2px 8px rgba(251,146,60,0.12)',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#EA580C', flexShrink: 0 }}>
          construction
        </span>
        <div>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#C2410C', letterSpacing: '0.2px' }}>
            Módulo en construcción
          </span>
          <span style={{ fontSize: 11, color: '#9A3412', marginLeft: 8, fontWeight: 500 }}>
            Algunas funciones pueden estar incompletas o cambiar próximamente.
          </span>
        </div>
      </div>


      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {([
          { key: 'mapa',        label: 'Mapa Curricular',    icon: 'map' },
          { key: 'silabos',     label: 'Mapa Sílabos',       icon: 'menu_book' },
          { key: 'benchmarking',label: 'Benchmarking',        icon: 'compare' },
          { key: 'impacto',     label: 'Impacto Curricular',  icon: 'insights' },
        ] as { key: TabCurricular; label: string; icon: string }[]).map(t => {
          const active = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => switchTab(t.key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', borderRadius: 8, border: active ? 'none' : `1px solid ${border}`, cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all .15s',
                background: active ? USIL : card, color: active ? '#fff' : muted }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>


      {(activeTab === 'mapa' || activeTab === 'silabos') && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end',
          background: card, borderRadius: 12, border: `1px solid ${border}`, padding: '14px 18px' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Facultad
            </label>
            <select value={selFacultad} onChange={e => handleFacultadChange(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`,
                background: isDark ? '#0f172a' : '#f8fafc', color: text, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <option>Todas</option>
              {filtros.facultades.map(f => <option key={f.id_facultad}>{f.nombre_facultad}</option>)}
            </select>
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Carrera
            </label>
            <select value={selCarrera} onChange={e => handleCarreraChange(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`,
                background: isDark ? '#0f172a' : '#f8fafc', color: text, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <option>Todas</option>
              {carrerasFiltradas.map(c => <option key={c.id_carrera}>{c.nombre_carrera}</option>)}
            </select>
          </div>
          {activeTab === 'mapa' && mallaActual && (
            <button onClick={handleExportMapaExcel}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                height: 40, padding: '0 16px', borderRadius: 8, border: 'none',
                background: USIL, color: '#fff', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
              Exportar Excel
            </button>
          )}
        </div>
      )}


      {activeTab === 'benchmarking' && (
        <BenchmarkingView themeColors={C} userRole={userRole} />
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {[
              { label: 'En Riesgo / Crítico',     value: `${kpis.pctRiesgo}%`,       badge: `${kpis.criticos} cursos`,  note: 'Cursos con obsolescencia alta o riesgo.',     accent: '#ef4444', badgeBg: '#fee2e2', badgeText: '#991b1b' },
              { label: 'Alineación Actual',        value: `${kpis.pctAlineado}%`,     badge: `${kpis.totalCursos} total`, note: 'Cumple con competencias core actuales.',      accent: '#22c55e', badgeBg: '#dcfce7', badgeText: '#166534' },
              { label: 'Oportunidades Emergentes', value: String(kpis.oportunidades), badge: 'Nuevas tendencias',          note: 'Posibilidad de integrar micro-credenciales.', accent: '#3b82f6', badgeBg: '#dbeafe', badgeText: '#1d4ed8' },
              { label: 'Cursos Críticos',          value: String(kpis.criticos),      badge: 'Requieren revisión',         note: 'Alerta de desactualización inmediata.',       accent: '#f97316', badgeBg: '#ffedd5', badgeText: '#9a3412' },
            ].map((k, i) => (
              <div key={i} style={{ background: card, borderRadius: 10, padding: '14px 16px',
                borderLeft: `4px solid ${k.accent}`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 6 }}>
                  {k.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 30, fontWeight: 900, color: k.accent, lineHeight: 1 }}>{k.value}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                    background: k.badgeBg, color: k.badgeText }}>{k.badge}</span>
                </div>
                <div style={{ fontSize: 10, color: muted }}>{k.note}</div>
              </div>
            ))}
          </div>


          {selMallaId === null ? (
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: 40,
              textAlign: 'center', color: muted, fontSize: 13 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 8, opacity: 0.4 }}>school</span>
              Selecciona una carrera para ver el mapa de malla curricular
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 12, flex: 1, minHeight: 0 }}>


              <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`,
                padding: '14px 16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: USIL }}>Mapa de Malla por Ciclos</h2>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {Object.entries(EST).map(([key, val]) => (
                      <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: muted }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: val.dot, flexShrink: 0 }} />
                        {val.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1,
                  paddingBottom: 8, scrollbarWidth: 'thin', scrollbarColor: `${border} transparent` }}>
                  {ciclos.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: muted, fontSize: 12 }}>
                      {loading ? 'Cargando cursos…' : 'No hay cursos cargados en esta malla'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 10, minWidth: 'max-content' }}>
                      {ciclos.map(ciclo => (
                        <div key={ciclo.numero} style={{ width: 168, flexShrink: 0 }}>
                          <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 12, color: USIL,
                            background: '#eef2f6', borderRadius: 8, padding: '7px 4px', marginBottom: 8,
                            border: '1px solid #c7d2e0' }}>
                            {ciclo.label}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {ciclo.cursos.map(curso => {
                              const cfg   = curso.estado ? EST[curso.estado] : EST['alineado'];
                              const sel   = selectedCurso?.id === curso.id;
                              const hasAnalysis = curso.estado !== null;
                              return (
                                <div key={curso.id}
                                  onClick={() => setSelectedCurso(curso)}
                                  style={{
                                    background: hasAnalysis ? cfg.bg : (isDark ? '#334155' : '#f1f5f9'),
                                    border: `${sel ? 2 : 1}px solid ${hasAnalysis ? cfg.border : border}`,
                                    borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
                                    height: 80, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                    boxShadow: sel ? `0 0 0 2px ${USIL}` : '0 1px 3px rgba(0,0,0,0.08)',
                                    transition: 'box-shadow .15s',
                                    opacity: hasAnalysis ? 1 : 0.7,
                                  }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.3, color: '#1e293b',
                                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {curso.nombre}
                                  </span>
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {curso.tipoCurso === 'Electivo' && (
                                      <span style={{ fontSize: 9, fontWeight: 800,
                                        color: '#7c2d12', background: '#ffedd5', borderRadius: 4, padding: '1px 5px' }}>
                                        Electivo
                                      </span>
                                    )}
                                  <span style={{ fontSize: 9, fontWeight: 700,
                                    color: hasAnalysis ? cfg.text : muted,
                                    background: 'rgba(255,255,255,0.55)', borderRadius: 4, padding: '1px 5px', alignSelf: 'flex-start' }}>
                                    {hasAnalysis
                                      ? `${cfg.label}${curso.pct !== null ? ` (${curso.pct}%)` : ''}`
                                      : 'Sin análisis'}
                                  </span>
                                  </div>
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
                display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                <div style={{ background: USIL, color: '#fff', padding: '14px 16px', flexShrink: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px',
                    color: 'rgba(147,197,253,0.9)', marginBottom: 4 }}>
                    Curso Seleccionado
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3, marginBottom: 8 }}>
                    {selectedCurso?.nombre ?? '—'}
                  </div>
                  {selectedCurso?.estado && (
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 4,
                      background: `${EST[selectedCurso.estado].dot}30`,
                      border: `1px solid ${EST[selectedCurso.estado].dot}70`, color: '#fff' }}>
                      ESTADO: {EST[selectedCurso.estado].label.toUpperCase()}
                    </span>
                  )}
                  {selectedCurso && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {selectedCurso.codigo && (
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 4,
                          background: 'rgba(255,255,255,0.14)', color: '#fff' }}>
                          {selectedCurso.codigo}
                        </span>
                      )}
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 4,
                        background: selectedCurso.tipoCurso === 'Electivo' ? '#ffedd5' : 'rgba(255,255,255,0.14)',
                        color: selectedCurso.tipoCurso === 'Electivo' ? '#7c2d12' : '#fff' }}>
                        {selectedCurso.tipoCurso}
                      </span>
                      {selectedCurso.creditos !== null && (
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 4,
                          background: 'rgba(255,255,255,0.14)', color: '#fff' }}>
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
