import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BadgeCheck, BookOpen, Bot, Expand, Save, Search, Sparkles, X } from 'lucide-react';
import { ThemeColors } from '../types';
import { CERTIFICACIONES_PROGRAMAS, CertificacionesCurso } from './certificacionesData';

interface CertificacionesGradualesViewProps {
  themeColors: ThemeColors;
  userRole?: string;
}

type CertSlot = {
  nombre: string;
  descripcion: string;
  cursoIds: Array<string | null>;
};

type ProgramaOption = {
  code: string;
  program: string;
  modalidad?: string;
  grado?: string;
  titulo?: string;
  sourceFile?: string;
  totalCursos?: number;
  totalCreditos?: number;
  nombreFacultad?: string;
  idCarrera?: number;
  cursos: CertificacionesCurso[];
};

type CurricularCarrera = {
  id_carrera: number;
  nombre_carrera: string;
  id_facultad: number;
  nombre_facultad: string;
};

type MallaOption = {
  id_malla: number;
  nombre_version: string;
  anio_inicio: number;
  es_vigente: number;
  nombre_carrera: string;
  nombre_facultad: string;
  total_cursos: number;
};

type MapaCurso = {
  id: number;
  nombre: string;
  codigo?: string | null;
  ciclo: number;
  orden?: number | null;
  creditos: number | null;
  tipoCurso?: string | null;
  horasTeoria?: number | null;
  horasPractica?: number | null;
  horasLab?: number | null;
  prerequisito?: string | null;
  mencion?: string | null;
};

type MapaCiclo = {
  label: string;
  numero: number;
  cursos: MapaCurso[];
};

type MercadoInforme = {
  informe?: {
    facultad?: string;
    carrera?: string;
    periodo?: string;
    tituloHeader?: string;
    descripcionHeader?: string;
    insightHeader?: string;
    descripcion?: string;
    objetivoFinal?: string;
  };
  mercado?: {
    puestos?: Array<{ nombre?: string; nombre_puesto?: string; descripcion?: string }>;
    habilidades?: Array<{ categoria?: string; habilidades?: string[] }>;
    herramientas?: Array<{ nombre?: string; descripcion?: string }>;
    tendencias?: Array<{ titulo?: string; descripcion?: string }>;
    recomendacionesCurriculares?: string[];
    recomendacionesEstudiante?: string[];
  };
};

type AiInsight = {
  hallazgo: string;
  recomendacion: string;
  justificacion: string;
  certificacion: string;
  cursos: string[];
};

const NAVY = '#000d33';
const PANEL = '#f7f9fb';
const LINE = '#c5c6d2';
const TEAL = '#007164';
const TEAL_BRIGHT = '#7af7e1';
const DANGER = '#dc2626';
const CERTIFICACIONES_EDIT_ROLES = new Set(['admin', 'usuario', 'analista', 'editor']);

function cycleName(ciclo: number) {
  return `Ciclo ${ciclo}`;
}

function initialSlots(): CertSlot[] {
  return [
    { nombre: 'Nombre (Ej: Cert. en Modelado BIM)', descripcion: '', cursoIds: [null, null, null, null] },
    { nombre: 'Nombre de Certificacion 2', descripcion: '', cursoIds: [null, null, null, null] },
    { nombre: 'Nombre de Certificacion 3', descripcion: '', cursoIds: [null, null, null, null] },
  ];
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normalizeKey(value: string) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}

function toCertCurso(curso: MapaCurso, carreraCode: string): CertificacionesCurso {
  return {
    id: `${carreraCode}-${curso.id}`,
    codigoOficial: curso.codigo || `CUR${curso.id}`,
    codigoCurso: String(curso.id),
    ciclo: Number(curso.ciclo) || 1,
    nombre: curso.nombre,
    coordinacion: '',
    tipoEstudios: curso.tipoCurso || 'Malla curricular',
    condicion: 'Obligatorio',
    modalidadCurso: 'Presencial',
    creditos: Number(curso.creditos) || 0,
    horasAutonomas: 0,
    prerequisito: curso.prerequisito || '',
    horas: {
      teoria: Number(curso.horasTeoria) || 0,
      practica: Number(curso.horasPractica) || 0,
      laboratorio: Number(curso.horasLab) || 0,
    },
  };
}

function scoreCurso(curso: CertificacionesCurso) {
  const name = normalizeText(curso.nombre);
  let score = 56;
  if (curso.ciclo >= 4 && curso.ciclo <= 8) score += 20;
  if (/proyecto|integrador|software|english|investigaci|programaci|evaluaci|didact|teaching|curricular|gestion|datos|artificial/.test(name)) score += 17;
  if (curso.condicion?.toLowerCase() === 'obligatorio') score += 5;
  if (name.includes('electivo')) score -= 12;
  return Math.max(38, Math.min(98, score));
}

function getCourseStripe(curso: CertificacionesCurso) {
  const score = scoreCurso(curso);
  if (score >= 82) return TEAL;
  if (score >= 68) return '#002060';
  return '#94a3b8';
}

function mercadoKeywords(mercado: MercadoInforme | null) {
  const texts = [
    mercado?.informe?.descripcionHeader,
    mercado?.informe?.insightHeader,
    mercado?.informe?.descripcion,
    mercado?.informe?.objetivoFinal,
    ...(mercado?.mercado?.puestos ?? []).flatMap(item => [item.nombre, item.nombre_puesto, item.descripcion]),
    ...(mercado?.mercado?.habilidades ?? []).flatMap(cat => [cat.categoria, ...(cat.habilidades ?? [])]),
    ...(mercado?.mercado?.herramientas ?? []).flatMap(item => [item.nombre, item.descripcion]),
    ...(mercado?.mercado?.tendencias ?? []).flatMap(item => [item.titulo, item.descripcion]),
    ...(mercado?.mercado?.recomendacionesCurriculares ?? []),
    ...(mercado?.mercado?.recomendacionesEstudiante ?? []),
  ].filter(Boolean).join(' ');

  const stop = new Set(['para', 'con', 'los', 'las', 'una', 'uno', 'por', 'del', 'que', 'como', 'desde', 'sobre', 'profesional', 'carrera', 'mercado']);
  return Array.from(new Set(normalizeText(texts).split(/[^a-z0-9]+/).filter(word => word.length > 4 && !stop.has(word)))).slice(0, 50);
}

function marketScore(curso: CertificacionesCurso, keywords: string[]) {
  const haystack = normalizeText(`${curso.nombre} ${curso.tipoEstudios} ${curso.coordinacion}`);
  const matches = keywords.filter(keyword => haystack.includes(keyword)).length;
  return scoreCurso(curso) + matches * 8 + (curso.ciclo >= 5 ? 10 : 0);
}

const CertificacionesGradualesView: React.FC<CertificacionesGradualesViewProps> = ({ themeColors: C, userRole }) => {
  const isDark = C.cardBg?.includes('slate-9') ?? false;
  const text = isDark ? '#e5edf9' : '#0b1538';
  const muted = isDark ? '#9ca3af' : '#626975';
  const border = isDark ? 'rgba(197,198,210,0.22)' : LINE;
  const card = isDark ? '#111827' : '#ffffff';
  const surface = isDark ? '#0f172a' : PANEL;

  const staticProgramas = CERTIFICACIONES_PROGRAMAS as ProgramaOption[];
  const [programas, setProgramas] = useState<ProgramaOption[]>(staticProgramas);
  const [programCode, setProgramCode] = useState(staticProgramas[0].code);
  const [apiCursos, setApiCursos] = useState<CertificacionesCurso[] | null>(null);
  const [mallaStatus, setMallaStatus] = useState('');
  const [query, setQuery] = useState('');
  const [cycleFilter, setCycleFilter] = useState<string>('all');
  const [slots, setSlots] = useState<CertSlot[]>(initialSlots);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mercadoInforme, setMercadoInforme] = useState<MercadoInforme | null>(null);
  const [mercadoStatus, setMercadoStatus] = useState('');
  const [aiInsights, setAiInsights] = useState<AiInsight[]>([]);
  const [aiSummary, setAiSummary] = useState('Arrastra cursos a las tarjetas para recibir recomendaciones de competencias y estructura.');
  const [savingImage, setSavingImage] = useState(false);
  const certRef = useRef<HTMLDivElement>(null);

  const programa = programas.find(p => p.code === programCode) ?? programas[0] ?? staticProgramas[0];
  const staticMatch = staticProgramas.find(p => normalizeKey(p.program) === normalizeKey(programa.program));
  const cursos = [...(apiCursos ?? (programa.cursos?.length ? programa.cursos : staticMatch?.cursos ?? []))];
  const assignedCount = slots.reduce((total, slot) => total + slot.cursoIds.filter(Boolean).length, 0);
  const completeCount = slots.filter(slot => slot.cursoIds.filter(Boolean).length >= 4 && slot.nombre.trim()).length;
  const canEdit = CERTIFICACIONES_EDIT_ROLES.has(userRole || 'usuario');
  const allComplete = completeCount === 3;

  const cursoById = useMemo(() => new Map(cursos.map(curso => [curso.id, curso])), [cursos]);

  useEffect(() => {
    let alive = true;
    fetch('/api/curricular/filtros', { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => {
        if (!alive || !Array.isArray(data?.carreras)) return;
        const byKey = new Map<string, ProgramaOption>();
        staticProgramas.forEach(program => byKey.set(normalizeKey(program.program), program));
        (data.carreras as CurricularCarrera[]).forEach(carrera => {
          const key = normalizeKey(carrera.nombre_carrera);
          const existing = byKey.get(key);
          byKey.set(key, {
            ...(existing ?? {}),
            code: `CUR-${carrera.id_carrera}`,
            program: carrera.nombre_carrera.toUpperCase(),
            nombreFacultad: carrera.nombre_facultad,
            idCarrera: carrera.id_carrera,
            cursos: existing?.cursos ?? [],
            totalCursos: existing?.totalCursos,
            totalCreditos: existing?.totalCreditos,
          });
        });
        const next = Array.from(byKey.values()).sort((a, b) => a.program.localeCompare(b.program));
        setProgramas(next);
        const preferida = next.find(p => normalizeKey(p.program).includes('arquitecturaurbanismoyterritorio')) ?? next[0];
        if (preferida) setProgramCode(preferida.code);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setApiCursos(null);
    setMallaStatus('');
    if (!programa?.idCarrera) return () => { alive = false; };

    const params = new URLSearchParams({ carrera: programa.program });
    if (programa.nombreFacultad) params.set('facultad', programa.nombreFacultad);
    setMallaStatus('Cargando malla...');

    fetch(`/api/curricular/mallas?${params.toString()}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(async (mallas: MallaOption[]) => {
        if (!alive) return;
        const vigente = Array.isArray(mallas)
          ? (mallas.find(malla => Number(malla.es_vigente) === 1) ?? mallas[0])
          : null;
        if (!vigente?.id_malla) {
          setMallaStatus('Sin malla cargada para esta carrera');
          setApiCursos([]);
          return;
        }
        const mapaRes = await fetch(`/api/curricular/mapa/${vigente.id_malla}`, { credentials: 'include' });
        if (!mapaRes.ok) throw new Error('mapa');
        const ciclos = await mapaRes.json() as MapaCiclo[];
        if (!alive) return;
        const mapped = Array.isArray(ciclos)
          ? ciclos.flatMap(ciclo => ciclo.cursos.map(curso => toCertCurso({ ...curso, ciclo: curso.ciclo || ciclo.numero }, programa.code)))
          : [];
        setApiCursos(mapped);
        setMallaStatus(mapped.length ? `${mapped.length} cursos cargados` : 'Malla sin cursos cargados');
      })
      .catch(() => {
        if (!alive) return;
        const fallback = staticProgramas.find(p => normalizeKey(p.program) === normalizeKey(programa.program));
        setApiCursos(fallback?.cursos ?? []);
        setMallaStatus(fallback?.cursos?.length ? 'Usando malla XLSM de respaldo' : 'No se pudo cargar la malla');
      });
    return () => { alive = false; };
  }, [programCode, programa?.idCarrera, programa?.program, programa?.nombreFacultad]);

  useEffect(() => {
    let alive = true;
    setMercadoInforme(null);
    setMercadoStatus('');
    if (!programa?.program) return () => { alive = false; };
    const params = new URLSearchParams({ carrera: programa.program });
    if (programa.nombreFacultad) params.set('facultad', programa.nombreFacultad);
    setMercadoStatus('Cargando informe de mercado...');
    fetch(`/api/mercado-laboral/informe?${params.toString()}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => {
        if (!alive) return;
        setMercadoInforme(data);
        setMercadoStatus('Informe de mercado conectado');
      })
      .catch(() => {
        if (!alive) return;
        setMercadoInforme(null);
        setMercadoStatus('Sin informe de mercado para esta carrera');
      });
    return () => { alive = false; };
  }, [programCode, programa?.program, programa?.nombreFacultad]);

  const cursosFiltrados = useMemo(() => {
    const term = normalizeText(query.trim());
    return cursos
      .filter(curso => cycleFilter === 'all' || (cycleFilter === 'suggested' && scoreCurso(curso) >= 78) || String(curso.ciclo) === cycleFilter)
      .filter(curso => !term || normalizeText(`${curso.nombre} ${curso.codigoOficial} ${curso.codigoCurso} ${curso.tipoEstudios}`).includes(term))
      .sort((a, b) => scoreCurso(b) - scoreCurso(a) || a.ciclo - b.ciclo || a.nombre.localeCompare(b.nombre))
  }, [cursos, cycleFilter, query]);
  const ciclosDisponibles = Array.from(new Set(cursos.map(curso => curso.ciclo)))
    .filter(ciclo => ciclo >= 1 && ciclo <= 10)
    .sort((a, b) => a - b);

  const suggested = cursos
    .filter(curso => curso.ciclo >= 4 && curso.ciclo <= 8)
    .sort((a, b) => scoreCurso(b) - scoreCurso(a))
    .slice(0, 12);
  const topSuggestion = suggested[0];
  const secondSuggestion = suggested[1];

  const addCurso = (cursoId: string, certIndex?: number, position?: number) => {
    if (!canEdit) return;
    setSlots(prev => {
      const next = prev.map(slot => ({ ...slot, cursoIds: [...slot.cursoIds] }));
      const targetIndex = certIndex ?? next.findIndex(slot => slot.cursoIds.some(id => !id));
      if (targetIndex < 0) return prev;
      const targetPosition = position ?? next[targetIndex].cursoIds.findIndex(id => !id);
      if (targetPosition < 0 || targetPosition > 3 || next[targetIndex].cursoIds[targetPosition]) return prev;
      next[targetIndex].cursoIds[targetPosition] = cursoId;
      return next;
    });
  };

  const removeCurso = (certIndex: number, slotIndex: number) => {
    if (!canEdit) return;
    setSlots(prev => prev.map((slot, idx) => idx === certIndex
      ? { ...slot, cursoIds: slot.cursoIds.map((id, currentIndex) => currentIndex === slotIndex ? null : id) }
      : slot
    ));
  };

  const updateSlot = (idx: number, patch: Partial<CertSlot>) => {
    if (!canEdit) return;
    setSlots(prev => prev.map((slot, i) => i === idx ? { ...slot, ...patch } : slot));
  };

  const reset = () => {
    setSlots(initialSlots());
    setQuery('');
    setCycleFilter('all');
  };

  const applySuggestion = (targetIndex = 0) => {
    const ids = suggested.slice(0, 4).map(curso => curso.id);
    setSlots(prev => prev.map((slot, idx) => idx === targetIndex
      ? {
          ...slot,
          nombre: programa.code === 'P25' ? 'Certificacion en ensenanza del ingles' : 'Certificacion en desarrollo y acompanamiento infantil',
          descripcion: 'Ruta basada en cursos intermedios con evidencia aplicable.',
          cursoIds: [ids[0] ?? null, ids[1] ?? null, ids[2] ?? null, ids[3] ?? null],
        }
      : slot
    ));
  };

  const buildInsight = (certIndex: number, certCursos: CertificacionesCurso[], keywords: string[]): AiInsight => {
    const best = certCursos
      .map(curso => ({ curso, score: marketScore(curso, keywords) }))
      .sort((a, b) => b.score - a.score);
    const missing = 4 - certCursos.length;
    const involved = certCursos.map(curso => `${curso.nombre} (${cycleName(curso.ciclo)})`);
    const similarNames = slots
      .map((slot, idx) => ({ idx, name: normalizeText(slot.nombre) }))
      .filter(item => item.idx !== certIndex && item.name && normalizeText(slots[certIndex].nombre).includes(item.name.slice(0, 12)));

    if (missing > 0) {
      return {
        hallazgo: `La Certificacion ${certIndex + 1} aun no completa los 4 cursos requeridos.`,
        recomendacion: `Agregar ${missing} curso(s) de 5.o ciclo en adelante con mayor relacion a competencias demandadas.`,
        justificacion: mercadoInforme ? 'El informe de mercado aporta habilidades y tendencias para priorizar cursos con mayor afinidad.' : 'La recomendacion se basa solo en la malla porque no hay informe de mercado conectado.',
        certificacion: `Certificacion ${certIndex + 1}`,
        cursos: involved,
      };
    }
    if (similarNames.length) {
      return {
        hallazgo: `La Certificacion ${certIndex + 1} puede parecer poco diferenciada frente a otra certificacion.`,
        recomendacion: 'Ajustar el nombre hacia una competencia especifica y ordenar los cursos de base a aplicacion.',
        justificacion: 'Los nombres similares reducen claridad para el estudiante y para la evidencia de empleabilidad.',
        certificacion: `Certificacion ${certIndex + 1}`,
        cursos: involved,
      };
    }
    return {
      hallazgo: `${best[0]?.curso.nombre ?? 'La ruta'} concentra la mayor afinidad con la malla y el mercado.`,
      recomendacion: `Nombrar la certificacion como area de especializacion y cerrar con una evidencia aplicada vinculada a ${best[0]?.curso.nombre ?? 'los cursos seleccionados'}.`,
      justificacion: mercadoInforme
        ? 'La recomendacion cruza cursos desde 5.o ciclo con habilidades, herramientas y tendencias del informe de mercado.'
        : 'La recomendacion respeta la malla disponible; no se agrego informacion laboral externa.',
      certificacion: `Certificacion ${certIndex + 1}`,
      cursos: involved,
    };
  };

  const autoAnalyze = () => {
    const keywords = mercadoKeywords(mercadoInforme);
    const pool = cursos
      .filter(curso => curso.ciclo >= 5 && !/^ELECTIVO/i.test(curso.nombre))
      .sort((a, b) => marketScore(b, keywords) - marketScore(a, keywords))
      .slice(0, 12);
    const nextSlots = [
      {
        nombre: 'Certificacion en competencia aplicada 1',
        descripcion: 'Ruta sugerida desde malla e informe de mercado disponible.',
        cursoIds: pool.slice(0, 4).map(c => c.id),
      },
      {
        nombre: 'Certificacion en competencia aplicada 2',
        descripcion: 'Agrupa cursos de especializacion con evidencia progresiva.',
        cursoIds: pool.slice(4, 8).map(c => c.id),
      },
      {
        nombre: 'Certificacion en proyecto integrador aplicado',
        descripcion: 'Cierra con cursos avanzados y producto demostrable.',
        cursoIds: pool.slice(8, 12).map(c => c.id),
      },
    ];
    setSlots(nextSlots);
    const insights = nextSlots.map((slot, idx) =>
      buildInsight(idx, slot.cursoIds.map(id => cursoById.get(id || '')).filter(Boolean) as CertificacionesCurso[], keywords)
    );
    setAiInsights(insights);
    setAiSummary(mercadoInforme
      ? `Analisis generado con malla curricular, informe de mercado de ${mercadoInforme.informe?.periodo ?? 'mercado'} y cursos asignados.`
      : 'Analisis generado con malla curricular. No se encontro informe de mercado asociado para esta carrera.');
  };

  const saveProposalImage = async () => {
    if (!certRef.current || savingImage) return;
    setSavingImage(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(certRef.current, {
        backgroundColor: isDark ? '#0f172a' : PANEL,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `certificaciones_${programa.program.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setSavingImage(false);
    }
  };

  const onDropSlot = (event: React.DragEvent, certIndex: number, slotIndex: number) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain') || draggingId;
    if (id) addCurso(id, certIndex, slotIndex);
    setDraggingId(null);
    setDropTarget(null);
  };

  const selectStyle: React.CSSProperties = {
    height: 40,
    minWidth: 154,
    border: `1px solid ${border}`,
    borderRadius: 8,
    background: isDark ? '#0f172a' : '#f8fafc',
    color: text,
    padding: '0 12px',
    fontSize: 14,
    fontWeight: 600,
  };

  const buttonStyle: React.CSSProperties = {
    height: 40,
    border: `1px solid ${border}`,
    borderRadius: 8,
    background: card,
    color: text,
    padding: '0 14px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  };

  const progressText = `Certificacion 1: ${slots[0].cursoIds.filter(Boolean).length}/4 | Certificacion 2: ${slots[1].cursoIds.filter(Boolean).length}/4 | Certificacion 3: ${slots[2].cursoIds.filter(Boolean).length}/4`;

  return (
    <div ref={certRef} className={`cert-page ${isExpanded ? 'cert-expanded' : ''}`} style={{ height: '100%', background: surface, color: text, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header className="cert-header" style={{ minHeight: 108, padding: '16px 24px 12px', borderBottom: `1px solid ${border}`, background: surface, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, color: isDark ? '#dbeafe' : NAVY, fontSize: 27, lineHeight: 1.05, fontWeight: 900 }}>
              Constructor de Certificaciones Graduales
            </h1>
            <span style={{ border: '1px solid #b4c5ff', background: '#dbe1ff', color: '#2c4383', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 800 }}>
              Beta
            </span>
          </div>
          <p style={{ margin: '8px 0 8px', color: muted, fontSize: 14 }}>
            Diseña las 3 certificaciones graduales de la carrera
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: muted, fontSize: 13, fontWeight: 700 }}>{progressText}</span>
            <span style={{ background: isDark ? '#1e293b' : '#e6e8ea', color: text, borderRadius: 6, padding: '5px 9px', fontSize: 11, fontWeight: 900 }}>
              Progreso: {completeCount} de 3 completas
            </span>
          </div>
        </div>

        <div className="cert-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <select value={programCode} onChange={e => { setProgramCode(e.target.value); reset(); }} style={selectStyle}>
            {programas.map(p => <option key={p.code} value={p.code}>{p.program}</option>)}
          </select>
          <select style={selectStyle} value="2027-01" onChange={() => undefined}>
            <option value="2027-01">Plan 2027-01</option>
            <option value="2025-01">Plan 2025-01</option>
          </select>
          <button onClick={reset} style={buttonStyle}>Reiniciar</button>
          <button onClick={autoAnalyze} style={{ ...buttonStyle, border: 'none', background: TEAL, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} />
            Analizar con IA
          </button>
        </div>
      </header>

      <div className="cert-workspace-grid" style={{ flex: 1, minHeight: 0, display: 'grid', gap: 16, padding: 16, paddingBottom: 0, overflow: 'hidden' }}>
        <section style={{ background: card, border: `1px solid ${border}`, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 14, borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16, color: isDark ? '#dbeafe' : NAVY, fontWeight: 900 }}>Cursos disponibles</h2>
            <div style={{ position: 'relative' }}>
              <Search size={15} color={muted} style={{ position: 'absolute', top: 12, left: 10 }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar curso o competencia..."
                style={{ width: '100%', height: 38, boxSizing: 'border-box', border: `1px solid ${border}`, borderRadius: 8, padding: '0 10px 0 32px', background: isDark ? '#0f172a' : '#f8fafc', color: text, fontSize: 12 }}
              />
            </div>
            <div className="cert-cycle-filters" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 12 }}>
              <select
                value={cycleFilter === 'suggested' ? 'all' : cycleFilter}
                onChange={event => setCycleFilter(event.target.value)}
                style={{ height: 31, border: 'none', borderRadius: 6, background: '#e6e8ea', color: '#334155', padding: '0 8px', fontSize: 11, fontWeight: 800, minWidth: 0 }}
              >
                <option value="all">Todos los ciclos</option>
                {ciclosDisponibles.map(ciclo => <option key={ciclo} value={String(ciclo)}>Ciclo {ciclo}</option>)}
              </select>
              <button
                onClick={() => setCycleFilter('suggested')}
                style={{ border: 'none', borderRadius: 6, background: cycleFilter === 'suggested' ? '#7af7e1' : '#e6e8ea', color: cycleFilter === 'suggested' ? '#003b34' : '#334155', padding: '0 9px', fontSize: 11, fontWeight: 800, cursor: 'pointer', height: 31 }}
              >
                Alta afinidad
              </button>
            </div>
          </div>

          <div className="cert-course-list" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0, scrollbarWidth: 'thin' }}>
            {cursosFiltrados.map(curso => {
              const score = scoreCurso(curso);
              return (
                <button
                  key={curso.id}
                  draggable={canEdit}
                  disabled={!canEdit}
                  onClick={() => addCurso(curso.id)}
                  onDragStart={event => {
                    setDraggingId(curso.id);
                    event.dataTransfer.setData('text/plain', curso.id);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                  style={{
                    position: 'relative',
                    textAlign: 'left',
                    border: `1px solid ${border}`,
                    borderRadius: 8,
                    background: isDark ? '#0f172a' : '#ffffff',
                    color: text,
                    minHeight: 86,
                    flexShrink: 0,
                    padding: '12px 12px 10px 14px',
                    cursor: canEdit ? 'grab' : 'default',
                    opacity: canEdit ? 1 : 0.56,
                    boxShadow: '0 2px 8px rgba(0,32,96,0.04)',
                    overflow: 'hidden',
                  }}
                >
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: getCourseStripe(curso) }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <span style={{ color: muted, fontSize: 11, fontWeight: 900 }}>{curso.codigoOficial || curso.codigoCurso || 'ELEC'}</span>
                    <span style={{ background: '#e6e8ea', color: '#626975', borderRadius: 5, padding: '3px 7px', fontSize: 10, fontWeight: 800 }}>{cycleName(curso.ciclo)}</span>
                  </div>
                  <div style={{ color: isDark ? '#e5edf9' : NAVY, fontSize: 14, fontWeight: 800, lineHeight: 1.25 }}>{curso.nombre}</div>
                  <div style={{ marginTop: 9, display: 'flex', justifyContent: 'space-between', gap: 8, color: muted, fontSize: 11 }}>
                    <span>{curso.creditos || '-'} Creditos</span>
                    {score >= 78 ? (
                      <span style={{ color: TEAL, fontWeight: 900 }}>↗ {score}% Match</span>
                    ) : score >= 60 ? (
                      <span style={{ color: muted, fontWeight: 800 }}>− {score}% Match</span>
                    ) : (
                      <span style={{ color: '#ef4444', fontSize: 10 }}>⚠ Prerreq. no cumple</span>
                    )}
                  </div>
                </button>
              );
            })}
            {!cursosFiltrados.length && (
              <div style={{ border: `1px dashed ${border}`, borderRadius: 8, padding: 16, color: muted, fontSize: 12, lineHeight: 1.45, textAlign: 'center' }}>
                {mallaStatus || 'No hay cursos para los filtros seleccionados.'}
              </div>
            )}
          </div>
        </section>

        <section style={{ background: card, border: `1px solid ${border}`, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ height: 58, padding: '0 16px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <h2 style={{ margin: 0, color: isDark ? '#dbeafe' : NAVY, fontSize: 17, fontWeight: 900 }}>Estructura de Certificaciones (3)</h2>
            <button
              title={isExpanded ? 'Volver a vista normal' : 'Expandir estructura'}
              onClick={() => setIsExpanded(value => !value)}
              style={{ width: 32, height: 32, border: 'none', background: 'transparent', color: isDark ? '#dbeafe' : NAVY, cursor: 'pointer' }}
            >
              <Expand size={20} />
            </button>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              padding: 16,
              overflow: 'hidden',
              backgroundColor: isDark ? '#0f172a' : '#ffffff',
              backgroundImage: isDark ? 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.10) 1px, transparent 0)' : 'radial-gradient(circle at 1px 1px, #e0e3e5 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
          >
            <div className="cert-cards-grid" style={{ display: 'grid', gap: 16, alignItems: 'start' }}>
              {slots.map((slot, certIndex) => {
                const selectedCursos = slot.cursoIds.map(id => id ? cursoById.get(id) ?? null : null);
                const filledCursos = selectedCursos.filter(Boolean) as CertificacionesCurso[];
                const maxCycle = filledCursos.length ? Math.max(...filledCursos.map(curso => curso.ciclo)) : null;
                const avgAffinity = filledCursos.length ? Math.round(filledCursos.reduce((sum, curso) => sum + scoreCurso(curso), 0) / filledCursos.length) : null;
                return (
                  <article key={certIndex} style={{ position: 'relative', background: isDark ? '#111827' : '#f8fafc', border: `1px solid ${border}`, borderRadius: 10, padding: 16, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 8px rgba(0,32,96,0.04)' }}>
                    <div style={{ position: 'absolute', top: -12, right: -8, width: 32, height: 32, borderRadius: 999, background: '#e6e8ea', border: `1px solid ${border}`, color: '#1f2937', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 900 }}>
                      {certIndex + 1}
                    </div>
                    <input
                      value={slot.nombre}
                      onChange={event => updateSlot(certIndex, { nombre: event.target.value })}
                      style={{ border: `1px dashed ${border}`, background: 'transparent', color: isDark ? '#dbeafe' : NAVY, height: 36, padding: '0 10px', fontSize: 14, fontWeight: 900, outline: 'none' }}
                    />
                    <textarea
                      value={slot.descripcion}
                      onChange={event => updateSlot(certIndex, { descripcion: event.target.value })}
                      placeholder="Breve descripcion de la competencia..."
                      style={{ marginTop: 6, border: 'none', background: 'transparent', color: muted, resize: 'none', height: 36, fontSize: 12, outline: 'none' }}
                    />
                    <div className="cert-slot-list" style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, marginTop: 10 }}>
                      {[0, 1, 2, 3].map(slotIndex => {
                        const curso = selectedCursos[slotIndex];
                        const targetKey = `${certIndex}-${slotIndex}`;
                        const activeDrop = dropTarget === targetKey;
                        return (
                          <div
                            key={targetKey}
                            onDragOver={event => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'copy';
                              setDropTarget(targetKey);
                            }}
                            onDragLeave={() => setDropTarget(null)}
                            onDrop={event => onDropSlot(event, certIndex, slotIndex)}
                            style={{
                              minHeight: 58,
                              borderRadius: 8,
                              border: curso ? `1px solid ${border}` : `2px dashed ${activeDrop ? TEAL : border}`,
                              background: curso ? (isDark ? '#0f172a' : '#ffffff') : (activeDrop ? 'rgba(122,247,225,0.16)' : 'rgba(247,249,251,0.62)'),
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: curso ? 10 : 8,
                              transition: 'background .15s, border-color .15s',
                            }}
                          >
                            {curso ? (
                              <div style={{ width: '100%', minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                                  <span style={{ color: TEAL, fontSize: 10, fontWeight: 900 }}>{curso.codigoOficial || curso.codigoCurso}</span>
                                  <button onClick={() => removeCurso(certIndex, slotIndex)} title="Quitar curso" style={{ border: 'none', background: 'transparent', color: muted, cursor: 'pointer', padding: 0 }}>
                                    <X size={14} />
                                  </button>
                                </div>
                                <div style={{ color: text, fontSize: 12, fontWeight: 900, lineHeight: 1.25 }}>{curso.nombre}</div>
                                <div style={{ marginTop: 5, color: muted, fontSize: 10 }}>{cycleName(curso.ciclo)} · {curso.creditos || '-'} cr. · {scoreCurso(curso)}% match</div>
                              </div>
                            ) : (
                              <div style={{ textAlign: 'center', color: muted }}>
                                <div style={{ fontSize: 12, fontWeight: 800 }}>Curso {slotIndex + 1}</div>
                                <div style={{ fontSize: 10, marginTop: 4 }}>{activeDrop ? 'Suelta aqui' : 'Arrastra aqui'}</div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="cert-metrics" style={{ borderTop: `1px solid ${border}`, marginTop: 10, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 5, color: muted, fontSize: 11, lineHeight: 1.25, flexShrink: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0 }}><span>Obtencion est.:</span><strong style={{ color: text, whiteSpace: 'nowrap' }}>{maxCycle ? cycleName(maxCycle) : '-- ciclo'}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0 }}><span>Afinidad mercado:</span><strong style={{ color: text, whiteSpace: 'nowrap' }}>{avgAffinity ? `${avgAffinity}%` : '--%'}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0 }}><span>Estado:</span><strong style={{ color: filledCursos.length >= 4 ? TEAL : DANGER, whiteSpace: 'nowrap' }}>{filledCursos.length}/4 Cursos</strong></div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <aside style={{ background: NAVY, color: '#fff', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ height: 56, padding: '0 18px', borderBottom: '1px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <Bot size={22} color={TEAL_BRIGHT} />
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>Copiloto IA</h2>
          </div>
          <div className="cert-ai-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0, scrollbarWidth: 'thin' }}>
            <p style={{ margin: 0, color: '#b4c5ff', fontSize: 13, lineHeight: 1.45 }}>
              {aiSummary}
            </p>
            <div style={{ color: mercadoInforme ? TEAL_BRIGHT : '#b4c5ff', fontSize: 11, fontWeight: 800 }}>
              {mercadoStatus || 'Informe de mercado pendiente'}
            </div>

            <div style={{ background: 'rgba(255,218,214,0.18)', border: '1px solid rgba(255,218,214,0.35)', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <AlertTriangle size={16} color="#ffdad6" style={{ marginTop: 1, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: '#ffdad6', marginBottom: 5 }}>Revision de Nomenclatura</div>
                  <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: 'rgba(255,255,255,0.82)' }}>
                    Evita nombres asociados solo a puestos laborales. Usa denominaciones vinculadas a competencias tecnicas demostrables.
                  </p>
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TEAL_BRIGHT, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                <Sparkles size={15} />
                Oportunidad detectada
              </div>
              <h3 style={{ margin: '12px 0 8px', fontSize: 16, color: '#fff' }}>
                Demanda en {topSuggestion?.nombre.includes('ENGLISH') ? 'competencias bilingues' : 'diseño educativo aplicado'}
              </h3>
              <p style={{ margin: '0 0 12px', color: '#b4c5ff', fontSize: 12, lineHeight: 1.45 }}>
                La malla muestra cursos de ciclos medios con buena afinidad para construir una primera certificacion gradual.
              </p>
              <ul style={{ margin: '0 0 14px', paddingLeft: 18, color: '#fff', fontSize: 12, lineHeight: 1.7 }}>
                {topSuggestion && <li>{topSuggestion.nombre} ({cycleName(topSuggestion.ciclo)})</li>}
                {secondSuggestion && <li>{secondSuggestion.nombre} ({cycleName(secondSuggestion.ciclo)})</li>}
              </ul>
              <button onClick={() => applySuggestion(0)} style={{ width: '100%', height: 36, border: 'none', borderRadius: 6, background: TEAL, color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>
                Aplicar a Cert. 1
              </button>
            </div>

            {aiInsights.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ color: '#b4c5ff', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Recomendaciones IA</div>
                {aiInsights.map((item, idx) => (
                  <div key={`${item.certificacion}-${idx}`} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: 12 }}>
                    <div style={{ color: TEAL_BRIGHT, fontSize: 11, fontWeight: 900, marginBottom: 6 }}>{item.certificacion}</div>
                    <p style={{ margin: '0 0 6px', fontSize: 12, lineHeight: 1.4 }}><strong>Hallazgo:</strong> {item.hallazgo}</p>
                    <p style={{ margin: '0 0 6px', fontSize: 12, lineHeight: 1.4 }}><strong>Recomendacion:</strong> {item.recomendacion}</p>
                    <p style={{ margin: '0 0 8px', fontSize: 11, lineHeight: 1.4, color: '#b4c5ff' }}>{item.justificacion}</p>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, lineHeight: 1.5 }}>
                      {item.cursos.slice(0, 4).map(curso => <li key={curso}>{curso}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 'auto' }}>
              <div style={{ color: '#b4c5ff', fontSize: 11, fontWeight: 900, marginBottom: 10 }}>Sugerencias basadas en competencias:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  programa.code === 'P25' ? 'Certificacion en Competencia Comunicativa en Ingles' : 'Certificacion en Acompanamiento y Desarrollo Infantil',
                  'Certificacion en Diseno Curricular y Evaluacion Educativa',
                ].map((label, idx) => (
                  <button key={label} onClick={() => updateSlot(idx, { nombre: label })} style={{ textAlign: 'left', border: '1px solid rgba(255,255,255,0.13)', background: 'rgba(255,255,255,0.05)', color: idx === 0 ? TEAL_BRIGHT : '#fff', borderRadius: 6, padding: '10px 12px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <footer className="cert-footer" style={{ height: 56, borderTop: `1px solid ${border}`, background: isDark ? '#111827' : '#eceef0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div>
            <div style={{ color: muted, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.8 }}>Estado General</div>
            <div style={{ color: muted, fontSize: 14, fontStyle: 'italic', marginTop: 3 }}>{allComplete ? 'Propuesta lista para revision' : 'Diseño en progreso...'}</div>
          </div>
          <div style={{ width: 1, height: 34, background: border }} />
          <div style={{ display: 'flex', gap: 20, color: text }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <BookOpen size={17} color={muted} />
              <div><div style={{ fontSize: 9, color: muted, fontWeight: 900 }}>CURSOS ASIGNADOS</div><div style={{ fontSize: 14, fontWeight: 800 }}>{assignedCount} / 12</div></div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <BadgeCheck size={17} color={muted} />
              <div><div style={{ fontSize: 9, color: muted, fontWeight: 900 }}>CERT. COMPLETAS</div><div style={{ fontSize: 14, fontWeight: 800 }}>{completeCount} / 3</div></div>
            </div>
          </div>
        </div>
        <button onClick={saveProposalImage} style={{ height: 40, minWidth: 278, border: 'none', borderRadius: 8, background: allComplete ? NAVY : '#7c879d', color: '#fff', opacity: savingImage ? 0.7 : 1, fontSize: 15, fontWeight: 900, cursor: savingImage ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {savingImage ? 'Guardando imagen...' : 'Guardar propuesta completa'}
          <Save size={16} />
        </button>
      </footer>
      <style>{`
        .cert-page {
          height: 100%;
        }
        .cert-workspace-grid {
          grid-template-columns: minmax(240px, 264px) minmax(0, 1fr) minmax(300px, 360px);
        }
        .cert-cards-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          height: 100%;
        }
        .cert-course-list::-webkit-scrollbar {
          width: 8px;
        }
        .cert-ai-body::-webkit-scrollbar {
          width: 8px;
        }
        .cert-course-list::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 999px;
        }
        .cert-ai-body::-webkit-scrollbar-thumb {
          background: rgba(180,197,255,0.45);
          border-radius: 999px;
        }
        .cert-course-list::-webkit-scrollbar-track,
        .cert-ai-body::-webkit-scrollbar-track {
          background: transparent;
        }
        .cert-expanded .cert-workspace-grid {
          grid-template-columns: 1fr !important;
          padding: 12px !important;
          overflow: hidden !important;
        }
        .cert-expanded .cert-workspace-grid > section:first-child,
        .cert-expanded .cert-workspace-grid > aside {
          display: none !important;
        }
        .cert-expanded .cert-workspace-grid > section {
          min-height: 0 !important;
        }
        .cert-expanded .cert-workspace-grid > section > div:last-child {
          overflow: auto !important;
        }
        .cert-expanded .cert-cards-grid {
          grid-template-columns: repeat(3, minmax(260px, 1fr)) !important;
          height: auto !important;
          min-height: 100% !important;
          align-items: stretch !important;
        }
        .cert-expanded .cert-cards-grid article {
          height: auto !important;
          min-height: 520px !important;
          padding: 18px !important;
        }
        .cert-expanded .cert-slot-list > div {
          min-height: 64px !important;
        }
        .cert-expanded .cert-footer {
          display: none !important;
        }
        .cert-expanded .cert-header {
          min-height: auto !important;
          padding-top: 10px !important;
          padding-bottom: 8px !important;
        }
        .cert-expanded .cert-header h1 {
          font-size: 22px !important;
        }
        .cert-expanded .cert-header p {
          display: none !important;
        }
        @media (max-height: 820px) and (min-width: 901px) {
          .cert-header {
            min-height: 92px !important;
            padding-top: 12px !important;
            padding-bottom: 8px !important;
          }
          .cert-header h1 {
            font-size: 25px !important;
          }
          .cert-header p {
            margin-top: 6px !important;
            margin-bottom: 6px !important;
          }
          .cert-workspace-grid {
            padding-top: 12px !important;
            gap: 14px !important;
          }
          .cert-cards-grid article {
            padding: 14px !important;
          }
          .cert-cards-grid textarea {
            height: 28px !important;
          }
          .cert-slot-list {
            gap: 8px !important;
            margin-top: 6px !important;
          }
          .cert-slot-list > div {
            min-height: 50px !important;
          }
          .cert-metrics {
            margin-top: 8px !important;
            padding-top: 7px !important;
            gap: 4px !important;
            font-size: 10.5px !important;
          }
          .cert-footer {
            height: 52px !important;
          }
          .cert-ai-body {
            gap: 10px !important;
            padding: 14px !important;
          }
        }
        @media (max-width: 1500px) {
          .cert-header {
            padding: 14px 18px 10px !important;
            gap: 16px !important;
          }
          .cert-header h1 {
            font-size: 24px !important;
          }
          .cert-header-controls {
            gap: 8px !important;
          }
          .cert-workspace-grid {
            grid-template-columns: minmax(220px, 248px) minmax(0, 1fr) minmax(280px, 320px);
            gap: 14px !important;
            padding: 18px !important;
            padding-bottom: 0 !important;
          }
          .cert-cards-grid {
            grid-template-columns: repeat(3, minmax(220px, 1fr));
            gap: 12px !important;
          }
        }
        @media (max-width: 1220px) {
          .cert-page {
            overflow: hidden !important;
          }
          .cert-header {
            flex-direction: row;
            min-height: auto !important;
          }
          .cert-header-controls {
            width: 100%;
            justify-content: flex-start !important;
          }
          .cert-workspace-grid {
            grid-template-columns: minmax(210px, 230px) minmax(0, 1fr) minmax(250px, 280px);
            gap: 10px !important;
            padding: 12px !important;
            padding-bottom: 0 !important;
          }
          .cert-workspace-grid > aside {
            grid-column: auto;
            min-height: 0 !important;
          }
          .cert-cards-grid {
            gap: 8px !important;
          }
        }
        @media (max-width: 900px) {
          .cert-page {
            overflow: auto !important;
          }
          .cert-workspace-grid {
            grid-template-columns: 1fr;
            overflow: visible !important;
          }
          .cert-cards-grid {
            grid-template-columns: 1fr;
          }
          .cert-footer {
            align-items: flex-start !important;
            flex-direction: column;
            gap: 10px;
            padding: 12px 18px !important;
          }
          .cert-footer button {
            width: 100%;
            min-width: 0 !important;
          }
        }
      `}</style>
    </div>
  );
};

export default CertificacionesGradualesView;
