
export enum Category {
  Tecnologico = 'Tecnológico',
  Social = 'Social',
  Valores = 'Valores',
  Politico = 'Político',
  Economico = 'Económico',
  Ecologico = 'Ecológico',
  Regulatorio = 'Regulatorio',
  MercadoLaboral = 'Mercado Laboral',
  TendenciaSocial = 'Tendencia Social',
  Geopolitico = 'Geopolítico'
}

export enum Sector {
  // — Existentes —
  Salud           = 'Salud',
  Logistica       = 'Logística',
  Finanzas        = 'Finanzas',
  Educacion       = 'Educación',
  Energia         = 'Energía',
  Aeroespacial    = 'Aeroespacial',
  Industria       = 'Industria',
  // — Prioridad Alta —
  TI              = 'Tecnología de la Información',
  Mineria         = 'Minería y Recursos Naturales',
  Agroindustria   = 'Agroindustria',
  Construccion    = 'Construcción e Infraestructura',
  Biotecnologia   = 'Biotecnología y Ciencias de la Vida',
  // — Prioridad Media —
  Turismo         = 'Turismo y Hotelería',
  Telecomunicaciones = 'Telecomunicaciones',
  Medioambiente   = 'Medioambiente y Sostenibilidad',
  Comercio        = 'Comercio y E-commerce',
  // — Contextuales —
  GobiernoPublico = 'Gobierno y Sector Público',
  Medios          = 'Medios, Comunicación y Entretenimiento',
  DefensaSeguridad = 'Defensa y Seguridad'
}

export enum Career {
  Medicina = 'Medicina',
  IngSoftware = 'Ingeniería de Software',
  Arquitectura = 'Arquitectura',
  Administracion = 'Administración',
  Psicologia = 'Psicología'
}

export interface Signal {
  id: number;
  emoji: string;
  title: string;
  category: string;
  sector: Sector;
  youtubeId?: string;
  imageUrl?: string | null;
  signalText: string;
  implicationText: string;
  reasonText: string;
  source: string;
  link: string;
  color: string;
  topico?: string | null;
  topicosRelacionados?: string[];
  publishedAt?: string | null;
  nombreTendencia?: string | null;
  probability?: number;
}

export interface Trend {
  subject: string;
  category: string;
  sector: Sector;
  status: 'Emergente' | 'En Crecimiento' | 'Establecido';
  impact: number;
  urgency: number;
  maturity: number;
  value2023: number;
  value2025: number;
  fullMark: number;
  horizon?: 'Corto' | 'Medio' | 'Largo';
  connectivity?: number;
  volatility?: 'Baja' | 'Media' | 'Alta';
  relatedSignals?: number[];
  source?: string;
  link?: string;
}

export interface Scenario {
  id: number;
  title: string;
  category: string;
  sector: Sector;
  horizon: 'Corto' | 'Medio' | 'Largo';
  summary: string;
  drivers: string[];
  relatedSignals?: number[];
  relatedTrends?: string[];
  source?: string;
  link?: string;
}

export interface Course {
  id: number;
  name: string;
  criticality: 'low' | 'medium' | 'critical';
  affectedBy: number[];
  summary?: string;
  syllabusUrl?: string;
  recommendation: string;
  recommendedTools?: string[];
  contentToUpdate?: string[];
}

export interface Semester {
  semester: number;
  courses: Course[];
}

export interface ThemeColors {
  bg: string;
  text: string;
  sidebarBg: string;
  cardBg: string;
  cardBorder: string;
  navActiveBg: string;
  navActiveText: string;
  navHoverBg: string;
  navHoverText: string;
  headerBg: string;
  headerBorder: string;
  headerText: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  tableHeaderBg: string;
  tooltipBg: string;
  tooltipBorder: string;
  chartStroke: string;
  radarGrid: string;
  radarAxis: string;
  tabActiveBg: string;
  tabInactiveBg: string;
  signalCardBg: string;
}
