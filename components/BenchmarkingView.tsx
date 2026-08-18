
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeColors } from '../types';
import { downloadExcel } from '../services/excelExport';
import { logActividad } from '../services/actividadService';

interface BenchmarkingViewProps {
  themeColors: ThemeColors;
  userRole?: string;
  //----------------reorg Gestion (Curricular)----------------
  // Restringe que pestañas de "tipo" se muestran: Curricular (publico) solo
  // usa los referentes (comparador de solo lectura); Gestion > Curricular
  // usa competencia_directa/competencia_internacional (gestion de fuentes).
  // Si no se pasa, se muestran todas (comportamiento previo).
  tiposDisponibles?: TipoBenchmark[];
}

type TipoBenchmark = 'competencia_directa' | 'referente_nacional' | 'competencia_internacional' | 'referente_internacional' | 'referente_tecnologico';

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
  total_candidatos?: number;
  cursos?: CursoBenchmark[];
}

interface CursoBenchmark {
  nombre_curso: string;
  ciclo: string | null;
  area_formacion: string | null;
  descripcion_curso: string | null;
  fuente_url: string | null;
  id_curso_usil_match?: number | null;
  match_confianza?: number | null;
  match_metodo?: string | null;
}

interface CursoUsil {
  id: number;
  nombre: string;
  codigo: string | null;
  ciclo: number;
  creditos: number | null;
  tipoCurso: string | null;
}

interface CicloUsil {
  label: string;
  numero: number;
  cursos: CursoUsil[];
}

interface MallaUsil {
  id_malla: number;
  nombre_version: string;
  anio_inicio: number | null;
  es_vigente: number;
  total_cursos: number;
}

interface Competencia {
  nombre_competencia: string;
  tipo_competencia: string;
  nombre_programa: string;
  nombre_universidad: string;
  pais: string;
}

interface FuenteCandidata {
  id_candidate: number;
  id_programa_benchmark: number;
  url: string;
  titulo: string | null;
  snippet: string | null;
  tipo_fuente_detectado: string;
  score_total: number;
  score_detalle_json: string | Record<string, number> | null;
  estado: 'candidato' | 'aprobado' | 'descartado' | 'duplicado' | 'no_oficial';
  motivo: string | null;
  buscado_en: string;
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

const USIL = '#001a48';
const CYAN = '#006876';
const CYAN_LIGHT = '#58e6ff';
const SURFACE_LOW = '#f1f4f7';
const OUTLINE_VARIANT = '#c4c6d2';
const FONT_HEAD = "'Manrope', 'Segoe UI', sans-serif";
const FONT_DATA = "'Inter', 'Segoe UI', sans-serif";
const ERROR_COLOR = '#ba1a1a';
const CARD_SHADOW = '0 4px 12px rgba(0,45,114,0.02)';

const TIPO_LABELS: Record<TipoBenchmark, string> = {
  competencia_directa:     'Competencia Directa',
  referente_nacional:      'Referentes Nacionales',
  competencia_internacional: 'Competencia Internacional',
  referente_internacional: 'Referentes Internacionales',
  referente_tecnologico:   'Referentes Tecnologicos',
};

const TIPOS_VISIBLES: TipoBenchmark[] = ['competencia_directa', 'referente_nacional', 'competencia_internacional', 'referente_internacional'];
const TIPOS_REFERENCIA: TipoBenchmark[] = ['referente_nacional', 'referente_internacional'];

const TIPO_DESCRIPCION: Record<TipoBenchmark, string> = {
  competencia_directa: 'Universidades nacionales con carreras equivalentes y fuentes curriculares oficiales.',
  referente_nacional: 'Universidades nacionales agregadas como referencia académica, no necesariamente competencia directa.',
  competencia_internacional: 'Universidades extranjeras con programas equivalentes para comparar estructura curricular.',
  referente_internacional: 'Referentes globales agregados por el equipo académico para observar estándares, enfoques o tendencias.',
  referente_tecnologico: 'Referentes tecnológicos heredados. Se migran a competencia internacional en la rebúsqueda.',
};

const ESTADO_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  pendiente:   { bg: '#fef9c3', text: '#854d0e', label: 'Pendiente' },
  procesado:   { bg: '#dbeafe', text: '#1d4ed8', label: 'Procesado' },
  error:       { bg: '#fee2e2', text: '#991b1b', label: 'Error' },
  verificado:  { bg: '#dcfce7', text: '#166534', label: 'Verificado' },
};

function sourceTipoForView(tipo: TipoBenchmark): TipoBenchmark {
  if (tipo === 'referente_nacional') return 'competencia_directa';
  if (tipo === 'referente_internacional') return 'competencia_internacional';
  return tipo;
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as any).error || `Error ${r.status}`);
  return data as T;
}

function isGenericInstitutionUrl(url?: string | null) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return !parsed.pathname || parsed.pathname === '/';
  } catch {
    return false;
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function distinctiveCareerTerms(careerName?: string) {
  const generic = new Set([
    'administracion', 'gestion', 'ciencias', 'ciencia', 'ingenieria', 'tecnologia',
    'negocios', 'empresarial', 'empresariales', 'internacional', 'internacionales',
    'comercial', 'educacion', 'humana', 'medica', 'carrera', 'pregrado', 'programa',
    'equivalente',
  ]);
  return normalizeText(careerName)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 4 && !generic.has(t));
}

function sourceHasConflictingCareerLabel(sourceText: string, careerName: string) {
  const selected = normalizeText(careerName);
  const haystack = normalizeText(sourceText);
  const selectedTerms = distinctiveCareerTerms(careerName);
  if (selectedTerms.some(term => haystack.includes(term))) return false;
  if (selected.includes('finanzas') && haystack.includes('economia')) return false;
  const groups: Array<[string, string[]]> = [
    ['psicologia', ['psicolog']],
    ['derecho', ['derecho']],
    ['arquitectura', ['arquitect']],
    ['economia', ['economia', 'economico']],
    ['comunicacion', ['comunicacion', 'communication']],
    ['ingenieria ambiental', ['ambiental']],
    ['ingenieria civil', ['civil']],
    ['ingenieria mecatronica', ['mecatron']],
    ['hospitalidad', ['turism', 'turistic', 'hotel', 'gastron', 'culinar']],
    ['medicina', ['medicina']],
    ['enfermeria', ['enfermer']],
    ['nutricion', ['nutric']],
  ];

  return groups.some(([careerKey, roots]) => {
    const sourceHasGroup = roots.some(root => haystack.includes(root));
    if (!sourceHasGroup) return false;
    const selectedHasGroup = roots.some(root => selected.includes(root)) || selected.includes(careerKey);
    return !selectedHasGroup;
  });
}

const BenchmarkingView: React.FC<BenchmarkingViewProps> = ({ themeColors, userRole, tiposDisponibles }) => {
  const isDark   = themeColors.bg?.includes('950') || themeColors.bg?.includes('slate-900') || false;
  const bg       = isDark ? '#0f172a' : SURFACE_LOW;
  const card     = isDark ? '#1e293b' : '#ffffff';
  const text     = isDark ? '#f1f5f9' : '#191c1e';
  const muted    = isDark ? '#94a3b8' : '#444651';
  const border   = isDark ? 'rgba(148,163,184,0.15)' : OUTLINE_VARIANT;
  const canEdit  = userRole === 'admin';
  const tiposVisibles = tiposDisponibles && tiposDisponibles.length ? tiposDisponibles : TIPOS_VISIBLES;

  const [tipo, setTipo]             = useState<TipoBenchmark>(tiposVisibles[0]);
  const [universidades, setUniversidades] = useState<Universidad[]>([]);
  const [programas, setProgramas]   = useState<Programa[]>([]);
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [carreras, setCarreras]     = useState<FiltroCarrera[]>([]);
  const [cobertura, setCobertura]   = useState<CoberturaCarrera[]>([]);
  const [selectedFacultadReferencia, setSelectedFacultadReferencia] = useState('');
  const [selectedCarrera, setSelectedCarrera] = useState<number | ''>('');
  const [selectedReferenciaUniversidad, setSelectedReferenciaUniversidad] = useState<number | ''>('');
  const [selectedPrograma, setSelectedPrograma] = useState<number | null>(null);
  const [mallaUsil, setMallaUsil] = useState<MallaUsil | null>(null);
  const [ciclosUsil, setCiclosUsil] = useState<CicloUsil[]>([]);
  const [selectedCicloComparador, setSelectedCicloComparador] = useState('todos');
  const [loadingMallaUsil, setLoadingMallaUsil] = useState(false);
  const [loadingUnivs, setLoadingUnivs] = useState(false);
  const [loadingProgs, setLoadingProgs] = useState(false);
  const [loadingComp, setLoadingComp]   = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});
  const [error, setError]           = useState<string | null>(null);
  const [notice, setNotice]         = useState<string | null>(null);
  const [programNotice, setProgramNotice] = useState<string | null>(null);
  const [programError, setProgramError] = useState<string | null>(null);
  const [seeding, setSeeding]       = useState(false);
  const [showAddUniv, setShowAddUniv] = useState(false);
  const [showAddProg, setShowAddProg] = useState(false);
  const [showManualText, setShowManualText] = useState<number | null>(null);
  const [manualText, setManualText]  = useState('');
  const [manualUrl, setManualUrl]    = useState('');
  const [newUniv, setNewUniv]        = useState({ nombre_universidad: '', pais: 'Peru', ciudad: '', sitio_web: '' });
  const [newProg, setNewProg]        = useState({ nombre_programa: '', url_programa: '', modalidad: '', duracion: '' });
  const [selectedUnivForProg, setSelectedUnivForProg] = useState<number | ''>('');
  const [showCandidatesFor, setShowCandidatesFor] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Record<number, FuenteCandidata[]>>({});

  useEffect(() => {
    apiFetch<{ carreras?: FiltroCarrera[] }>('/api/curricular/filtros')
      .then(d => { if (Array.isArray(d.carreras)) setCarreras(d.carreras); })
      .catch(e => setError(`No se pudieron cargar carreras: ${e.message}`));
    apiFetch<CoberturaCarrera[]>('/api/mercado-laboral/benchmarking/cobertura')
      .then(d => { if (Array.isArray(d)) setCobertura(d); })
      .catch(e => setError(`No se pudo cargar cobertura de benchmarking: ${e.message}`));
  }, []);

  const loadUniversidades = useCallback(() => {
    setLoadingUnivs(true);
    setError(null);
    apiFetch<Universidad[]>(`/api/mercado-laboral/benchmarking/universidades?tipo=${sourceTipoForView(tipo)}`)
      .then(setUniversidades)
      .catch(e => setError(e.message))
      .finally(() => setLoadingUnivs(false));
  }, [tipo]);

  useEffect(() => { loadUniversidades(); }, [loadUniversidades]);

  useEffect(() => {
    setSelectedReferenciaUniversidad('');
    setShowCandidatesFor(null);
    setProgramNotice(null);
    setProgramError(null);
    setSelectedCicloComparador('todos');
  }, [tipo, selectedCarrera]);

  useEffect(() => {
    setSelectedCicloComparador('todos');
  }, [selectedReferenciaUniversidad]);

  const loadProgramas = useCallback(() => {
    if (!selectedCarrera) { setProgramas([]); setCompetencias([]); return; }
    setLoadingProgs(true);
    apiFetch<{ programas: Programa[]; competencias: Competencia[] }>(
      `/api/mercado-laboral/benchmarking/comparar/${selectedCarrera}/${sourceTipoForView(tipo)}`
    )
      .then(d => { setProgramas(d.programas); setCompetencias(d.competencias); })
      .catch(e => setError(e.message))
      .finally(() => setLoadingProgs(false));
  }, [selectedCarrera, tipo]);

  useEffect(() => { loadProgramas(); }, [loadProgramas]);

  const handleScraping = async (idPrograma: number) => {
    setActionLoading(p => ({ ...p, [idPrograma]: 'scraping' }));
    setError(null);
    setProgramNotice(null);
    setProgramError(null);
    try {
      const result = await apiFetch<{ results?: Array<{ ok: boolean; cursosDetectados?: number; parser?: string; error?: string }> }>(
        '/api/mercado-laboral/benchmarking/scraping',
        {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [idPrograma] }),
        }
      );
      const first = result.results?.[0];
      if (first?.ok) {
        setProgramNotice(`Extracción completada: ${first.cursosDetectados ?? 0} cursos detectados${first.parser ? ` con ${first.parser}` : ''}. Requiere revisión académica antes de validar.`);
      } else if (first) {
        setProgramError(first.error || 'No se pudo completar la extracción de esta fuente.');
      }
      loadProgramas();
    } catch (e: any) {
      setProgramError(e.message);
    }
    setActionLoading(p => ({ ...p, [idPrograma]: '' }));
  };

  const handleMatchIA = async (idPrograma: number) => {
    setActionLoading(p => ({ ...p, [idPrograma]: 'match-ia' }));
    setProgramError(null);
    setProgramNotice(null);
    try {
      const result = await apiFetch<{ ok: boolean; coincidenciasEncontradas?: number; totalCursosExternos?: number; error?: string }>(
        `/api/mercado-laboral/benchmarking/programas/${idPrograma}/match-ia`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      setProgramNotice(`Análisis con IA completado: ${result.coincidenciasEncontradas ?? 0} de ${result.totalCursosExternos ?? 0} cursos tienen equivalente en la malla USIL. Revisa antes de usar como evidencia final.`);
      loadProgramas();
    } catch (e: any) {
      setProgramError(e.message || 'No se pudo completar el análisis con IA.');
    }
    setActionLoading(p => ({ ...p, [idPrograma]: '' }));
  };

  const handleScrapingBatch = async (idsAll: number[]) => {
    if (!idsAll.length) return;
    setActionLoading(p => ({ ...p, [-2]: 'scraping' }));
    setProgramError(null);
    setProgramNotice(null);
    let ok = 0;
    let fail = 0;
    let cursosTotal = 0;
    try {
      for (let i = 0; i < idsAll.length; i += 10) {
        const batch = idsAll.slice(i, i + 10);
        const result = await apiFetch<{ results?: Array<{ ok: boolean; cursosDetectados?: number }> }>(
          '/api/mercado-laboral/benchmarking/scraping',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: batch }),
          }
        );
        (result.results || []).forEach(r => {
          if (r.ok) { ok++; cursosTotal += r.cursosDetectados ?? 0; } else { fail++; }
        });
        setProgramNotice(`Re-extrayendo… ${Math.min(i + 10, idsAll.length)}/${idsAll.length} programas procesados.`);
      }
      setProgramNotice(`Re-extracción completada: ${ok} programas OK (${cursosTotal} cursos detectados en total), ${fail} con error. Revisa antes de validar.`);
      loadProgramas();
    } catch (e: any) {
      setProgramError(e.message);
    }
    setActionLoading(p => ({ ...p, [-2]: '' }));
  };

  const loadCandidates = async (idPrograma: number) => {
    try {
      setProgramError(null);
      const rows = await apiFetch<FuenteCandidata[]>(`/api/mercado-laboral/benchmarking/programas/${idPrograma}/candidatos`);
      setCandidates(prev => ({ ...prev, [idPrograma]: rows }));
      setShowCandidatesFor(idPrograma);
    } catch (e: any) {
      setProgramError(e.message);
    }
  };

  const handleDescubrirFuente = async (ids: number | number[]) => {
    const list = Array.isArray(ids) ? ids : [ids];
    const loadingKey = list.length === 1 ? list[0] : -1;
    setActionLoading(p => ({ ...p, [loadingKey]: 'discover' }));
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{ results: Array<{ ok: boolean }> }>('/api/mercado-laboral/benchmarking/descubrir-fuentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(list.length === 1 ? { id_programa: list[0] } : { ids: list }),
      });
      const found = result.results.filter(r => r.ok).length;
      setNotice(`Busqueda completada: ${found}/${result.results.length} programas con candidatos. Revisa y aprueba una fuente antes de extraer.`);
      loadProgramas();
      if (list.length === 1) await loadCandidates(list[0]);
    } catch (e: any) {
      setError(e.message);
    }
    setActionLoading(p => ({ ...p, [loadingKey]: '' }));
  };

  const handleAprobarCandidato = async (idPrograma: number, idCandidate: number) => {
    setActionLoading(p => ({ ...p, [idCandidate]: 'approve' }));
    setError(null);
    setProgramError(null);
    try {
      await apiFetch(`/api/mercado-laboral/benchmarking/candidatos/${idCandidate}/aprobar`, { method: 'POST' });
      setProgramNotice('Fuente elegida como principal. Ahora puedes extraer el texto oficial.');
      await loadCandidates(idPrograma);
      loadProgramas();
    } catch (e: any) {
      setProgramError(e.message);
    }
    setActionLoading(p => ({ ...p, [idCandidate]: '' }));
  };

  const handleDescartarCandidato = async (idPrograma: number, idCandidate: number) => {
    setActionLoading(p => ({ ...p, [idCandidate]: 'reject' }));
    setError(null);
    setProgramError(null);
    try {
      await apiFetch(`/api/mercado-laboral/benchmarking/candidatos/${idCandidate}/descartar`, { method: 'POST' });
      await loadCandidates(idPrograma);
    } catch (e: any) {
      setProgramError(e.message);
    }
    setActionLoading(p => ({ ...p, [idCandidate]: '' }));
  };

  const handleNormalizarIA = async (idPrograma: number) => {
    setActionLoading(p => ({ ...p, [idPrograma]: 'ia' }));
    setError(null);
    setProgramNotice(null);
    setProgramError(null);
    try {
      const result = await apiFetch<{ cursos?: number; competencias?: number; tecnologias?: number }>('/api/mercado-laboral/benchmarking/normalizar-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_programa: idPrograma }),
      });
      setProgramNotice(`Normalización completada: ${result.cursos ?? 0} cursos y ${result.competencias ?? 0} competencias estructuradas.`);
      await loadProgramas();
    } catch (e: any) {
      setProgramError(e.message);
    }
    setActionLoading(p => ({ ...p, [idPrograma]: '' }));
  };

  const handleCargarManual = async (idPrograma: number) => {
    if (!manualText.trim()) return;
    setActionLoading(p => ({ ...p, [idPrograma]: 'manual' }));
    setProgramError(null);
    try {
      await apiFetch('/api/mercado-laboral/benchmarking/scraping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_programa: idPrograma, texto_manual: manualText, url_origen: manualUrl }),
      });
      setShowManualText(null); setManualText(''); setManualUrl('');
      setProgramNotice('Fuente manual cargada. Puedes normalizarla para verla en Referentes.');
      loadProgramas();
    } catch (e: any) { setProgramError(e.message); }
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
      setNotice(`Rebúsqueda completada: ${result.carrerasMapeadas}/${result.carrerasLeidas} carreras, ${result.programasCreados} programas nuevos y ${result.fuentesCreadas} fuentes nuevas.`);
    } catch (e: any) { setError(e.message); }
    finally { setSeeding(false); }
  };

  const competenciasUnicas = [...new Set(competencias.map(c => c.nombre_competencia))];
  const universidadesConPrograma = [...new Set(programas.map(p => p.nombre_universidad))];
  const coverageRows = cobertura.length
    ? cobertura
    : carreras.map(c => ({ ...c, benchmarking: {} as CoberturaCarrera['benchmarking'] }));
  const carreraSeleccionada = coverageRows.find(c => c.id_carrera === selectedCarrera) || carreras.find(c => c.id_carrera === selectedCarrera);

  const handleExportProgramasExcel = async () => {
    const nombreCarrera = carreraSeleccionada?.nombre_carrera || 'Carrera';
    await downloadExcel(`Benchmarking_${nombreCarrera.replace(/\s+/g, '_')}`, [{
      name: 'Programas',
      columns: [
        { header: 'Universidad', key: 'universidad', width: 40 },
        { header: 'Tipo', key: 'tipo', width: 24 },
        { header: 'País', key: 'pais', width: 16 },
        { header: 'Programa', key: 'programa', width: 40 },
        { header: 'Modalidad', key: 'modalidad', width: 18 },
        { header: 'Duración', key: 'duracion', width: 16 },
        { header: 'Estado', key: 'estado', width: 16 },
        { header: 'URL', key: 'url', width: 60 },
      ],
      rows: programas.map(p => ({
        universidad: p.nombre_universidad,
        tipo: p.tipo_benchmark,
        pais: p.pais,
        programa: p.nombre_programa,
        modalidad: p.modalidad || '',
        duracion: p.duracion || '',
        estado: p.estado_extraccion,
        url: p.url_programa || '',
      })),
    }]);

    logActividad('descargar_informe', {
      modulo: 'benchmarking',
      elementoTipo: 'comparacion',
      elementoTitulo: nombreCarrera,
      metadata: { formato: 'xlsx', carrera: nombreCarrera, total: programas.length },
    });
  };
  const coberturaTipoTotal = coverageRows.reduce((acc, c) => acc + (c.benchmarking?.[tipo]?.total_programas ?? 0), 0);
  const selectedCareerName = carreraSeleccionada?.nombre_carrera || '';
  const isReferenceView = TIPOS_REFERENCIA.includes(tipo);
  //----------------reorg Gestion (Curricular)----------------
  // La gestion de fuentes (Competencia Directa/Internacional) vive en
  // Gestion > Curricular; esta vista de referencia solo compara mallas.
  const fuenteGestionLabel = `Gestión > Curricular > Benchmarking (${tipo === 'referente_nacional' ? 'Competencia Directa' : 'Competencia Internacional'})`;
  const noticeIsOperational = notice
    ? /^(Extracción completada|Normalización completada|Fuente aprobada|Fuente manual)/.test(notice)
    : false;
  const facultadesReferencia = [...new Set(carreras.map(c => c.nombre_facultad).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  const carrerasReferencia = selectedFacultadReferencia
    ? carreras.filter(c => c.nombre_facultad === selectedFacultadReferencia)
    : [];
  const hasUsableSource = (p: Programa) => {
    if ((p.total_fuentes ?? 0) <= 0) return false;
    if (!p.url_programa || isGenericInstitutionUrl(p.url_programa)) return false;
    if (sourceHasConflictingCareerLabel(`${p.url_programa} ${p.nombre_programa}`, selectedCareerName || p.nombre_programa)) return false;
    return true;
  };
  const programasVisibles = programas.filter(p => hasUsableSource(p));
  const hasExtractedCurriculum = (p: Programa) => {
    if (!hasUsableSource(p)) return false;
    return (p.total_cursos ?? 0) > 0;
  };
  const programasComparables = isReferenceView
    ? programas.filter(p => hasExtractedCurriculum(p))
    : programasVisibles;
  const referenciaUniversidades = useMemo(() => {
    const byId = new Map<number, { id: number; nombre: string; pais: string; programas: number; cursos: number }>();
    programasComparables.forEach(p => {
      if (!p.id_universidad_benchmark) return;
      const current = byId.get(p.id_universidad_benchmark);
      byId.set(p.id_universidad_benchmark, {
        id: p.id_universidad_benchmark,
        nombre: p.nombre_universidad,
        pais: p.pais,
        programas: (current?.programas ?? 0) + 1,
        cursos: (current?.cursos ?? 0) + (p.total_cursos ?? 0),
      });
    });
    return Array.from(byId.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [programasComparables]);
  const referenciaUniversidadesKey = referenciaUniversidades.map(u => u.id).join('|');
  const programasReferencia = programasComparables.filter(p =>
    !selectedReferenciaUniversidad || p.id_universidad_benchmark === selectedReferenciaUniversidad
  );

  useEffect(() => {
    if (!selectedReferenciaUniversidad) return;
    const selectedId = String(selectedReferenciaUniversidad);
    if (!referenciaUniversidadesKey.split('|').includes(selectedId)) {
      setSelectedReferenciaUniversidad('');
    }
  }, [selectedReferenciaUniversidad, referenciaUniversidadesKey]);

  useEffect(() => {
    if (!isReferenceView || selectedFacultadReferencia || !carreraSeleccionada?.nombre_facultad) return;
    setSelectedFacultadReferencia(carreraSeleccionada.nombre_facultad);
  }, [isReferenceView, selectedFacultadReferencia, carreraSeleccionada?.nombre_facultad]);

  useEffect(() => {
    if (!isReferenceView || !carreraSeleccionada?.nombre_carrera) {
      setMallaUsil(null);
      setCiclosUsil([]);
      return;
    }

    let cancelled = false;
    const loadMallaUsil = async () => {
      setLoadingMallaUsil(true);
      try {
        const params = new URLSearchParams({ carrera: carreraSeleccionada.nombre_carrera });
        if (carreraSeleccionada.nombre_facultad) params.set('facultad', carreraSeleccionada.nombre_facultad);
        const mallasData = await apiFetch<MallaUsil[]>(`/api/curricular/mallas?${params.toString()}`);
        const vigente = Array.isArray(mallasData)
          ? (mallasData.find(m => m.es_vigente === 1) || mallasData[0])
          : null;
        if (!vigente) {
          if (!cancelled) {
            setMallaUsil(null);
            setCiclosUsil([]);
          }
          return;
        }
        const ciclosData = await apiFetch<CicloUsil[]>(`/api/curricular/mapa/${vigente.id_malla}`);
        if (!cancelled) {
          setMallaUsil(vigente);
          setCiclosUsil(Array.isArray(ciclosData) ? ciclosData : []);
        }
      } catch {
        if (!cancelled) {
          setMallaUsil(null);
          setCiclosUsil([]);
        }
      } finally {
        if (!cancelled) setLoadingMallaUsil(false);
      }
    };

    loadMallaUsil();
    return () => { cancelled = true; };
  }, [isReferenceView, carreraSeleccionada?.nombre_carrera, carreraSeleccionada?.nombre_facultad]);

  const cursosUsil = ciclosUsil.flatMap(ciclo =>
    ciclo.cursos.map(curso => ({
      id: curso.id,
      ciclo: String(ciclo.numero),
      nombre: curso.nombre,
      meta: [curso.codigo, curso.creditos != null ? `${curso.creditos} cr.` : null].filter(Boolean).join(' - '),
    }))
  );

  const groupCoursesByCycle = <T extends { ciclo?: string | number | null; nombre: string }>(courses: T[]) => {
    const map = new Map<string, Array<T>>();
    courses.forEach(course => {
      const cycle = course.ciclo ? String(course.ciclo) : 'S/C';
      const list = map.get(cycle) || [];
      list.push({ ...course, nombre: cleanCourseName(course.nombre) });
      map.set(cycle, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b, 'es');
    });
  };

  const cleanCourseName = (name: string) => {
    const cleaned = String(name || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\bdiv[_-]ngcontent\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || 'Curso sin nombre';
  };

  const courseKey = (name: string) => normalizeText(name).replace(/[^a-z0-9]/g, '');

  const getAvailableCycles = (courses: Array<{ ciclo?: string | number | null }>) => {
    const cycles = new Set<string>();
    courses.forEach(course => {
      if (course.ciclo === null || course.ciclo === undefined || course.ciclo === '') return;
      cycles.add(String(course.ciclo));
    });
    return Array.from(cycles).sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b, 'es');
    });
  };

  const filterCoursesByCycle = <T extends { ciclo?: string | number | null }>(courses: T[], cycle: string) => {
    if (cycle === 'todos') return courses;
    return courses.filter(course => String(course.ciclo || '') === cycle);
  };

  const renderMallaBoard = <T extends { ciclo?: string | number | null; nombre: string; meta?: string | null; matchConfianza?: number | null }>(
    title: string,
    subtitle: string,
    courses: T[],
    accent: string,
    matchKeys?: Set<string>,
    getKey?: (course: T) => string
  ) => {
    const resolveKey = getKey || ((course: T) => courseKey(course.nombre));
    const grouped = groupCoursesByCycle(courses);
    const MATCH_GREEN = '#16a34a';
    return (
      <div style={{ border: `1px solid ${border}`, borderRadius: 8, overflow: 'hidden', background: card,
        display: 'flex', flexDirection: 'column', minWidth: 0, boxShadow: CARD_SHADOW }}>
        <div style={{ padding: '10px 12px', background: accent, color: '#fff',
          borderBottom: `1px solid ${border}`, flex: '0 0 auto' }}>
          <div style={{ fontWeight: 700, fontSize: 12, fontFamily: FONT_HEAD }}>{title}</div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 2 }}>{subtitle}</div>
        </div>
        {grouped.length === 0 ? (
          <div style={{ padding: 16, color: muted, fontSize: 12 }}>No hay cursos cargados para esta malla.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 8, padding: 10, background: isDark ? '#0f172a' : SURFACE_LOW }}>
            {grouped.map(([cycle, items]) => (
              <div key={`${title}-${cycle}`} style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, borderBottom: `1px solid ${border}`,
                  paddingBottom: 4, marginBottom: 6, flex: '0 0 auto' }}>
                  <span style={{ fontWeight: 700, fontSize: 11, color: accent, fontFamily: FONT_HEAD }}>Ciclo {cycle}</span>
                  <span style={{ color: muted, fontSize: 9 }}>({items.length})</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map((course, idx) => {
                    const key = resolveKey(course);
                    const isMatched = matchKeys ? matchKeys.has(key) : false;
                    const barColor = matchKeys ? (isMatched ? MATCH_GREEN : accent) : 'transparent';
                    return (
                      <div key={`${cycle}-${course.nombre}-${idx}`}
                        style={{ position: 'relative', padding: '7px 8px 7px 12px', borderRadius: 6,
                          border: `1px solid ${border}`, background: isDark ? '#1e293b' : '#fff', overflow: 'hidden' }}>
                        {matchKeys && (
                          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: barColor }} />
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                          <div style={{ fontWeight: 700, fontSize: 10.5, lineHeight: 1.25 }}>{course.nombre}</div>
                          {matchKeys && (
                            <span className="material-symbols-outlined"
                              style={{ fontSize: 14, color: isMatched ? MATCH_GREEN : accent, flex: '0 0 auto' }}
                              title={isMatched
                                ? (course.matchConfianza != null ? `Equivalente (confianza IA: ${course.matchConfianza}%)` : 'Coincide con la otra malla')
                                : 'Sin coincidencia'}>
                              {isMatched ? 'check_circle' : 'add_circle'}
                            </span>
                          )}
                        </div>
                        {course.meta && <div style={{ color: muted, fontSize: 9, marginTop: 2 }}>{course.meta}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!canEdit) {
    return (
      <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: 24, color: text, fontFamily: FONT_DATA, boxShadow: CARD_SHADOW }}>
        <div style={{ fontWeight: 700, color: USIL, marginBottom: 6, fontFamily: FONT_HEAD, fontSize: 18 }}>Benchmarking curricular</div>
        <div style={{ color: muted, fontSize: 13 }}>
          Este módulo es de uso administrativo. Las fuentes, comparaciones y propuestas curriculares requieren curaduría y validación antes de mostrarse al resto de usuarios.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 0, color: text, fontFamily: FONT_DATA }}>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {tiposVisibles.map(t => (
          <button key={t} onClick={() => setTipo(t)}
            style={{
              padding: '8px 18px', borderRadius: 999, border: `1px solid ${tipo === t ? USIL : border}`, cursor: 'pointer',
              fontWeight: 700, fontSize: 12, fontFamily: FONT_DATA,
              background: tipo === t ? USIL : card,
              color: tipo === t ? '#fff' : text,
            }}>
            {TIPO_LABELS[t]}
          </button>
        ))}
        {canEdit && ['competencia_directa', 'competencia_internacional'].includes(tipo) && (
          <button onClick={handleSeedInicial} disabled={seeding}
            style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, border: `1px solid ${border}`,
              background: card, color: seeding ? muted : USIL, fontWeight: 700, fontSize: 12, fontFamily: FONT_DATA,
              cursor: seeding ? 'not-allowed' : 'pointer' }}>
            {seeding ? 'Rebuscando...' : 'Rebuscar fuentes'}
          </button>
        )}
      </div>

      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 12, boxShadow: CARD_SHADOW }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: USIL, fontFamily: FONT_HEAD }}>{TIPO_LABELS[tipo]}</div>
        <div style={{ fontSize: 11, color: muted, marginTop: 3 }}>
          {TIPO_DESCRIPCION[tipo]}
          {!isReferenceView && <> Total configurado en esta vista: <strong>{coberturaTipoTotal}</strong> programas.</>}
        </div>
      </div>

      {error && (
        <div style={{ background: '#ffdad6', border: `1px solid ${ERROR_COLOR}`, borderRadius: 8,
          padding: '10px 14px', marginBottom: 12, color: '#93000a', fontSize: 12 }}>
          {error}
        </div>
      )}

      {notice && !(isReferenceView && noticeIsOperational) && (
        <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 8,
          padding: '10px 14px', marginBottom: 12, color: '#166534', fontSize: 12, fontWeight: 700 }}>
          {notice}
        </div>
      )}

      {isReferenceView && (
        <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: '14px 16px', marginBottom: 12, boxShadow: CARD_SHADOW }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: USIL, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, fontFamily: FONT_DATA }}>
            Filtros de comparación de malla
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(260px, 1.2fr) minmax(240px, 1fr)', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
                Facultad
              </label>
              <select value={selectedFacultadReferencia}
                onChange={e => {
                  setSelectedFacultadReferencia(e.target.value);
                  setSelectedCarrera('');
                  setSelectedReferenciaUniversidad('');
                }}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${border}`,
                  background: isDark ? '#0f172a' : SURFACE_LOW, color: text, fontSize: 12, fontFamily: FONT_DATA }}>
                <option value="">- Selecciona facultad -</option>
                {facultadesReferencia.map(facultad => (
                  <option key={facultad} value={facultad}>{facultad}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
                Carrera USIL
              </label>
              <select value={selectedCarrera}
                onChange={e => setSelectedCarrera(e.target.value ? Number(e.target.value) : '')}
                disabled={!selectedFacultadReferencia}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${border}`,
                  background: isDark ? '#0f172a' : SURFACE_LOW, color: !selectedFacultadReferencia ? muted : text, fontSize: 12, fontFamily: FONT_DATA }}>
                <option value="">
                  {selectedFacultadReferencia ? '- Selecciona carrera -' : 'Primero selecciona facultad'}
                </option>
                {carrerasReferencia.map(c => (
                  <option key={c.id_carrera} value={c.id_carrera}>
                    {c.nombre_carrera}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
                Universidad con malla extraída
              </label>
              <select value={selectedReferenciaUniversidad}
                onChange={e => setSelectedReferenciaUniversidad(e.target.value ? Number(e.target.value) : '')}
                disabled={!selectedCarrera || loadingProgs || referenciaUniversidades.length === 0}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${border}`,
                  background: isDark ? '#0f172a' : SURFACE_LOW, color: !selectedCarrera || referenciaUniversidades.length === 0 ? muted : text, fontSize: 12, fontFamily: FONT_DATA }}>
                <option value="">
                  {!selectedCarrera
                    ? 'Primero selecciona una carrera'
                    : loadingProgs
                      ? 'Cargando universidades...'
                      : referenciaUniversidades.length === 0
                        ? 'Sin universidades con malla extraída para esta carrera'
                        : '- Selecciona universidad -'}
                </option>
                {referenciaUniversidades.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} ({u.pais}) - {u.cursos} curso{u.cursos === 1 ? '' : 's'} extraído{u.cursos === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {selectedCarrera && !loadingProgs && referenciaUniversidades.length === 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: '#854d0e', lineHeight: 1.4 }}>
              No hay mallas extraídas para esta carrera. Primero extrae y normaliza una fuente curricular desde {fuenteGestionLabel}.
            </div>
          )}
        </div>
      )}

      {!isReferenceView && coverageRows.length > 0 && (
        <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, overflow: 'hidden', marginBottom: 12, boxShadow: CARD_SHADOW }}>
          <div style={{ background: isDark ? '#1e293b' : SURFACE_LOW, padding: '10px 16px',
            borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: USIL, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: FONT_DATA }}>
              Cobertura de {TIPO_LABELS[tipo].toLowerCase()} por carrera
            </span>
            <span style={{ fontSize: 10, color: muted }}>
              Selecciona una carrera para ver programas y fuentes
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr style={{ background: isDark ? '#0f172a' : SURFACE_LOW }}>
                  {['Facultad', 'Carrera', TIPO_LABELS[tipo], 'Fuentes', 'Validadas', 'Pendientes', 'Última revisión'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                      color: muted, borderBottom: `1px solid ${border}`, whiteSpace: 'nowrap', fontSize: 10 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coverageRows.map((c, idx) => {
                  const tipos = c.benchmarking || {};
                  const total = (t: TipoBenchmark, key: 'total_programas' | 'fuentes_validadas' | 'fuentes_pendientes') => tipos[t]?.[key] ?? 0;
                  const datosTipo = tipos[tipo];
                  const validadas = datosTipo?.fuentes_validadas ?? 0;
                  const pendientes = datosTipo?.fuentes_pendientes ?? 0;
                  const isSelected = selectedCarrera === c.id_carrera;
                  return (
                    <tr key={c.id_carrera} onClick={() => setSelectedCarrera(c.id_carrera)}
                      style={{ borderBottom: `1px solid ${border}`, cursor: 'pointer',
                        background: isSelected ? (isDark ? 'rgba(88,230,255,0.08)' : '#eaf6f8') : (idx % 2 === 1 ? (isDark ? 'transparent' : SURFACE_LOW) : 'transparent') }}>
                      <td style={{ padding: '8px 10px', color: muted }}>{c.nombre_facultad}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700 }}>{c.nombre_carrera}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: USIL, fontFamily: FONT_HEAD }}>{total(tipo, 'total_programas')}</td>
                      <td style={{ padding: '8px 10px' }}>{datosTipo?.total_fuentes ?? 0}</td>
                      <td style={{ padding: '8px 10px', color: '#166534', fontWeight: 700 }}>{validadas}</td>
                      <td style={{ padding: '8px 10px', color: '#854d0e', fontWeight: 700 }}>{pendientes}</td>
                      <td style={{ padding: '8px 10px', color: muted }}>
                        {datosTipo?.ultima_revision ? new Date(datosTipo.ultima_revision).toLocaleDateString('es-PE') : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, alignItems: 'start' }}>


        <div style={{ display: 'none' }}>
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
                <div style={{ color: muted, fontSize: 10, marginTop: 2 }}>{u.pais}{u.ciudad ? ` - ${u.ciudad}` : ''}</div>
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


        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {selectedCarrera && !isReferenceView && (
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: '12px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, boxShadow: CARD_SHADOW }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Carrera seleccionada
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: text, marginTop: 2, fontFamily: FONT_HEAD }}>
                  {carreraSeleccionada?.nombre_carrera || 'Carrera seleccionada'}
                  {carreraSeleccionada?.nombre_facultad ? ` (${carreraSeleccionada.nombre_facultad})` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {programas.length > 0 && (
                  <button onClick={handleExportProgramasExcel}
                    style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${border}`,
                      background: card, color: USIL, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>download</span>
                    Exportar Excel
                  </button>
                )}
                {canEdit && (
                  <>
                    {programas.length > 0 && (
                      <button onClick={() => handleDescubrirFuente(programas.map(p => p.id_programa_benchmark).slice(0, 10))}
                        disabled={!!actionLoading[-1]}
                        style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${border}`,
                          background: card, color: actionLoading[-1] ? muted : USIL, fontWeight: 700, fontSize: 12,
                          cursor: actionLoading[-1] ? 'not-allowed' : 'pointer' }}>
                        {actionLoading[-1] ? 'Buscando...' : 'Buscar fuentes de la carrera'}
                      </button>
                    )}
                    {programasVisibles.length > 0 && (
                      <button onClick={() => handleScrapingBatch(programasVisibles.map(p => p.id_programa_benchmark))}
                        disabled={!!actionLoading[-2]}
                        title="Vuelve a extraer todos los programas de esta carrera que ya tienen fuente aprobada — útil para refrescar con una versión corregida del extractor"
                        style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${border}`,
                          background: card, color: actionLoading[-2] ? muted : USIL, fontWeight: 700, fontSize: 12,
                          cursor: actionLoading[-2] ? 'not-allowed' : 'pointer' }}>
                        {actionLoading[-2] ? 'Re-extrayendo...' : `Re-extraer todos (${programasVisibles.length})`}
                      </button>
                    )}
                    <button onClick={() => setShowAddProg(true)}
                      style={{ padding: '8px 14px', borderRadius: 8, border: 'none',
                        background: USIL, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      + Agregar programa
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {selectedCarrera && !isReferenceView && (
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: '12px 16px', boxShadow: CARD_SHADOW }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: USIL, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Flujo de comparación curricular
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(140px, 1fr))', gap: 8 }}>
                {[
                  ['1', 'Fuente oficial', 'Registrar link exacto de malla, perfil, plan o competencias.'],
                  ['2', 'Extracción', 'Usar extracción automática solo si la URL es específica; si falla, pegar fuente.'],
                  ['3', 'Normalización IA', 'Detectar cursos, competencias, tecnologías y evidencias sin marcarlas como validadas.'],
                  ['4', 'Comparación', 'Cruzar lo extraído contra malla y sílabos de la carrera seleccionada.'],
                  ['5', 'Propuesta', 'Generar brecha y propuesta curricular para revisión humana, nunca aplicar automático.'],
                ].map(([n, title, desc]) => (
                  <div key={n} style={{ border: `1px solid ${border}`, borderRadius: 8, padding: 10, background: isDark ? '#0f172a' : SURFACE_LOW }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: CYAN }}>Paso {n}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: text, marginTop: 3, fontFamily: FONT_HEAD }}>{title}</div>
                    <div style={{ fontSize: 10, color: muted, marginTop: 4, lineHeight: 1.35 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}


          {programError && selectedCarrera && !isReferenceView && (
            <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8,
              padding: '10px 14px', marginBottom: -4, color: '#991b1b', fontSize: 12, fontWeight: 700 }}>
              {programError}
            </div>
          )}
          {programNotice && selectedCarrera && !isReferenceView && (
            <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 8,
              padding: '10px 14px', marginBottom: -4, color: '#166534', fontSize: 12, fontWeight: 700 }}>
              {programNotice}
            </div>
          )}
          {selectedCarrera && !isReferenceView && (
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, overflow: 'hidden', boxShadow: CARD_SHADOW }}>
              <div style={{ background: isDark ? '#1e293b' : SURFACE_LOW, padding: '10px 16px',
                borderBottom: `1px solid ${border}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: USIL, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {TIPO_LABELS[tipo]} configurada para la carrera ({programasVisibles.length})
                </span>
                {loadingProgs && <span style={{ fontSize: 10, color: muted }}>Cargando...</span>}
              </div>

              {programasVisibles.length === 0 && !loadingProgs ? (
                <div style={{ padding: 24, textAlign: 'center', color: muted, fontSize: 12 }}>
                  No hay fuentes exactas ni candidatos útiles para esta carrera y tipo. Usa Buscar fuentes de la carrera o agrega una fuente oficial.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: isDark ? '#0f172a' : SURFACE_LOW }}>
                        {['Universidad', 'Pais', 'Programa', 'Estado', 'Fuentes', 'Cursos', 'Competencias', 'Captura', 'Acciones'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10,
                            color: muted, borderBottom: `1px solid ${border}`, whiteSpace: 'nowrap' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {programasVisibles.map((p, idx) => {
                        const est = ESTADO_BADGE[p.estado_extraccion] ?? ESTADO_BADGE.pendiente;
                        const isBusy = !!actionLoading[p.id_programa_benchmark];
                        const hasExactSource = hasUsableSource(p);
                        return (
                          <tr key={p.id_programa_benchmark} style={{ borderBottom: `1px solid ${border}`, background: idx % 2 === 1 ? (isDark ? 'transparent' : SURFACE_LOW) : 'transparent' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{p.nombre_universidad}</td>
                            <td style={{ padding: '8px 10px', color: muted }}>{p.pais}</td>
                            <td style={{ padding: '8px 10px', maxWidth: 180 }}>
                              <div style={{ fontWeight: 600 }}>{p.nombre_programa}</div>
                              {hasExactSource ? (
                                <a href={p.url_programa} target="_blank" rel="noreferrer"
                                  style={{ color: CYAN, fontSize: 10, textDecoration: 'none' }}>
                                  Ver fuente
                                </a>
                              ) : (
                                <div style={{ color: '#854d0e', fontSize: 10, marginTop: 2 }}>
                                  Fuente exacta pendiente
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px',
                                borderRadius: 4, background: est.bg, color: est.text }}>
                                {est.label}
                              </span>
                              {p.observaciones && (
                                <div style={{ fontSize: 9, color: p.estado_extraccion === 'error' ? '#991b1b' : muted,
                                  marginTop: 2, maxWidth: 260, lineHeight: 1.25, wordBreak: 'break-word' }}
                                  title={p.observaciones}>
                                  {p.observaciones.substring(0, 120)}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '8px 10px', fontSize: 10, whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 800, color: hasExactSource ? USIL : muted }}>
                                {hasExactSource ? `${p.total_fuentes ?? 0} links` : 'sin fuente exacta'}
                              </div>
                              <div style={{ color: '#166534' }}>{p.fuentes_validadas ?? 0} validadas</div>
                              <div style={{ color: '#854d0e' }}>{p.total_candidatos ?? 0} candidatos</div>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: USIL }}>
                              {p.total_cursos ?? 0}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: USIL }}>
                              {p.total_competencias ?? 0}
                            </td>
                            <td style={{ padding: '8px 10px', color: muted, fontSize: 10 }}>
                              {p.fecha_captura ? new Date(p.fecha_captura).toLocaleDateString('es-PE') : '-'}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              {canEdit && (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  <button
                                    onClick={() => handleDescubrirFuente(p.id_programa_benchmark)}
                                    disabled={isBusy}
                                    title="Buscar automaticamente una pagina oficial especifica de esta carrera"
                                    style={{ padding: '3px 7px', borderRadius: 4, border: `1px solid ${border}`,
                                      background: 'transparent', color: text, fontWeight: 700, fontSize: 9,
                                      cursor: isBusy ? 'not-allowed' : 'pointer' }}>
                                    {actionLoading[p.id_programa_benchmark] === 'discover' ? '...' : 'Buscar fuente'}
                                  </button>
                                  <button
                                    onClick={() => loadCandidates(p.id_programa_benchmark)}
                                    title="Ver candidatos encontrados y aprobar fuente"
                                    style={{ padding: '3px 7px', borderRadius: 4, border: `1px solid ${border}`,
                                      background: showCandidatesFor === p.id_programa_benchmark ? '#eff6ff' : 'transparent',
                                      color: text, fontWeight: 700, fontSize: 9, cursor: 'pointer' }}>
                                    Candidatos
                                  </button>
                                  <button
                                    onClick={() => handleScraping(p.id_programa_benchmark)}
                                    disabled={isBusy || !hasExactSource}
                                    title="Extraer texto, guardar snapshot y detectar cursos de la malla externa"
                                    style={{ padding: '3px 7px', borderRadius: 4, border: 'none',
                                      background: isBusy || !hasExactSource ? '#94a3b8' : USIL,
                                      color: '#fff', fontWeight: 700, fontSize: 9, cursor: isBusy || !hasExactSource ? 'not-allowed' : 'pointer' }}>
                                    {actionLoading[p.id_programa_benchmark] === 'scraping' ? '...' : 'Extraer'}
                                  </button>
                                  <button
                                    onClick={() => { setShowManualText(p.id_programa_benchmark); setManualUrl(p.url_programa ?? ''); }}
                                    title="Pegar manualmente texto de malla, perfil o plan de estudios"
                                    style={{ padding: '3px 7px', borderRadius: 4, border: `1px solid ${border}`,
                                      background: 'transparent', color: text, fontWeight: 700, fontSize: 9, cursor: 'pointer' }}>
                                    Pegar fuente
                                  </button>
                                  {['procesado', 'verificado'].includes(p.estado_extraccion) && (
                                    <button
                                      onClick={() => handleNormalizarIA(p.id_programa_benchmark)}
                                      disabled={isBusy}
                                      title="Normalizar cursos y competencias desde texto extraido"
                                      style={{ padding: '3px 7px', borderRadius: 4, border: 'none',
                                        background: isBusy && actionLoading[p.id_programa_benchmark] === 'ia' ? '#94a3b8' : CYAN,
                                        color: '#fff', fontWeight: 700, fontSize: 9, cursor: isBusy ? 'not-allowed' : 'pointer' }}>
                                      {actionLoading[p.id_programa_benchmark] === 'ia' ? '...' : 'Normalizar'}
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

          {showCandidatesFor && !isReferenceView && (
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, overflow: 'hidden', boxShadow: CARD_SHADOW }}>
              <div style={{ background: isDark ? '#1e293b' : SURFACE_LOW, padding: '10px 16px',
                borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: USIL, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Candidatos de fuente oficial
                  </div>
                  <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>
                    Elige la URL que se usará como fuente principal para extraer y comparar la malla.
                  </div>
                </div>
                <button onClick={() => setShowCandidatesFor(null)}
                  style={{ border: `1px solid ${border}`, background: 'transparent', borderRadius: 6, padding: '5px 9px',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', color: text }}>
                  Cerrar
                </button>
              </div>
              {(candidates[showCandidatesFor] || []).length === 0 ? (
                <div style={{ padding: 18, color: muted, fontSize: 12 }}>
                  No hay candidatos guardados. Usa Buscar fuente para intentar descubrir URLs oficiales.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 1040, borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: 110 }} />
                      <col style={{ width: 150 }} />
                      <col style={{ width: 360 }} />
                      <col />
                      <col style={{ width: 190 }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: isDark ? '#0f172a' : SURFACE_LOW }}>
                        {['Estado', 'Tipo', 'Titulo / URL', 'Evidencia', 'Acciones'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: muted, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10,
                            borderBottom: `1px solid ${border}`, whiteSpace: 'nowrap' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(candidates[showCandidatesFor] || []).map(c => {
                        return (
                          <tr key={c.id_candidate} style={{ borderBottom: `1px solid ${border}` }}>
                            <td style={{ padding: '8px 10px', fontWeight: 700 }}>{c.estado}</td>
                            <td style={{ padding: '8px 10px' }}>{c.tipo_fuente_detectado}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.titulo || 'Sin titulo detectado'}
                              </div>
                              <a href={c.url} target="_blank" rel="noreferrer"
                                style={{ color: CYAN, fontSize: 10, textDecoration: 'none', wordBreak: 'break-all', display: 'block' }}>
                                {c.url}
                              </a>
                            </td>
                            <td style={{ padding: '8px 10px', color: muted }}>
                              <div style={{ maxHeight: 54, overflow: 'hidden', lineHeight: 1.35, wordBreak: 'break-word' }}
                                title={c.snippet || c.motivo || ''}>
                                {(c.snippet || c.motivo || '').substring(0, 260)}
                              </div>
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                <button onClick={() => handleAprobarCandidato(c.id_programa_benchmark, c.id_candidate)}
                                  disabled={!!actionLoading[c.id_candidate]}
                                  style={{ border: 'none', borderRadius: 5, background: '#16a34a', color: '#fff',
                                    padding: '4px 8px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>
                                  {actionLoading[c.id_candidate] === 'approve' ? '...' : 'Elegir fuente'}
                                </button>
                                {c.estado === 'candidato' && (
                                  <button onClick={() => handleDescartarCandidato(c.id_programa_benchmark, c.id_candidate)}
                                    disabled={!!actionLoading[c.id_candidate]}
                                    style={{ border: `1px solid ${border}`, borderRadius: 5, background: 'transparent',
                                      color: text, padding: '4px 8px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>
                                    Descartar
                                  </button>
                                )}
                              </div>
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

          {isReferenceView && (
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, overflow: 'hidden', boxShadow: CARD_SHADOW }}>
              <div style={{ background: isDark ? '#1e293b' : SURFACE_LOW, padding: '12px 16px',
                borderBottom: `1px solid ${border}` }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: USIL, fontFamily: FONT_HEAD }}>
                  Comparador de malla USIL vs referente
                </div>
                <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>
                  Esta vista no administra fuentes. Usa las mallas ya extraídas desde {fuenteGestionLabel} para comparar contra USIL.
                </div>
              </div>
              {!selectedCarrera || !selectedReferenciaUniversidad ? (
                <div style={{ padding: 24, textAlign: 'center', color: muted, fontSize: 12 }}>
                  Selecciona una carrera USIL y una universidad referente para iniciar la comparación.
                </div>
              ) : programasReferencia.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: muted, fontSize: 12 }}>
                  No hay cursos de malla extraídos para esta carrera y universidad. Extrae y normaliza la fuente desde {fuenteGestionLabel}.
                </div>
              ) : (
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {programasReferencia.map(p => {
                    const isInternacional = p.tipo_benchmark === 'competencia_internacional';
                    const cursosExternos = (p.cursos || []).map(curso => ({
                      ciclo: curso.ciclo,
                      nombre: cleanCourseName(curso.nombre_curso),
                      meta: curso.area_formacion || curso.fuente_url || null,
                      matchedUsilId: curso.id_curso_usil_match ?? null,
                      matchConfianza: curso.match_confianza ?? null,
                    }));
                    const cursosSinAnalizarIA = isInternacional && cursosExternos.length > 0
                      && cursosExternos.every(c => c.matchedUsilId == null);
                    const ciclosComparador = getAvailableCycles([...cursosUsil, ...cursosExternos]);
                    const activeCiclo = selectedCicloComparador === 'todos' || ciclosComparador.includes(selectedCicloComparador)
                      ? selectedCicloComparador
                      : 'todos';
                    const cursosUsilFiltrados = filterCoursesByCycle(cursosUsil, activeCiclo);
                    const cursosExternosFiltrados = filterCoursesByCycle(cursosExternos, activeCiclo);
                    // Competencia directa (mallas peruanas, ambas en español): coincidencia por texto normalizado.
                    // Competencia internacional (idiomas distintos): coincidencia por el par calculado con IA
                    // (curso_benchmark.id_curso_usil_match), cacheado en BD via /match-ia.
                    const getUsilKey = (c: { id?: number; nombre: string }) =>
                      isInternacional && c.id != null ? `usil:${c.id}` : courseKey(c.nombre);
                    const getExtKey = (c: { nombre: string; matchedUsilId?: number | null }) =>
                      isInternacional
                        ? (c.matchedUsilId != null ? `usil:${c.matchedUsilId}` : `sinmatch:${courseKey(c.nombre)}`)
                        : courseKey(c.nombre);
                    const usilKeys = new Set(cursosUsilFiltrados.map(getUsilKey));
                    const extKeys = new Set(cursosExternosFiltrados.map(getExtKey));
                    const coincidencias = cursosExternosFiltrados.filter(c => usilKeys.has(getExtKey(c))).length;
                    const externosNoCubiertos = cursosExternosFiltrados.length - coincidencias;
                    const usilNoEncontrados = cursosUsilFiltrados.filter(c => !extKeys.has(getUsilKey(c))).length;
                    const kpis: Array<{ label: string; value: number; icon: string; iconBg: string; iconColor: string; valueColor: string }> = [
                      { label: 'Coincidencias', value: coincidencias, icon: 'done_all', iconBg: CYAN_LIGHT, iconColor: USIL, valueColor: USIL },
                      { label: 'Externos no cubiertos', value: externosNoCubiertos, icon: 'warning', iconBg: '#ffdad6', iconColor: '#93000a', valueColor: ERROR_COLOR },
                      { label: 'USIL sin equivalente', value: usilNoEncontrados, icon: 'verified', iconBg: '#dde3eb', iconColor: '#41474e', valueColor: text },
                    ];
                    return (
                      <div key={`ref-${p.id_programa_benchmark}`} style={{ border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden', boxShadow: CARD_SHADOW }}>
                        <div style={{ padding: '12px', background: isDark ? '#0f172a' : SURFACE_LOW, borderBottom: `1px solid ${border}` }}>
                          <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: USIL, fontFamily: FONT_HEAD }}>{p.nombre_universidad}</div>
                              <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>{p.nombre_programa}</div>
                              {isInternacional && (
                                <div style={{ fontSize: 9, color: muted, marginTop: 4 }}>
                                  {cursosSinAnalizarIA
                                    ? 'Aun no se analizo la equivalencia con USIL (comparacion por texto exacto no aplica entre idiomas distintos).'
                                    : 'Equivalencia calculada con IA (semantica, cruza espanol/ingles). Requiere revision academica.'}
                                </div>
                              )}
                            </div>
                            {isInternacional && canEdit && (
                              <button
                                type="button"
                                onClick={() => handleMatchIA(p.id_programa_benchmark)}
                                disabled={actionLoading[p.id_programa_benchmark] === 'match-ia'}
                                style={{ borderRadius: 8, background: cursosSinAnalizarIA ? USIL : (isDark ? '#1e293b' : '#fff'),
                                  color: cursosSinAnalizarIA ? '#fff' : text, border: cursosSinAnalizarIA ? 'none' : `1px solid ${border}`,
                                  padding: '6px 12px', fontSize: 10, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                                {actionLoading[p.id_programa_benchmark] === 'match-ia'
                                  ? 'Analizando...'
                                  : cursosSinAnalizarIA ? 'Analizar equivalencia (IA)' : 'Re-analizar (IA)'}
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                            {kpis.map(k => (
                              <div key={k.label} style={{ background: card, border: `1px solid ${border}`, borderRadius: 12,
                                padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: k.iconBg,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: 17, color: k.iconColor }}>{k.icon}</span>
                                </div>
                                <div>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
                                  <div style={{ fontSize: 16, fontWeight: 700, color: k.valueColor, fontFamily: FONT_HEAD }}>{k.value}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div style={{ padding: '10px 12px', borderBottom: `1px solid ${border}`,
                          background: card, display: 'flex', justifyContent: 'flex-end',
                          gap: 6, flexWrap: 'wrap' }}>
                          {['todos', ...ciclosComparador].map(cycle => {
                            const isActive = activeCiclo === cycle;
                            const label = cycle === 'todos' ? 'Todos' : `Ciclo ${cycle}`;
                            return (
                              <button
                                key={`cycle-${p.id_programa_benchmark}-${cycle}`}
                                type="button"
                                onClick={() => setSelectedCicloComparador(cycle)}
                                style={{
                                  border: `1px solid ${isActive ? USIL : border}`,
                                  borderRadius: 999,
                                  background: isActive ? USIL : card,
                                  color: isActive ? '#fff' : text,
                                  padding: '6px 10px',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  fontFamily: FONT_DATA,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: 12, padding: 12 }}>
                          {renderMallaBoard(
                            'Malla USIL',
                            loadingMallaUsil
                              ? 'Cargando malla vigente...'
                              : mallaUsil
                                ? `${mallaUsil.nombre_version} - ${cursosUsilFiltrados.length}/${cursosUsil.length} cursos`
                                : 'No se encontró malla vigente cargada',
                            cursosUsilFiltrados,
                            USIL,
                            extKeys,
                            getUsilKey
                          )}
                          {renderMallaBoard(
                            `Malla referente - ${p.nombre_universidad}`,
                            `${cursosExternosFiltrados.length}/${cursosExternos.length} cursos extraídos desde fuente oficial`,
                            cursosExternosFiltrados,
                            CYAN,
                            usilKeys,
                            getExtKey
                          )}
                        </div>
                        <div style={{ padding: '0 12px 12px', color: muted, fontSize: 10, lineHeight: 1.45 }}>
                          {isInternacional
                            ? 'La comparación usa equivalencia semántica calculada con IA (cruza español/inglés). Las brechas curriculares y propuestas deben generarse después con revisión humana.'
                            : 'La comparación por ahora usa coincidencia exacta normalizada de nombres de cursos. Las brechas curriculares y propuestas deben generarse después con revisión humana.'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {selectedCarrera && !isReferenceView && programasVisibles.length > 0 && (
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, overflow: 'hidden', boxShadow: CARD_SHADOW }}>
              <div style={{ background: isDark ? '#1e293b' : SURFACE_LOW, padding: '10px 16px',
                borderBottom: `1px solid ${border}` }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: USIL, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Comparador de malla
                </div>
                <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>
                  La comparación se habilita con fuente exacta, texto oficial extraído o fuente pegada. La propuesta queda siempre en revisión humana.
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: isDark ? '#0f172a' : SURFACE_LOW }}>
                      {['Programa externo', 'Entrada', 'IA', 'Comparación contra USIL', 'Resultado esperado', 'Estado curricular'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10,
                          color: muted, borderBottom: `1px solid ${border}`, whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {programasVisibles.map((p, idx) => {
                      const hasExactSource = hasUsableSource(p);
                      const hasEvidence = (p.total_cursos ?? 0) > 0 || (p.fuentes_validadas ?? 0) > 0 || ['procesado', 'verificado'].includes(p.estado_extraccion);
                      return (
                        <tr key={`cmp-${p.id_programa_benchmark}`} style={{ borderBottom: `1px solid ${border}`, background: idx % 2 === 1 ? (isDark ? 'transparent' : SURFACE_LOW) : 'transparent' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                            {p.nombre_universidad}
                            <div style={{ color: muted, fontWeight: 500, marginTop: 2 }}>{p.nombre_programa}</div>
                          </td>
                          <td style={{ padding: '8px 10px', color: hasExactSource ? '#166534' : '#854d0e', fontWeight: 700 }}>
                            {hasExactSource ? 'Fuente exacta registrada' : 'Revisar candidato o pegar fuente'}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {hasEvidence ? 'Puede normalizar cursos/competencias' : 'Esperando evidencia'}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            Cursos, competencias, tecnologías, perfil y créditos contra malla/sílabos USIL.
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            Brechas, coincidencias, cursos afectados y evidencia por fuente.
                          </td>
                          <td style={{ padding: '8px 10px', color: '#854d0e', fontWeight: 700 }}>
                            Propuesta en revisión
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}


          {!isReferenceView && competencias.length > 0 && (
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, overflow: 'hidden', boxShadow: CARD_SHADOW }}>
              <div style={{ background: isDark ? '#1e293b' : SURFACE_LOW, padding: '12px 16px',
                borderBottom: `1px solid ${border}` }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: USIL, fontFamily: FONT_HEAD }}>
                  Competencias detectadas en benchmarking ({competencias.length})
                </span>
                <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>
                  {universidadesConPrograma.length} universidades - {competenciasUnicas.length} competencias unicas
                </div>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr style={{ background: isDark ? '#0f172a' : SURFACE_LOW }}>
                      {['Universidad', 'Pais', 'Programa', 'Competencia', 'Tipo'].map(h => (
                        <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10,
                          color: muted, borderBottom: `1px solid ${border}` }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {competencias.map((c, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${border}`, background: i % 2 === 1 ? (isDark ? 'transparent' : SURFACE_LOW) : 'transparent' }}>
                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>{c.nombre_universidad}</td>
                        <td style={{ padding: '7px 10px', color: muted }}>{c.pais}</td>
                        <td style={{ padding: '7px 10px', color: muted, maxWidth: 140 }}>{c.nombre_programa}</td>
                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>{c.nombre_competencia}</td>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px',
                            borderRadius: 4, background: CYAN_LIGHT, color: USIL }}>
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


      {showAddUniv && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddUniv(false); }}>
          <div style={{ background: card, borderRadius: 12, padding: '24px 28px', width: 420,
            maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', color: text }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: USIL, fontFamily: FONT_HEAD }}>
              Agregar Universidad - {TIPO_LABELS[tipo]}
            </h3>
            {[
              { key: 'nombre_universidad', label: 'Nombre de la Universidad *', ph: 'Ej. Universidad de Lima' },
              { key: 'pais', label: 'Pais', ph: 'Peru' },
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
                    background: isDark ? '#0f172a' : SURFACE_LOW, color: text, fontSize: 12, boxSizing: 'border-box' }}
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


      {showAddProg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddProg(false); }}>
          <div style={{ background: card, borderRadius: 12, padding: '24px 28px', width: 460,
            maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', color: text }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: USIL, fontFamily: FONT_HEAD }}>
              Agregar Programa Benchmark
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, textTransform: 'uppercase' }}>
                Universidad *
              </label>
              <select value={selectedUnivForProg}
                onChange={e => setSelectedUnivForProg(e.target.value ? Number(e.target.value) : '')}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${border}`,
                  background: isDark ? '#0f172a' : SURFACE_LOW, color: text, fontSize: 12 }}>
                <option value="">- Seleccionar -</option>
                {universidades.map(u => (
                  <option key={u.id_universidad_benchmark} value={u.id_universidad_benchmark}>
                    {u.nombre_universidad}
                  </option>
                ))}
              </select>
            </div>
            {[
              { key: 'nombre_programa', label: 'Nombre del Programa *', ph: 'Ej. Ingenieria de Software' },
              { key: 'url_programa', label: 'URL del programa', ph: 'https://...' },
              { key: 'modalidad', label: 'Modalidad', ph: 'Presencial, Virtual, Hibrido' },
              { key: 'duracion', label: 'Duracion', ph: '5 anos, 10 ciclos...' },
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
                    background: isDark ? '#0f172a' : SURFACE_LOW, color: text, fontSize: 12, boxSizing: 'border-box' }}
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


      {showManualText !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowManualText(null); }}>
          <div style={{ background: card, borderRadius: 12, padding: '24px 28px', width: 520,
            maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', color: text }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: USIL, fontFamily: FONT_HEAD }}>
              Carga Manual de Texto Fuente
            </h3>
            <p style={{ fontSize: 11, color: muted, marginBottom: 14 }}>
              Si el scraping automatico esta bloqueado, copia y pega aqui el texto del plan de estudios o perfil de egreso de la pagina.
            </p>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, textTransform: 'uppercase' }}>
                URL de origen
              </label>
              <input value={manualUrl} onChange={e => setManualUrl(e.target.value)} placeholder="https://..."
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${border}`,
                  background: isDark ? '#0f172a' : SURFACE_LOW, color: text, fontSize: 12, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: muted, marginBottom: 4, textTransform: 'uppercase' }}>
                Texto fuente * (minimo 20 caracteres)
              </label>
              <textarea value={manualText} onChange={e => setManualText(e.target.value)}
                rows={8} placeholder="Pega aqui el texto del plan de estudios, perfil de egreso, cursos, etc."
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${border}`,
                  background: isDark ? '#0f172a' : SURFACE_LOW, color: text, fontSize: 12,
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
