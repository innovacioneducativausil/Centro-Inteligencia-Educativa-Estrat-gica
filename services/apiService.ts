


const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}


export interface ApiSignal {
  id: number;
  uuid: string;
  title: string;
  signalText: string;
  implicationText: string;
  reasonText: string;
  category: string;
  pestelSlug: string | null;
  pestelLetra: string | null;
  sector: string | null;
  sectorSlug: string | null;
  color: string;
  emoji: string;
  youtubeId: string | null;
  imageUrl: string | null;
  source: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  articleDate: string | null;
  urgency: number;
  impact: number;
  maturity: number;
  topico: string | null;
}

export interface ApiTrend {
  id: number;
  uuid: string;
  name: string;
  description: string;
  fullDescription: string;
  reasonText: string;
  category: string;
  pestelSlug: string | null;
  pestelLetra: string | null;
  sector: string | null;
  sectorSlug: string | null;
  color: string;
  emoji: string;
  youtubeId: string | null;
  imageUrl: string | null;
  source: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  totalSenales: number;
  status: string;
  impact: number;
  maturity: number;
  horizon: string;
  topico: string | null;
  topicosRelacionados: string[];
  nombreTendencia: string | null;
  autor: string | null;
}

export interface ApiScenario {
  id: number;
  uuid: string;
  title: string;
  description: string;
  fullDescription: string;
  reasonText: string;
  category: string;
  pestelSlug: string | null;
  sector: string | null;
  sectorSlug: string | null;
  color: string;
  emoji: string;
  imageUrl: string | null;
  source: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  totalSenales: number;
  totalTendencias: number;
  horizon: string;
  probability: number;
  topico: string | null;
  autor: string | null;
  referencias: string[] | null;
}

export interface PestelItem {
  id_pestel: number;
  nombre_pestel: string;
  slug_pestel: string;
  letra_codigo: string;
  desc_pestel: string;
  emoji: string | null;
  color: string;
  orden_display: number;
}

export interface SectorItem {
  id_sector: number;
  nombre_sector: string;
  slug_sector: string;
  desc_sector: string | null;
  emoji: string | null;
  color: string;
  orden_display: number;
}

export interface Estadisticas {
  kpis: {
    senales: number;
    tendencias: number;
    escenarios: number;
    usuarios: number;
    pesteles: number;
    sectores: number;
    senalesMes: number;
  };
  distribucionPestel: {
    categoria: string;
    color: string;
    emoji: string | null;
    totalSenales: number;
    totalTendencias: number;
  }[];
  senalesRecientes: {
    uuid: string;
    title: string;
    description: string;
    publishedAt: string | null;
    categoria: string | null;
    color: string | null;
    emoji: string | null;
  }[];
}


export const checkHealth   = () => get<{ status: string; timestamp: string }>('/health');
export const getTables     = () => get<{ database: string; tables: string[] }>('/tables');
export const describeTable = (table: string) =>
  get<{ table: string; columns: object[] }>(`/describe/${table}`);


export const getSenales = (params?: { pestel?: string; sector?: string; q?: string }) => {
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null)) as Record<string, string>
  ).toString() : '';
  return get<{ total: number; data: ApiSignal[] }>(`/senales${qs}`);
};

export const getSenal = (uuid: string) =>
  get<ApiSignal & { pesteles: string[]; sectores: string[] }>(`/senales/${uuid}`);


export const getTendencias = (params?: { pestel?: string; sector?: string; q?: string }) => {
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null)) as Record<string, string>
  ).toString() : '';
  return get<{ total: number; data: ApiTrend[] }>(`/tendencias${qs}`);
};


export const getEscenarios = (params?: { pestel?: string; sector?: string; q?: string }) => {
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null)) as Record<string, string>
  ).toString() : '';
  return get<{ total: number; data: ApiScenario[] }>(`/escenarios${qs}`);
};


export const getPestel   = () => get<{ total: number; data: PestelItem[] }>('/pestel');
export const getSectores = () => get<{ total: number; data: SectorItem[] }>('/sectores');


export const getEstadisticas = () => get<Estadisticas>('/estadisticas');


export interface CadenaSenal    { uuid: string; titulo: string; descCorta: string; urlImagen: string | null; fuente: string | null; urlFuente: string | null; pestel: string | null; color: string | null; }
export interface CadenaTendencia { uuid: string; titulo: string; descCorta: string; pestel: string | null; color: string | null; }
export interface CadenaEscenario { uuid: string; titulo: string; descCorta: string; probabilidad: number | null; pestel: string | null; color: string | null; }
export interface CadenaRelacion  { tipo: 'senal_tendencia' | 'senal_escenario' | 'tendencia_escenario'; idA: string; idB: string; }
export interface CadenaTopico {
  idTopico: number; nombre: string;
  senales:    CadenaSenal[];
  tendencias: CadenaTendencia[];
  escenarios: CadenaEscenario[];
  relaciones: CadenaRelacion[];
}
export const getCadenaCausal = () => get<{ data: CadenaTopico[] }>('/cadena-causal');
