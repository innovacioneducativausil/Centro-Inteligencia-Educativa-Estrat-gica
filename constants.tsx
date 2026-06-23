// constants.tsx
import { Sector } from './types';
import type { ThemeColors, Signal } from './types';

export const BRAND_COLORS = {
  primary: '#00195A',
  active: '#0036DC',
  button: '#57C4DD',
  accent: '#E71E5E',
  turquoise: '#0891B2',
  orange: '#EA580C',
  green: '#24A148',
  purple: '#9B51E0',
  success: '#16A34A',
  successLight: '#DCFCE7',
  successDark: '#166534',
  error: '#DC2626',
  errorLight: '#FEE2E2',
  errorDark: '#991B1B',
  warning: '#F59E0B',
  warningLight: '#FFF7E6',
  warningDark: '#D97706',
  info: '#0284C7',
  infoLight: '#E0F2FE',
  infoDark: '#075985',
  border: '#EEEEEE',
  borderStrong: '#DBDBDB',
  surface: '#F9F9F9',
  surface2: '#F4F4F4',
  surface3: '#EDEDED',
  title: '#2E2E2E',
  body: '#888888',
  label: '#B9B9B9',
} as const;

/**
 * THEMES: Debe cumplir todas las llaves de ThemeColors (según tu types.ts).
 */
export const THEMES: Record<'light' | 'dark', ThemeColors> = {
  light: {
    bg: 'bg-[#F9F9F9]',
    text: 'text-[#2E2E2E]',
    sidebarBg: 'bg-white',
    cardBg: 'bg-white',
    cardBorder: 'border-[#EEEEEE]',
    navActiveBg: 'bg-[#0036DC]',
    navActiveText: 'text-white',
    navHoverBg: 'hover:bg-[#EDEDED]',
    navHoverText: 'hover:text-[#00195A]',
    headerBg: 'bg-white',
    headerBorder: 'border-[#EEEEEE]',
    headerText: 'text-[#2E2E2E]',
    inputBg: 'bg-white',
    inputBorder: 'border-[#DBDBDB]',
    inputText: 'text-[#2E2E2E]',
    tableHeaderBg: 'bg-[#F4F4F4]',
    tooltipBg: '#ffffff',
    tooltipBorder: 'border-[#EEEEEE]',
    chartStroke: '#888888',
    radarGrid: '#EDEDED',
    radarAxis: '#B9B9B9',
    tabActiveBg: 'bg-[#0036DC] text-white',
    tabInactiveBg: 'bg-[#F4F4F4] text-[#2E2E2E]',
    signalCardBg: 'bg-white'
  },
  dark: {
    bg: 'bg-slate-950',
    text: 'text-slate-50',
    sidebarBg: 'bg-slate-900',
    cardBg: 'bg-slate-900/60',
    cardBorder: 'border-slate-700/60',
    navActiveBg: 'bg-white',
    navActiveText: 'text-slate-900',
    navHoverBg: 'hover:bg-slate-800',
    navHoverText: 'hover:text-white',
    headerBg: 'bg-slate-900/60',
    headerBorder: 'border-slate-700/60',
    headerText: 'text-slate-50',
    inputBg: 'bg-slate-900/50',
    inputBorder: 'border-slate-700/60',
    inputText: 'text-slate-50',
    tableHeaderBg: 'bg-slate-800/60',
    tooltipBg: '#0f172a',
    tooltipBorder: 'border-slate-700/60',
    chartStroke: '#94a3b8',
    radarGrid: '#1f2937',
    radarAxis: '#64748b',
    tabActiveBg: 'bg-white text-slate-900',
    tabInactiveBg: 'bg-slate-800 text-slate-50',
    signalCardBg: 'bg-slate-900/60'
  }
};

/**
 * KPI_DATA: Dashboard lo usa para mostrar tarjetas KPI con mini chart.
 */
export const KPI_DATA = {
  newSignals: {
    value: 12,
    change: '+8%',
    trend: [{ pv: 5 }, { pv: 7 }, { pv: 8 }, { pv: 10 }, { pv: 12 }]
  },
  risingTrends: {
    value: 7,
    change: '+3%',
    trend: [{ pv: 3 }, { pv: 4 }, { pv: 5 }, { pv: 6 }, { pv: 7 }]
  },
  impactedCourses: {
    value: 18,
    change: '+5%',
    trend: [{ pv: 10 }, { pv: 12 }, { pv: 13 }, { pv: 16 }, { pv: 18 }]
  },
  recommendations: {
    value: 4,
    change: '+1',
    trend: [{ pv: 1 }, { pv: 2 }, { pv: 2 }, { pv: 3 }, { pv: 4 }]
  }
};

/**
 * BUBBLE_CHART_DATA: Dashboard lo usa en el ScatterChart.
 * Importante: id, urgency, maturity, impact (y tu Dashboard usa urgency/maturity/impact).
 */
export const BUBBLE_CHART_DATA = [
  { id: 1, urgency: 72, maturity: 40, impact: 88 },
  { id: 2, urgency: 55, maturity: 62, impact: 78 },
  { id: 3, urgency: 91, maturity: 25, impact: 93 },
  { id: 4, urgency: 33, maturity: 80, impact: 66 },
  { id: 5, urgency: 84, maturity: 55, impact: 86 }
];

/**
 * CATEGORY_STYLES: Dashboard usa CATEGORY_STYLES[selectedSignal.category]
 * Colores actualizados para buen contraste en modo claro y oscuro.
 */
export const CATEGORY_STYLES: Record<string, string> = {
  Default:          'bg-slate-500/10  border-slate-400/40  text-slate-600',
  Tecnología:       'bg-sky-500/10    border-sky-400/40    text-sky-700',
  Tecnológico:      'bg-sky-500/10    border-sky-400/40    text-sky-700',
  Educación:        'bg-emerald-500/10 border-emerald-400/40 text-emerald-700',
  Economía:         'bg-amber-500/10  border-amber-400/40  text-amber-700',
  Económico:        'bg-amber-500/10  border-amber-400/40  text-amber-700',
  Sociedad:         'bg-violet-500/10 border-violet-400/40 text-violet-700',
  Social:           'bg-violet-500/10 border-violet-400/40 text-violet-700',
  Riesgo:           'bg-rose-500/10   border-rose-400/40   text-rose-700',
  Político:         'bg-blue-500/10   border-blue-400/40   text-blue-700',
  Ecológico:        'bg-lime-600/10   border-lime-500/40   text-lime-700',
  Regulatorio:      'bg-slate-600/10  border-slate-500/40  text-slate-600',
  'Mercado Laboral':'bg-indigo-500/10 border-indigo-400/40 text-indigo-700',
  Geopolítico:      'bg-orange-500/10 border-orange-400/40 text-orange-700',
  Valores:          'bg-pink-500/10   border-pink-400/40   text-pink-700',
  'Tendencia Social':'bg-teal-500/10  border-teal-400/40   text-teal-700',
};

/**
 * SIGNALS_DATA: ahora SÍ cumple tu interfaz Signal completa (types.ts).
 * Nota: valores placeholder, pero tipados correctamente.
 */
export const SIGNALS_DATA: Signal[] = [
  {
    id: 1,
    emoji: '🤖',
    title: 'Asistentes personalizados para decisiones académicas',
    category: 'Tecnología',
    sector: Sector.Educacion,
    youtubeId: undefined,
    signalText: 'Se observa una adopción acelerada de asistentes IA',
    implicationText: 'que influye en la priorización de habilidades y decisiones curriculares.',
    reasonText: 'Se recomienda monitoreo por facultad y ajustes por brechas.',
    source: 'Demo Source',
    link: 'https://example.com',
    color: '#38BDF8'
  },
  {
    id: 2,
    emoji: '🎓',
    title: 'Microcredenciales y rutas modulares',
    category: 'Educación',
    sector: Sector.Educacion,
    youtubeId: undefined,
    signalText: 'Crecen rutas de aprendizaje cortas y apilables',
    implicationText: 'con impacto directo en empleabilidad y actualización docente.',
    reasonText: 'Evaluar compatibilidad con mallas existentes.',
    source: 'Demo Source',
    link: 'https://example.com',
    color: '#34D399'
  },
  {
    id: 3,
    emoji: '⚠️',
    title: 'Brecha de habilidades por automatización',
    category: 'Riesgo',
    sector: Sector.Industria,
    youtubeId: undefined,
    signalText: 'La automatización redistribuye tareas',
    implicationText: 'y acelera obsolescencia de habilidades en ciertos perfiles.',
    reasonText: 'Planificar reskilling por cohortes.',
    source: 'Demo Source',
    link: 'https://example.com',
    color: '#FB7185'
  }
];

/**
 * USIL_CAREERS_DATA: lo importa EmpleabilidadView.tsx.
 * Como no pegaste EmpleabilidadView todavía, dejo estructura simple.
 */
export const USIL_CAREERS_DATA = [
  { career: 'Ingeniería de Software', employabilityIndex: 0.78, demand: 'Alta', notes: 'Placeholder' },
  { career: 'Ingeniería Industrial', employabilityIndex: 0.71, demand: 'Media', notes: 'Placeholder' },
  { career: 'Medicina', employabilityIndex: 0.82, demand: 'Alta', notes: 'Placeholder' }
];

/**
 * CURRICULUM_DATA: lo importa ImpactosView.tsx.
 */
export const CURRICULUM_DATA = [
  { course: 'Algoritmos', semester: 3, skills: ['Estructuras de datos', 'Complejidad'] },
  { course: 'Bases de Datos', semester: 4, skills: ['Modelado', 'SQL', 'Normalización'] },
  { course: 'IA Aplicada', semester: 7, skills: ['ML básico', 'Prompting', 'Evaluación'] }
];
