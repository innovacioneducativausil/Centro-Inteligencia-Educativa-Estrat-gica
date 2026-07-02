import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Zap, Activity, Eye, Sparkles, Loader2, Info, X, PlayCircle, ChevronDown, GitBranch } from 'lucide-react';
import { ThemeColors, Signal, Sector } from '../types';
import { analyzeSignalDeepDive, estimateImpactUrgency } from '../services/geminiService';
import { getSenales, getTendencias, getEscenarios, ApiSignal, ApiTrend, ApiScenario } from '../services/apiService';
import { logActividad } from '../services/actividadService';
import CadenaView from './CadenaView';
import { sanitizeRichHtml } from '../services/sanitizeHtml';

interface RadarViewProps {
  themeColors: ThemeColors;
  activeTabProp?: 'señales' | 'tendencias' | 'escenarios';
  setRadarTab?: (tab: 'señales' | 'tendencias' | 'escenarios') => void;
  pendingNotif?: { uuid: string; tipo: 'senal' | 'tendencia' | 'escenario' } | null;
  onPendingNotifConsumed?: () => void;
}

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/  +/g, ' ').trim();


const C = {
  teal:    '#0D9488',
  tealL:   '#14B8A6',
  tealBg:  '#F0FDFA',
  navy:    '#0F2A3F',
  slate:   '#475569',
  muted:   '#94A3B8',
  border:  'rgba(15,42,63,0.08)',
  bg:      '#F1F5F9',
  white:   '#FFFFFF',
  amber:   '#F59E0B',
  rose:    '#F43F5E',
  violet:  '#7C3AED',
  emerald: '#10B981',
  sky:     '#0EA5E9',
};

const PESTEL_LIST = ['Político', 'Económico', 'Social', 'Tecnológico', 'Ecológico', 'Legal'];

const PESTEL_CHIP_STYLE: Record<string, React.CSSProperties> = {
  'Social':      { borderColor: '#C4B5FD', background: '#EDE9FE', color: '#7C3AED' },
  'Tecnológico': { borderColor: '#5EEAD4', background: '#CCFBF1', color: '#0D9488' },
  'Económico':   { borderColor: '#FCD34D', background: '#FEF3C7', color: '#92400E' },
  'Político':    { borderColor: '#FCA5A5', background: '#FFE4E6', color: '#F43F5E' },
  'Ecológico':   { borderColor: '#6EE7B7', background: '#D1FAE5', color: '#065F46' },
  'Legal':       { borderColor: '#7DD3FC', background: '#E0F2FE', color: '#0369A1' },
};

const PESTEL_TAG_STYLE: Record<string, React.CSSProperties> = {
  'Social':      { background: '#EDE9FE', color: '#7C3AED' },
  'Tecnológico': { background: '#CCFBF1', color: '#0D9488' },
  'Económico':   { background: '#FEF3C7', color: '#92400E' },
  'Político':    { background: '#FFE4E6', color: '#F43F5E' },
  'Ecológico':   { background: '#D1FAE5', color: '#065F46' },
  'Legal':       { background: '#E0F2FE', color: '#0369A1' },
};

const IMP_STRIPE: Record<string, string> = {
  Alto:  'linear-gradient(90deg,#F43F5E,#FB7185)',
  Medio: 'linear-gradient(90deg,#F59E0B,#FCD34D)',
  Bajo:  'linear-gradient(90deg,#10B981,#34D399)',
};
const IMP_COLORS: Record<string, string> = { Alto: '#F43F5E', Medio: '#F59E0B', Bajo: '#10B981' };
const PROB_STRIPE: Record<string, string> = {
  Alta:  'linear-gradient(90deg,#8B5CF6,#A78BFA)',
  Media: 'linear-gradient(90deg,#3B82F6,#60A5FA)',
  Baja:  'linear-gradient(90deg,#6EE7B7,#34D399)',
};
const PROB_COLORS: Record<string, string> = { Alta: '#8B5CF6', Media: '#3B82F6', Baja: '#10B981' };

const probLevel = (v: number): 'Alta' | 'Media' | 'Baja' => v >= 4 ? 'Alta' : v >= 3 ? 'Media' : 'Baja';

const CLUSTER_EMOJI: Record<string, string> = {
  'Social': '👥', 'Tecnológico': '💻', 'Económico': '💰',
  'Político': '🏛️', 'Ecológico': '🌱', 'Legal': '⚖️',
};
const CLUSTER_BG: Record<string, string> = {
  'Social': '#EDE9FE', 'Tecnológico': '#CCFBF1', 'Económico': '#FEF3C7',
  'Político': '#FFE4E6', 'Ecológico': '#D1FAE5', 'Legal': '#E0F2FE',
};

const impactLevel = (v: number): 'Alto' | 'Medio' | 'Bajo' =>
  v >= 70 ? 'Alto' : v >= 40 ? 'Medio' : 'Bajo';


type UnifiedItem = {
  uuid: string;
  title: string;
  excerpt: string;
  category: string;
  sector: string | null;
  source: string | null;
  impact: number;
  urgency: number;
  horizon?: string;
  color: string;
  emoji: string;
  imageUrl?: string | null;
  youtubeId?: string | null;
  topico?: string | null;
  publishedAt?: string | null;
  articleDate?: string | null;
  probability?: number;
  raw: ApiSignal | ApiTrend | ApiScenario;
  type: 'señal' | 'tendencia' | 'escenario';
  nombreTendencia?: string | null;
  topicosRelacionados?: string[];
  autor?: string | null;
};

const unifySignal   = (s: ApiSignal): UnifiedItem   => ({ uuid: s.uuid, title: s.title, excerpt: s.signalText, category: s.category, sector: s.sector, source: s.source, impact: s.impact, urgency: s.urgency, color: s.color, emoji: s.emoji, imageUrl: s.imageUrl, youtubeId: s.youtubeId, topico: s.topico, publishedAt: s.publishedAt, articleDate: s.articleDate, autor: s.autor, raw: s, type: 'señal' });
const unifyTrend    = (t: ApiTrend): UnifiedItem    => ({ uuid: t.uuid, title: t.name, excerpt: stripHtml(t.description), category: t.category, sector: t.sector, source: t.source, impact: t.impact, urgency: t.impact, horizon: t.horizon, color: t.color, emoji: t.emoji, imageUrl: t.imageUrl, youtubeId: t.youtubeId, topico: t.topico, publishedAt: t.publishedAt, autor: t.autor, raw: t, type: 'tendencia', nombreTendencia: t.nombreTendencia, topicosRelacionados: t.topicosRelacionados });
const unifyScenario = (s: ApiScenario): UnifiedItem => ({ uuid: s.uuid, title: s.title, excerpt: stripHtml(s.description), category: s.category, sector: s.sector, source: s.source, impact: 0, urgency: 0, probability: s.probability, horizon: s.horizon, color: s.color, emoji: s.emoji, imageUrl: s.imageUrl, topico: s.topico, publishedAt: s.publishedAt, autor: s.autor, raw: s, type: 'escenario' });


function toSignal(s: ApiSignal): Signal {
  return { id: s.id, emoji: s.emoji, title: s.title, category: s.category, sector: (s.sector as Sector) || Sector.Educacion, youtubeId: s.youtubeId ?? undefined, imageUrl: s.imageUrl ?? null, signalText: s.signalText, implicationText: s.implicationText, reasonText: s.reasonText, source: s.source ?? '', link: s.sourceUrl ?? '', color: s.color, topico: s.topico ?? null, publishedAt: s.publishedAt, articleDate: s.articleDate };
}
function toTrend(t: ApiTrend): Signal {
  return { id: t.id, emoji: t.emoji, title: t.name, category: t.category, sector: (t.sector as Sector) || Sector.Educacion, youtubeId: t.youtubeId ?? undefined, imageUrl: t.imageUrl ?? null, signalText: t.fullDescription || t.description || '', implicationText: t.fullDescription || t.description || '', reasonText: t.reasonText || '', source: t.source ?? '', link: t.sourceUrl ?? '', color: t.color, topico: t.topico ?? null, topicosRelacionados: t.topicosRelacionados ?? [], nombreTendencia: t.nombreTendencia ?? null, autor: t.autor ?? null };
}
function toScenario(s: ApiScenario): Signal {
  return { id: s.id, emoji: s.emoji, title: s.title, category: s.category, sector: (s.sector as Sector) || Sector.Educacion, youtubeId: undefined, signalText: s.fullDescription || s.description || '', implicationText: s.fullDescription || s.description || '', reasonText: s.reasonText || '', source: s.source ?? '', link: s.sourceUrl ?? '', color: s.color, topico: s.topico ?? null, probability: s.probability, autor: s.autor ?? null, referencias: s.referencias ?? null };
}


type ViewMode = 'cards' | 'tabla' | 'matriz' | 'cluster' | 'timeline';
type SortOrder = 'recientes' | 'impacto' | 'horizonte' | 'az';
type QuickFilter = 'todas' | 'urgentes' | 'ia' | 'curricula' | 'empleabilidad';
type RadarTab = 'señales' | 'tendencias' | 'escenarios' | 'cadena';
const VALID_RADAR_VIEWS: ViewMode[] = ['cards', 'tabla', 'matriz', 'cluster', 'timeline'];

const VIEWS_FOR_TAB: Record<string, { id: ViewMode; symbol: string; label: string }[]> = {
  señales:    [{ id: 'cards', symbol: '⊞', label: 'Cartillas' }, { id: 'timeline', symbol: '⟶', label: 'Tiempo' }],
  tendencias: [{ id: 'cards', symbol: '⊞', label: 'Cartillas' }],
  escenarios: [{ id: 'cards', symbol: '⊞', label: 'Cartillas' }, { id: 'cluster', symbol: '❋', label: 'Clusters' }],
};

const RadarView: React.FC<RadarViewProps> = ({ themeColors, activeTabProp, setRadarTab, pendingNotif, onPendingNotifConsumed }) => {
  const [activeTab, setActiveTab] = useState<RadarTab>(activeTabProp || 'señales');
  const [activeView, setActiveView] = useState<ViewMode>(() => {
    const stored = localStorage.getItem('radar_view_mode') as ViewMode | null;
    return stored && VALID_RADAR_VIEWS.includes(stored) ? stored : 'cards';
  });
  const [sortOrder, setSortOrder] = useState<SortOrder>('recientes');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('todas');
  const [searchInput, setSearchInput] = useState('');
  const [activePestelSet, setActivePestelSet] = useState<Set<string>>(new Set(PESTEL_LIST));
  const [activeSectorSet, setActiveSectorSet] = useState<Set<string>>(new Set());
  const [sectorDropOpen, setSectorDropOpen] = useState(false);
  const [sectorDropPos, setSectorDropPos] = useState({ top: 0, left: 0 });
  const sectorDropRef = useRef<HTMLDivElement>(null);
  const [activeTopicoSet, setActiveTopicoSet] = useState<Set<string>>(new Set());
  const [topicoDropOpen, setTopicoDropOpen] = useState(false);
  const [topicoDropPos, setTopicoDropPos] = useState({ top: 0, left: 0 });
  const topicoDropRef = useRef<HTMLDivElement>(null);
  const [openClusters, setOpenClusters] = useState<Set<string>>(new Set());
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [selectedType, setSelectedType] = useState<'señal' | 'tendencia' | 'escenario'>('señal');
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMetrics, setAiMetrics] = useState<{ impact: number; urgency: number } | null>(null);
  const [aiMetricsLoading, setAiMetricsLoading] = useState(false);
  const [aiMetricsError, setAiMetricsError] = useState<string | null>(null);

  const metricsCache = useRef<Map<string, { impact: number; urgency: number }>>(new Map());

  const [descLargaContent, setDescLargaContent] = useState<string | null>(null);
  const [descLargaLoading, setDescLargaLoading] = useState(false);
  const [showDescLarga, setShowDescLarga] = useState(false);


  const [signals, setSignals]     = useState<ApiSignal[]>([]);
  const [trends, setTrends]       = useState<ApiTrend[]>([]);
  const [scenarios, setScenarios] = useState<ApiScenario[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError]     = useState<string | null>(null);

  useEffect(() => {
    if (activeTabProp) setActiveTab(activeTabProp);
  }, [activeTabProp]);

  useEffect(() => {
    localStorage.setItem('radar_view_mode', activeView);
  }, [activeView]);

  const handleTabChange = (tab: RadarTab) => {
    setActiveTab(tab);
    if (tab !== 'cadena') setRadarTab?.(tab);
  };

  const handleViewChange = (view: ViewMode) => {
    setActiveView(view);
    localStorage.setItem('radar_view_mode', view);
  };

  useEffect(() => {
    const valid = VIEWS_FOR_TAB[activeTab]?.map(v => v.id) ?? ['cards'];
    if (!valid.includes(activeView)) setActiveView('cards');
  }, [activeTab]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sectorDropRef.current && !sectorDropRef.current.contains(e.target as Node)) setSectorDropOpen(false);
      if (topicoDropRef.current && !topicoDropRef.current.contains(e.target as Node)) setTopicoDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setLoadingData(true);
    setLoadError(null);
    Promise.all([getSenales(), getTendencias(), getEscenarios()])
      .then(([sig, trend, scen]) => { setSignals(sig.data); setTrends(trend.data); setScenarios(scen.data); })
      .catch(err => { console.error('Error cargando datos:', err); setLoadError(err.message || 'Error al cargar los datos'); })
      .finally(() => setLoadingData(false));
  }, []);


  useEffect(() => {
    if (!pendingNotif || loadingData) return;
    let found = false;
    if (pendingNotif.tipo === 'senal') {
      const raw = signals.find(s => s.uuid === pendingNotif.uuid);
      if (raw) {
        setAiMetrics(null); setAiMetricsError(null);
        setSelectedUuid(raw.uuid);
        setDescLargaContent(null); setShowDescLarga(false); setDescLargaLoading(false);
        setSelectedSignal(toSignal(raw)); setSelectedType('señal'); setAiAnalysis(null); setAiError(null);
        found = true;
      }
    } else if (pendingNotif.tipo === 'tendencia') {
      const raw = trends.find(t => t.uuid === pendingNotif.uuid);
      if (raw) {
        setAiMetrics(null); setAiMetricsError(null);
        setSelectedUuid(raw.uuid);
        setDescLargaContent(null); setShowDescLarga(false); setDescLargaLoading(false);
        setSelectedSignal(toTrend(raw)); setSelectedType('tendencia'); setAiAnalysis(null); setAiError(null);
        found = true;
      }
    } else {
      const raw = scenarios.find(s => s.uuid === pendingNotif.uuid);
      if (raw) {
        setAiMetrics(null); setAiMetricsError(null);
        setSelectedUuid(raw.uuid);
        setDescLargaContent(null); setShowDescLarga(false); setDescLargaLoading(false);
        setSelectedSignal(toScenario(raw)); setSelectedType('escenario'); setAiAnalysis(null); setAiError(null);
        found = true;
      }
    }
    if (found) onPendingNotifConsumed?.();
  }, [pendingNotif, loadingData, signals, trends, scenarios]);


  const handleOpenSignal   = (s: ApiSignal)   => { setSelectedSignal(toSignal(s));   setSelectedType('señal');     setAiAnalysis(null); setAiError(null); logActividad('ver_senal',     { modulo: 'radar', elementoUuid: s.uuid, elementoTipo: 'señal',     elementoTitulo: s.title }); };
  const handleOpenTrend    = (t: ApiTrend)    => { setSelectedSignal(toTrend(t));    setSelectedType('tendencia'); setAiAnalysis(null); setAiError(null); logActividad('ver_tendencia', { modulo: 'radar', elementoUuid: t.uuid, elementoTipo: 'tendencia', elementoTitulo: t.name  }); };
  const handleOpenScenario = (s: ApiScenario) => { setSelectedSignal(toScenario(s)); setSelectedType('escenario'); setAiAnalysis(null); setAiError(null); logActividad('ver_escenario', { modulo: 'radar', elementoUuid: s.uuid, elementoTipo: 'escenario', elementoTitulo: s.title }); };

  const handleOpenItem = (item: UnifiedItem) => {
    setAiMetrics(null); setAiMetricsError(null);
    setSelectedUuid(item.uuid);
    setDescLargaContent(null); setShowDescLarga(false); setDescLargaLoading(false);
    if (item.type === 'señal')     handleOpenSignal(item.raw as ApiSignal);
    else if (item.type === 'tendencia') handleOpenTrend(item.raw as ApiTrend);
    else handleOpenScenario(item.raw as ApiScenario);


    if (item.type !== 'escenario') {
      const cached = metricsCache.current.get(item.uuid);
      if (cached) {
        setAiMetrics(cached);
      } else {
        setAiMetricsLoading(true);
        estimateImpactUrgency(item.title, item.excerpt, item.category, item.type)
          .then(m => { metricsCache.current.set(item.uuid, m); setAiMetrics(m); })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            setAiMetricsError(`No se pudo calcular el impacto: ${msg}`);
          })
          .finally(() => setAiMetricsLoading(false));
      }
    }
  };

  const handleAiDeepDive = async () => {
    if (!selectedSignal) return;
    setAiLoading(true); setAiError(null);
    try { setAiAnalysis(await analyzeSignalDeepDive(selectedSignal, selectedType)); }
    catch (err: any) { setAiError(err?.message || 'Error al conectar con la IA.'); }
    finally { setAiLoading(false); }
  };

  const closeModal = () => { setSelectedSignal(null); setSelectedType('señal'); setAiAnalysis(null); setAiError(null); setAiMetrics(null); setAiMetricsError(null); setSelectedUuid(null); setDescLargaContent(null); setShowDescLarga(false); };

  const handleToggleDescLarga = async () => {
    if (showDescLarga) { setShowDescLarga(false); return; }
    if (descLargaContent !== null) { setShowDescLarga(true); return; }
    if (!selectedUuid) return;
    setDescLargaLoading(true);
    try {
      const r = await fetch(`/api/admin/senales/${selectedUuid}`);
      if (r.ok) { const d = await r.json(); setDescLargaContent(d.descLarga || null); }
    } catch {}
    setDescLargaLoading(false);
    setShowDescLarga(true);
  };


  const togglePestel  = (v: string) => setActivePestelSet(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const toggleSector  = (v: string) => setActiveSectorSet(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const toggleTopico  = (v: string) => setActiveTopicoSet(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const toggleCluster = (cat: string) => setOpenClusters(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  const resetFilters = () => {
    setActivePestelSet(new Set(PESTEL_LIST));
    setActiveSectorSet(new Set());
    setActiveTopicoSet(new Set());
    setSearchInput('');
    setQuickFilter('todas');
  };


  const allSectors = useMemo(() => {
    const s = new Set<string>();
    [...signals, ...trends, ...scenarios].forEach(i => { if (i.sector) s.add(i.sector); });
    return Array.from(s).sort();
  }, [signals, trends, scenarios]);


  const allTopicos = useMemo(() => {
    const all = new Set<string>();
    if (activeTab === 'señales') signals.forEach(i => { if (i.topico) all.add(i.topico); });
    else if (activeTab === 'tendencias') trends.forEach(i => {
      if (i.topico) all.add(i.topico);
      i.topicosRelacionados?.forEach(t => all.add(t));
    });
    else scenarios.forEach(i => { if (i.topico) all.add(i.topico); });
    return Array.from(all).sort();
  }, [activeTab, signals, trends, scenarios]);


  const sortedItems = useMemo(() => {
    let base: UnifiedItem[] = [];
    if (activeTab === 'señales')     base = signals.map(unifySignal);
    else if (activeTab === 'tendencias') base = trends.map(unifyTrend);
    else base = scenarios.map(unifyScenario);

    const filtered = base.filter(item => {
      if (activePestelSet.size === 0) return false;
      const matchSearch = !searchInput ||
        item.title.toLowerCase().includes(searchInput.toLowerCase()) ||
        item.excerpt.toLowerCase().includes(searchInput.toLowerCase());
      const matchPestel = activePestelSet.has(item.category);
      const matchSector = activeSectorSet.size === 0 || (item.sector ? activeSectorSet.has(item.sector) : false);
      const matchTopico = activeTopicoSet.size === 0 ||
        (item.topico ? activeTopicoSet.has(item.topico) : false) ||
        (item.topicosRelacionados?.some(t => activeTopicoSet.has(t)) ?? false);
      const t = (item.title + ' ' + item.excerpt).toLowerCase();
      const matchQuick =
        quickFilter === 'todas' ||
        (quickFilter === 'urgentes' && item.urgency > 70) ||
        (quickFilter === 'ia' && /ia|inteligencia artificial|automatizaci|machine learning|llm|gpt/.test(t)) ||
        (quickFilter === 'curricula' && /curr[ií]cul|malla|programa académ/.test(t)) ||
        (quickFilter === 'empleabilidad' && /empleo|empleabil|laboral|trabajo/.test(t));
      return matchSearch && matchPestel && matchSector && matchTopico && matchQuick;
    });

    switch (sortOrder) {
      case 'impacto':   return filtered.sort((a, b) => b.impact - a.impact);
      case 'az':        return filtered.sort((a, b) => a.title.localeCompare(b.title, 'es'));
      case 'horizonte': return filtered.sort((a, b) => (a.horizon || 'zzz').localeCompare(b.horizon || 'zzz'));
      default:          return filtered;
    }
  }, [activeTab, signals, trends, scenarios, searchInput, activePestelSet, activeSectorSet, activeTopicoSet, quickFilter, sortOrder]);


  const timelineGroups = useMemo(() => {
    const map = new Map<string, UnifiedItem[]>();
    for (const item of sortedItems) {
      let bucket: string;
      const dateStr = item.articleDate || item.publishedAt;
      if (dateStr) {
        const d = new Date(dateStr);
        const month = d.toLocaleDateString('es-PE', { month: 'short' });
        const year  = d.getFullYear();
        bucket = `${month.charAt(0).toUpperCase() + month.slice(1)} ${year}`;
      } else {
        bucket = 'Sin fecha de artículo';
      }
      if (!map.has(bucket)) map.set(bucket, []);
      map.get(bucket)!.push(item);
    }

    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'Sin fecha de artículo') return 1;
      if (b === 'Sin fecha de artículo') return -1;
      const da = new Date(`01 ${a}`), db = new Date(`01 ${b}`);
      return db.getTime() - da.getTime();
    });
  }, [sortedItems]);


  const clusterGroups = useMemo(() => {
    const map = new Map<string, UnifiedItem[]>();
    for (const item of sortedItems) {
      const key = item.topico ?? 'Sin tópico';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  }, [sortedItems]);


  const matrizQuads = useMemo(() => {
    const actuar: UnifiedItem[] = [], planificar: UnifiedItem[] = [], monitorear: UnifiedItem[] = [], delegar: UnifiedItem[] = [];
    for (const item of sortedItems) {
      const hiImp = item.impact >= 60, hiUrg = item.urgency >= 60;
      if (hiImp && hiUrg) actuar.push(item);
      else if (hiImp && !hiUrg) planificar.push(item);
      else if (!hiImp && !hiUrg) monitorear.push(item);
      else delegar.push(item);
    }
    return { actuar, planificar, monitorear, delegar };
  }, [sortedItems]);


  const tabLabel = activeTab === 'señales' ? 'Señales' : activeTab === 'tendencias' ? 'Tendencias' : activeTab === 'cadena' ? 'Cadena Causal' : 'Escenarios';


  const fontStyle: React.CSSProperties = { fontFamily: "'Space Grotesk', 'Inter', sans-serif" };
  const isDark = themeColors.bg.includes('950') || themeColors.bg.includes('slate-900');
  const D = {
    surfaceBg: isDark ? '#0F172A' : C.white,
    subtleBg:  isDark ? '#1E293B' : C.bg,
    border:    isDark ? 'rgba(255,255,255,0.08)' : C.border,
    text:      isDark ? '#F1F5F9' : C.navy,
    secondary: isDark ? 'rgba(255,255,255,0.80)' : C.slate,
    muted:     isDark ? 'rgba(255,255,255,0.60)' : C.muted,
    footerBg:  isDark ? '#151E2A' : '#FAFCFF',
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', ...fontStyle }}>


      <header style={{ height: 52, flexShrink: 0, background: D.surfaceBg, borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', padding: '0 20px 0 24px', gap: 16, zIndex: 40 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: D.muted, fontWeight: 500 }}>
          <span>Radar</span>
          <span style={{ color: D.border }}>›</span>
          <span style={{ color: D.text, fontWeight: 700 }}>{tabLabel}</span>
        </div>


        <div style={{ display: 'flex', gap: 2, borderLeft: `1px solid ${C.border}`, paddingLeft: 16, marginLeft: 4 }}>
          {([
            { id: 'señales',    label: 'Señales',       Icon: Zap        },
            { id: 'tendencias', label: 'Tendencias',    Icon: Activity   },
            { id: 'escenarios', label: 'Escenarios',    Icon: Eye        },
            { id: 'cadena',     label: 'Cadena Causal', Icon: GitBranch  },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as RadarTab)}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                background: activeTab === tab.id ? C.tealBg : 'none',
                color: activeTab === tab.id ? C.teal : C.muted,
                fontFamily: 'inherit', transition: 'all .15s',
              }}
            >
              <tab.Icon size={12} />
              {tab.label}
              {!loadingData && tab.id !== 'cadena' && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 100, background: activeTab === tab.id ? C.teal : D.subtleBg, color: activeTab === tab.id ? 'white' : D.muted }}>
                  {tab.id === 'señales' ? signals.length : tab.id === 'tendencias' ? trends.length : scenarios.length}
                </span>
              )}
            </button>
          ))}
        </div>


        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 2, background: D.subtleBg, borderRadius: 9, padding: 3, border: `1px solid ${D.border}` }}>
            {(VIEWS_FOR_TAB[activeTab] || VIEWS_FOR_TAB['señales']).map(v => (
              <button
                key={v.id}
                title={v.label}
                onClick={() => handleViewChange(v.id)}
                style={{
                  width: 30, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', border: 'none', fontSize: 13, lineHeight: 1,
                  background: activeView === v.id ? D.surfaceBg : 'none',
                  boxShadow: activeView === v.id ? '0 1px 4px rgba(15,42,63,0.1)' : 'none',
                  color: activeView === v.id ? D.text : D.muted,
                  fontFamily: 'inherit', transition: 'all .15s',
                }}
              >
                {v.symbol}
              </button>
            ))}
          </div>
        </div>
      </header>


      {activeTab !== 'cadena' && <div style={{ background: D.surfaceBg, borderBottom: `1px solid ${D.border}`, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0, height: 48, overflow: 'visible' }}>


        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', background: D.subtleBg, border: `1.5px solid ${D.border}`, borderRadius: 8, minWidth: 170, marginRight: 12, flexShrink: 0, transition: 'border .15s' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={D.muted} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            type="text"
            placeholder={`Buscar ${activeTab}…`}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={{ border: 'none', outline: 'none', background: 'none', fontFamily: 'inherit', fontSize: 12, color: D.text, width: '100%' }}
          />
          {searchInput && (
            <button onClick={() => setSearchInput('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: D.muted, flexShrink: 0 }}>
              <X size={13} />
            </button>
          )}
        </div>


        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: D.muted, whiteSpace: 'nowrap', marginRight: 6, flexShrink: 0 }}>PESTEL</span>


        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {PESTEL_LIST.map(cat => {
            const selected = activePestelSet.has(cat);
            const cs = PESTEL_CHIP_STYLE[cat] || {};
            return (
              <button
                key={cat}
                onClick={() => togglePestel(cat)}
                style={selected
                  ? { padding: '4px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', flexShrink: 0, transition: 'all .15s', border: `1.5px solid ${cs.borderColor as string}`, background: cs.background as string, color: cs.color as string }
                  : { padding: '4px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', flexShrink: 0, transition: 'all .15s', border: `1.5px solid ${D.border}`, background: D.subtleBg, color: D.secondary, opacity: 0.45 }
                }
              >
                {cat}
              </button>
            );
          })}
        </div>


        <div style={{ width: 1, height: 24, background: D.border, flexShrink: 0, margin: '0 10px' }} />


        <div ref={sectorDropRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={e => {
              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
              setSectorDropPos({ top: rect.bottom + 6, left: rect.left });
              setSectorDropOpen(p => !p);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8,
              fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              border: `1.5px solid ${activeSectorSet.size > 0 ? C.teal : D.border}`,
              background: activeSectorSet.size > 0 ? C.tealBg : D.subtleBg,
              color: activeSectorSet.size > 0 ? C.teal : D.muted,
              transition: 'all .15s', whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px' }}>Sector</span>
            {activeSectorSet.size > 0 && (
              <span style={{ background: C.teal, color: 'white', borderRadius: 100, fontSize: 9, fontWeight: 700, padding: '1px 5px' }}>{activeSectorSet.size}</span>
            )}
            <ChevronDown size={11} style={{ transform: sectorDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
          </button>
          {sectorDropOpen && (
            <div style={{ position: 'fixed', top: sectorDropPos.top, left: sectorDropPos.left, background: D.surfaceBg, border: `1px solid ${D.border}`, borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', zIndex: 9999, padding: 12, width: 340, maxHeight: 300, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: D.muted }}>Filtrar por sector</span>
                {activeSectorSet.size > 0 && (
                  <button onClick={() => setActiveSectorSet(new Set())} style={{ fontSize: 10, fontWeight: 600, color: C.rose, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Limpiar</button>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {allSectors.map(sec => {
                  const on = activeSectorSet.has(sec);
                  return (
                    <button
                      key={sec}
                      onClick={() => toggleSector(sec)}
                      style={on
                        ? { padding: '4px 9px', borderRadius: 100, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', border: `1.5px solid ${C.teal}`, background: C.tealBg, color: C.teal, whiteSpace: 'nowrap' }
                        : { padding: '4px 9px', borderRadius: 100, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', border: `1.5px solid ${D.border}`, background: D.subtleBg, color: D.muted, whiteSpace: 'nowrap' }
                      }
                    >
                      {sec}
                    </button>
                  );
                })}
                {allSectors.length === 0 && <span style={{ fontSize: 11, color: D.muted, fontStyle: 'italic' }}>Sin sectores disponibles</span>}
              </div>
            </div>
          )}
        </div>


        <div ref={topicoDropRef} style={{ position: 'relative', flexShrink: 0, marginLeft: 8 }}>
          <button
            onClick={e => {
              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
              setTopicoDropPos({ top: rect.bottom + 6, left: rect.left });
              setTopicoDropOpen(p => !p);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8,
              fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              border: `1.5px solid ${activeTopicoSet.size > 0 ? '#6366f1' : D.border}`,
              background: activeTopicoSet.size > 0 ? '#eef2ff' : D.subtleBg,
              color: activeTopicoSet.size > 0 ? '#6366f1' : D.muted,
              transition: 'all .15s', whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px' }}>Tópico</span>
            {activeTopicoSet.size > 0 && (
              <span style={{ background: '#6366f1', color: 'white', borderRadius: 100, fontSize: 9, fontWeight: 700, padding: '1px 5px' }}>{activeTopicoSet.size}</span>
            )}
            <ChevronDown size={11} style={{ transform: topicoDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
          </button>
          {topicoDropOpen && (
            <div style={{ position: 'fixed', top: topicoDropPos.top, left: topicoDropPos.left, background: D.surfaceBg, border: `1px solid ${D.border}`, borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', zIndex: 9999, padding: 12, width: 340, maxHeight: 300, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: D.muted }}>Filtrar por tópico</span>
                {activeTopicoSet.size > 0 && (
                  <button onClick={() => setActiveTopicoSet(new Set())} style={{ fontSize: 10, fontWeight: 600, color: C.rose, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Limpiar</button>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {allTopicos.map(top => {
                  const on = activeTopicoSet.has(top);
                  return (
                    <button key={top} onClick={() => toggleTopico(top)}
                      style={on
                        ? { padding: '4px 9px', borderRadius: 100, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', border: '1.5px solid #6366f1', background: '#eef2ff', color: '#6366f1', whiteSpace: 'nowrap' }
                        : { padding: '4px 9px', borderRadius: 100, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', border: `1.5px solid ${D.border}`, background: D.subtleBg, color: D.muted, whiteSpace: 'nowrap' }
                      }>
                      {top}
                    </button>
                  );
                })}
                {allTopicos.length === 0 && <span style={{ fontSize: 11, color: D.muted, fontStyle: 'italic' }}>Sin tópicos disponibles</span>}
              </div>
            </div>
          )}
        </div>


        <button
          onClick={resetFilters}
          style={{ marginLeft: 'auto', flexShrink: 0, padding: '4px 11px', borderRadius: 100, fontSize: 11, fontWeight: 600, border: `1.5px solid ${D.border}`, color: D.muted, background: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all .15s' }}
          onMouseEnter={e => { const b = e.currentTarget; b.style.color = C.rose; b.style.border = `1.5px solid ${C.rose}`; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.color = D.muted; b.style.border = `1.5px solid ${D.border}`; }}
        >
          ✕ Limpiar
        </button>
      </div>}


      {activeTab !== 'cadena' && <div style={{ padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, whiteSpace: 'nowrap', marginRight: 2 }}>Acceso rápido</span>
        {([
          { id: 'urgentes',     label: '🔥 Urgentes' },
          { id: 'ia',           label: '🤖 IA' },
          { id: 'curricula',    label: '📚 Currícula' },
          { id: 'empleabilidad',label: '💼 Empleabilidad' },
        ] as const).map(q => (
          <button
            key={q.id}
            onClick={() => setQuickFilter(quickFilter === q.id ? 'todas' : q.id)}
            style={quickFilter === q.id
              ? { padding: '4px 12px', borderRadius: 100, fontSize: 11, fontWeight: 600, border: `1.5px solid ${C.teal}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', fontFamily: 'inherit', flexShrink: 0, transition: 'all .15s', background: '#CCFBF1', color: C.teal }
              : { padding: '4px 12px', borderRadius: 100, fontSize: 11, fontWeight: 600, border: `1.5px solid ${D.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', fontFamily: 'inherit', flexShrink: 0, transition: 'all .15s', background: D.surfaceBg, color: D.secondary }
            }
          >
            {q.label}
          </button>
        ))}
      </div>}


      {activeTab !== 'cadena' && <div style={{ padding: '4px 24px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: D.muted }}>
          <strong style={{ color: D.text, fontWeight: 700 }}>{loadingData ? '…' : sortedItems.length}</strong> {tabLabel.toLowerCase()} encontradas
        </span>
        <select
          value={sortOrder}
          onChange={e => setSortOrder(e.target.value as SortOrder)}
          style={{ padding: '5px 10px', border: `1.5px solid ${D.border}`, borderRadius: 7, fontFamily: 'inherit', fontSize: 11, color: D.text, background: D.surfaceBg, outline: 'none', cursor: 'pointer' }}
        >
          <option value="recientes">Más recientes</option>
          <option value="impacto">Mayor impacto</option>
          {activeTab === 'escenarios' && <option value="horizonte">Horizonte próximo</option>}
          <option value="az">A–Z</option>
        </select>
      </div>}


      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px', scrollbarWidth: 'thin' }}>
        {activeTab === 'cadena' ? (
          <div style={{ paddingTop: 16 }}>
            <CadenaView themeColors={themeColors} />
          </div>
        ) : loadingData ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', opacity: 0.5 }}>
            <Loader2 size={36} className="animate-spin" style={{ color: C.teal, marginBottom: 12 }} />
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.muted }}>Cargando datos…</p>
          </div>
        ) : loadError ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>⚠️</div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#F43F5E' }}>{loadError}</p>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Recarga la página o vuelve a iniciar sesión.</p>
          </div>
        ) : (
          <>

            {activeView === 'cards' && (
              <div>
                {sortedItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 60, color: D.muted }}>
                    <div style={{ fontSize: '2rem', marginBottom: 8 }}>{activePestelSet.size === 0 && activeSectorSet.size === 0 ? '🏷️' : '🔍'}</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{activePestelSet.size === 0 && activeSectorSet.size === 0 && activeTopicoSet.size === 0 ? 'Selecciona un filtro PESTEL, Sector o Tópico para explorar' : 'Sin resultados con estos filtros'}</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(268px,1fr))', gap: 12, paddingTop: 2 }}>
                    {sortedItems.map(item => {
                      const lvl = impactLevel(item.impact);
                      const plvl = item.probability !== undefined ? probLevel(item.probability) : null;
                      return (
                        <button
                          key={item.uuid}
                          onClick={() => handleOpenItem(item)}
                          style={{ background: D.surfaceBg, borderRadius: 13, overflow: 'hidden', border: `1.5px solid ${D.border}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', textAlign: 'left', transition: 'all .2s', fontFamily: 'inherit' }}
                          onMouseEnter={e => { const el = e.currentTarget; el.style.boxShadow = '0 8px 24px rgba(15,42,63,0.10)'; el.style.transform = 'translateY(-2px)'; el.style.borderColor = 'rgba(13,148,136,0.22)'; }}
                          onMouseLeave={e => { const el = e.currentTarget; el.style.boxShadow = 'none'; el.style.transform = 'translateY(0)'; el.style.borderColor = D.border; }}
                        >

                          <div style={{ height: 3, background: item.type === 'escenario' && plvl ? PROB_STRIPE[plvl] : IMP_STRIPE[impactLevel(item.impact)] }} />

                          <div style={{ padding: '13px 15px 11px', flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: D.text, lineHeight: 1.35, marginBottom: item.type === 'tendencia' && item.nombreTendencia && item.nombreTendencia !== item.title ? 2 : 6 }}>
                              {item.title}
                            </div>
                            {item.type === 'tendencia' && item.nombreTendencia && item.nombreTendencia !== item.title && (
                              <div style={{ fontSize: 10, fontWeight: 500, color: D.muted, lineHeight: 1.3, marginBottom: 6 }}>
                                {item.nombreTendencia}
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: D.secondary, lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}>
                              {item.excerpt}
                            </div>
                          </div>

                          {item.imageUrl ? (
                            <div style={{ padding: '0 12px 8px' }}>
                              <img src={item.imageUrl!} alt={item.title} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8 }} onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
                            </div>
                          ) : item.youtubeId ? (
                            <div style={{ padding: '0 12px 8px', position: 'relative' }}>
                              <img src={`https://img.youtube.com/vi/${item.youtubeId}/hqdefault.jpg`} alt={item.title} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8 }} onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
                              <div style={{ position: 'absolute', inset: '0 12px 8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.18)', borderRadius: 8 }}>
                                <PlayCircle size={24} style={{ color: 'white' }} />
                              </div>
                            </div>
                          ) : null}

                          <div style={{ padding: '8px 15px', borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: D.footerBg }}>
                            <span style={{ fontSize: 9, color: D.muted, fontWeight: 500 }}>{item.source || ''}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {item.type === 'escenario' && item.probability != null && plvl && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                  {[1,2,3,4,5].map(i => (
                                    <span key={i} style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: i <= item.probability! ? PROB_COLORS[plvl] : 'rgba(139,92,246,0.18)', flexShrink: 0 }} />
                                  ))}
                                </span>
                              )}
                              <span style={{ fontSize: 9, fontWeight: 700, color: C.teal, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expandir ↗</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}


            {activeView === 'tabla' && (
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
                <thead>
                  <tr>
                    {['Título', 'Categoría', 'Impacto', 'Horizonte', ''].map(h => (
                      <th key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: C.muted, padding: '5px 12px', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map(item => {
                    const lvl = impactLevel(item.impact);
                    const ts = PESTEL_TAG_STYLE[item.category] || { background: C.bg, color: C.slate };
                    const horizon = item.horizon || (item.urgency >= 70 ? 'Corto plazo' : item.urgency >= 40 ? 'Medio plazo' : 'Largo plazo');
                    const hColor = item.urgency >= 70 ? C.rose : item.urgency >= 40 ? C.amber : C.emerald;
                    return (
                      <tr key={item.uuid} onClick={() => handleOpenItem(item)}
                        style={{ background: C.white, cursor: 'pointer', transition: 'all .18s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.boxShadow = '0 4px 16px rgba(15,42,63,0.08)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.boxShadow = 'none'; }}
                      >
                        <td style={{ padding: '11px 12px 11px 16px', verticalAlign: 'middle', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, borderLeft: `1px solid ${C.border}`, borderRadius: '10px 0 0 10px' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.navy, marginBottom: 2 }}>{item.title}</div>
                          <div style={{ fontSize: 10, color: C.muted }}>{item.source}</div>
                        </td>
                        <td style={{ padding: '11px 12px', verticalAlign: 'middle', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '3px 8px', borderRadius: 100, ...ts }}>{item.category}</span>
                        </td>
                        <td style={{ padding: '11px 12px', verticalAlign: 'middle', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 56, height: 4, borderRadius: 2, background: 'rgba(15,42,63,0.07)' }}>
                              <div style={{ height: '100%', borderRadius: 2, width: `${item.impact}%`, background: IMP_COLORS[lvl] }} />
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: IMP_COLORS[lvl] }}>{item.impact}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '11px 12px', verticalAlign: 'middle', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 4, background: `${hColor}15`, color: hColor }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: hColor, display: 'block' }} />
                            {horizon}
                          </span>
                        </td>
                        <td style={{ padding: '11px 12px', verticalAlign: 'middle', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, borderRadius: '0 10px 10px 0' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={e => { e.stopPropagation(); handleOpenItem(item); }} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 10, fontWeight: 600, border: 'none', background: C.teal, color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>Ver</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedItems.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 13 }}>Sin resultados con los filtros activos</td></tr>
                  )}
                </tbody>
              </table>
            )}


            {activeView === 'matriz' && (
              <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1.5px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: C.muted }}>Matriz Impacto × Urgencia</span>
                  <span style={{ fontSize: 10, color: C.muted }}>Haz clic en una señal para ver detalles</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, minHeight: 380 }}>
                  {([
                    { key: 'planificar',  label: 'Planificar',  subtitle: 'alto impacto · largo plazo', items: matrizQuads.planificar,  bg: 'linear-gradient(135deg,#FFF7ED,#FED7AA)', border: '#FCA5A5', color: '#92400E' },
                    { key: 'actuar',      label: '¡Actuar ya!', subtitle: 'alto impacto · urgente',     items: matrizQuads.actuar,      bg: 'linear-gradient(135deg,#FFF0F2,#FFE4E6)', border: '#FCA5A5', color: '#9F1239' },
                    { key: 'monitorear',  label: 'Monitorear',  subtitle: 'bajo impacto · largo plazo', items: matrizQuads.monitorear,  bg: 'linear-gradient(135deg,#F0FDF4,#D1FAE5)', border: '#6EE7B7', color: '#065F46' },
                    { key: 'delegar',     label: 'Delegar',     subtitle: 'bajo impacto · urgente',     items: matrizQuads.delegar,     bg: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)', border: '#93C5FD', color: '#1E40AF' },
                  ]).map(q => (
                    <div key={q.key} style={{ borderRadius: 11, padding: 14, background: q.bg, border: `1.5px solid ${q.border}`, overflowY: 'auto', maxHeight: 280 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: q.color, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: q.color, display: 'block' }} />
                        {q.label} — {q.subtitle}
                      </div>
                      {q.items.map(item => (
                        <div key={item.uuid} onClick={() => handleOpenItem(item)}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 6, background: 'rgba(255,255,255,0.75)', borderRadius: 7, padding: '7px 9px', marginBottom: 5, fontSize: 11, fontWeight: 600, color: C.navy, cursor: 'pointer', transition: 'all .15s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'white'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.75)'; }}
                        >
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: q.color, flexShrink: 0, marginTop: 4 }} />
                          {item.title}
                        </div>
                      ))}
                      {q.items.length === 0 && <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', padding: '4px 0' }}>Sin elementos</div>}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted }}>← urgencia baja</span>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted }}>urgencia alta →</span>
                </div>
              </div>
            )}


            {activeView === 'cluster' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {clusterGroups.map(([cat, items]) => {
                  const isOpen = openClusters.has(cat);
                  const bg = CLUSTER_BG[cat] || C.bg;
                  const ts = PESTEL_TAG_STYLE[cat] || { background: C.bg, color: C.slate };
                  return (
                    <div key={cat} style={{ background: D.surfaceBg, borderRadius: 12, border: `1.5px solid ${D.border}`, overflow: 'hidden', transition: 'border-color .18s' }}>
                      <div
                        onClick={() => toggleCluster(cat)}
                        style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none', transition: 'background .15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = D.subtleBg; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                            {CLUSTER_EMOJI[cat] || '📌'}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: D.text }}>{cat}</div>
                            <div style={{ fontSize: 10, color: D.muted, marginTop: 1 }}>Dimensión {cat}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100, ...ts }}>{items.length} elementos</span>
                          <ChevronDown size={14} style={{ color: D.muted, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .22s' }} />
                        </div>
                      </div>
                      {isOpen && (
                        <div style={{ borderTop: `1px solid ${D.border}`, padding: '0 16px 14px' }}>
                          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 0 4px', scrollbarWidth: 'thin' }}>
                            {items.map(item => {
                              const lvl = impactLevel(item.impact);
                              return (
                                <div
                                  key={item.uuid}
                                  onClick={() => handleOpenItem(item)}
                                  style={{ minWidth: 190, maxWidth: 190, background: D.subtleBg, borderRadius: 9, padding: 11, border: `1.5px solid ${D.border}`, cursor: 'pointer', flexShrink: 0, transition: 'all .18s' }}
                                  onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = C.tealL; el.style.boxShadow = '0 2px 10px rgba(15,42,63,0.08)'; el.style.transform = 'translateY(-1px)'; }}
                                  onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = D.border; el.style.boxShadow = 'none'; el.style.transform = 'none'; }}
                                >
                                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: D.muted, marginBottom: 5 }}>{item.type} · {lvl}</div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: D.text, lineHeight: 1.35, marginBottom: 8 }}>{item.title}</div>
                                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(15,42,63,0.08)' }}>
                                    <div style={{ height: '100%', borderRadius: 2, width: `${item.impact}%`, background: IMP_COLORS[lvl] }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {clusterGroups.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: D.muted, fontSize: 13 }}>Sin resultados con los filtros activos</div>
                )}
              </div>
            )}


            {activeView === 'timeline' && (
              <div>
                {timelineGroups.map(([bucket, items]) => {
                  const bucketYear  = parseInt(bucket.slice(-4)) || 0;
                  const bucketColor = bucket === 'Sin fecha de artículo' ? D.muted : bucketYear >= 2026 ? C.rose : bucketYear >= 2024 ? C.amber : C.emerald;
                  return (
                    <div key={bucket} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 0, marginBottom: 4 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: bucketColor, opacity: bucket === 'Sin fecha de artículo' ? 0.35 : 0.7, padding: '16px 12px 0 0', textAlign: 'right', lineHeight: 1.2 }}>{bucket}</div>
                      <div style={{ borderLeft: `2px solid ${D.border}`, padding: '16px 0 16px 22px', position: 'relative' }}>
                        <span style={{ position: 'absolute', left: -7, top: 22, width: 12, height: 12, borderRadius: '50%', background: C.teal, boxShadow: `0 0 0 3px rgba(13,148,136,0.15)`, display: 'block' }} />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                          {items.map(item => {
                            const ts = PESTEL_TAG_STYLE[item.category] || { background: D.subtleBg, color: D.secondary };
                            return (
                              <div
                                key={item.uuid}
                                onClick={() => handleOpenItem(item)}
                                style={{ display: 'flex', alignItems: 'flex-start', gap: 7, background: D.surfaceBg, borderRadius: 9, padding: '8px 12px', border: `1.5px solid ${D.border}`, cursor: 'pointer', maxWidth: 280, transition: 'all .18s' }}
                                onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = '0 3px 10px rgba(15,42,63,0.08)'; el.style.transform = 'translateY(-1px)'; }}
                                onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = 'none'; el.style.transform = 'none'; }}
                              >
                                <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 4, ...ts, background: ts.color as string }} />
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: D.text, lineHeight: 1.3 }}>{item.title}</div>
                                  <div style={{ fontSize: 9, color: D.muted, marginTop: 2 }}>{item.source || item.category}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {timelineGroups.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: D.muted, fontSize: 13 }}>Sin resultados con los filtros activos</div>
                )}
              </div>
            )}
          </>
        )}
      </div>


      {selectedSignal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-xl" onClick={closeModal} />
          <div
            className="relative w-full max-w-[900px] max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl animate-in zoom-in-95 duration-500 custom-scrollbar"
            style={{ background: D.surfaceBg, borderColor: D.border, boxShadow: '0 40px 80px -20px rgba(0,0,0,0.5)' }}
          >

            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
              style={{ background: `linear-gradient(90deg, ${selectedSignal.color}, #38BDF8)` }} />


            <button onClick={closeModal} className="absolute top-4 right-4 z-10 p-2 rounded-full transition-colors"
              style={{ color: D.muted }}
              onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <X size={20} />
            </button>


            <div className="px-8 pt-7 pb-6 border-b" style={{ borderColor: D.border, background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(249,250,251,0.6)' }}>


              <div className="flex items-start gap-5">
                <span className="text-5xl flex-shrink-0 leading-none mt-1">{selectedSignal.emoji}</span>
                <div>
                  <h2 className="text-2xl font-black tracking-tight leading-snug mb-1.5" style={{ color: D.text }}>
                    {selectedType === 'tendencia' && selectedSignal.nombreTendencia ? selectedSignal.nombreTendencia : selectedSignal.title}
                  </h2>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: D.muted }}>ID: #{selectedSignal.id}</p>
                </div>
              </div>
            </div>


            <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">


              <div className="lg:col-span-2 space-y-6">
                {selectedType === 'tendencia' && (
                  <div>
                    <span className="block text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: D.muted }}>Nombre</span>
                    <p className="text-base font-bold" style={{ color: D.text }}>{selectedSignal.title}</p>
                  </div>
                )}
                <div>
                  <h5 className="text-[9px] font-black uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: D.muted }}>
                    <Info size={11} />
                    {selectedType === 'señal' ? 'Manifestación de la Señal' : selectedType === 'tendencia' ? 'Descripción de la Tendencia' : 'Descripción del Escenario'}
                  </h5>
                  {selectedType === 'señal' ? (
                    <p className="text-base font-medium leading-relaxed italic" style={{ color: D.text }}>"{selectedSignal.signalText}"</p>
                  ) : (
                    <div className="text-sm leading-relaxed [&_p]:mb-3 [&_p:last-child]:mb-0" style={{ color: D.text }}
                      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(selectedSignal.signalText) }} />
                  )}
                  {selectedType === 'señal' && (
                    <div className="mt-3">
                      <button onClick={handleToggleDescLarga} disabled={descLargaLoading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                        style={{ background: showDescLarga ? 'rgba(13,148,136,0.12)' : 'rgba(13,148,136,0.06)', color: '#0D9488', border: '1.5px solid rgba(13,148,136,0.25)' }}>
                        {descLargaLoading ? <Loader2 size={10} className="animate-spin" /> : <span className="material-symbols-outlined" style={{ fontSize: 12 }}>description</span>}
                        {showDescLarga ? 'Ocultar descripción' : 'Ver descripción larga'}
                      </button>
                      {showDescLarga && descLargaContent && (
                        <div className="mt-3 p-4 rounded-xl border text-sm leading-relaxed [&_p]:mb-2"
                          style={{ background: isDark ? 'rgba(13,148,136,0.04)' : '#f0fdfa', borderColor: 'rgba(13,148,136,0.2)', color: D.text }}
                          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(descLargaContent) }} />
                      )}
                      {showDescLarga && !descLargaContent && !descLargaLoading && (
                        <p className="mt-2 text-xs" style={{ color: D.muted }}>Sin descripción larga disponible.</p>
                      )}
                    </div>
                  )}
                </div>


                {selectedType !== 'señal' && (
                  <div className="flex items-center gap-2 py-1">
                    <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 15, color: D.muted }}>person</span>
                    <span className="text-xs font-black uppercase tracking-wide" style={{ color: D.muted }}>Autor:</span>
                    <span className="text-xs font-semibold" style={{ color: selectedSignal.autor ? D.text : D.muted }}>
                      {selectedSignal.autor || 'Sin autor registrado'}
                    </span>
                  </div>
                )}


                {selectedType === 'escenario' && selectedSignal.referencias && selectedSignal.referencias.length > 0 && (
                  <div className="p-4 rounded-xl border" style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(249,250,251,0.9)', borderColor: D.border }}>
                    <span className="block text-[9px] font-black uppercase tracking-widest mb-3" style={{ color: D.muted }}>Fuentes del Escenario</span>
                    <div className="space-y-2">
                      {selectedSignal.referencias.map((ref, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="material-symbols-outlined flex-shrink-0 mt-0.5" style={{ fontSize: 13, color: D.muted }}>link</span>
                          {ref.startsWith('http') ? (
                            <a href={ref} target="_blank" rel="noopener noreferrer"
                              className="text-xs font-medium hover:underline break-all"
                              style={{ color: '#2A9D8F' }}>{ref}</a>
                          ) : (
                            <span className="text-xs" style={{ color: D.text }}>{ref}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedSignal.youtubeId && (
                  <div className="aspect-video rounded-xl overflow-hidden bg-black shadow-lg">
                    <iframe className="w-full h-full"
                      src={`https://www.youtube.com/embed/${selectedSignal.youtubeId}`}
                      title="YouTube signal proof"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen />
                  </div>
                )}

                {selectedSignal.imageUrl && (
                  <div>
                    <h5 className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: D.muted }}>Evidencia Visual</h5>
                    <div className="rounded-xl overflow-hidden border" style={{ borderColor: D.border }}>
                      <img src={selectedSignal.imageUrl} alt="Evidencia visual" className="w-full object-cover max-h-64" />
                    </div>
                    <a href={selectedSignal.imageUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold hover:underline"
                      style={{ color: '#2A9D8F' }}>
                      <Eye size={11} /> Abrir en nueva pestaña
                    </a>
                  </div>
                )}
              </div>


              <div className="space-y-4">


                <div>
                  <span className="block text-[9px] font-black uppercase tracking-widest mb-3" style={{ color: D.muted }}>Clasificación</span>
                  <div className="space-y-3">
                    {selectedType !== 'señal' && selectedSignal.autor && (
                      <div>
                        <span className="block text-[10px] mb-1" style={{ color: D.muted }}>Autor</span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: D.text }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>person</span>
                          {selectedSignal.autor}
                        </span>
                      </div>
                    )}
                    {selectedSignal.sector && (
                      <div>
                        <span className="block text-[10px] mb-1" style={{ color: D.muted }}>Sector</span>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border"
                          style={{ background: isDark ? 'rgba(59,130,246,0.15)' : '#eff6ff', color: isDark ? '#93c5fd' : '#1d4ed8', borderColor: isDark ? 'rgba(59,130,246,0.3)' : '#bfdbfe' }}>
                          {selectedSignal.sector}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="block text-[10px] mb-1" style={{ color: D.muted }}>PESTEL</span>
                      <span className="inline-flex items-center px-3 py-1 rounded-lg border text-xs font-black uppercase tracking-wide"
                        style={{ borderColor: selectedSignal.color, color: selectedSignal.color, background: selectedSignal.color + '18' }}>
                        {selectedSignal.category}
                      </span>
                    </div>
                  </div>
                </div>


                {(selectedSignal.topico || (selectedSignal.topicosRelacionados && selectedSignal.topicosRelacionados.length > 0)) && (
                  <div>
                    {selectedSignal.topico && (
                      <div className="mb-2">
                        <span className="block text-[10px] mb-1.5" style={{ color: D.muted }}>
                          {selectedType === 'tendencia' ? 'Tópico Principal' : 'Tópico'}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold border"
                          style={{ borderColor: isDark ? 'rgba(20,184,166,0.4)' : '#99f6e4', background: isDark ? 'rgba(20,184,166,0.1)' : '#f0fdfa', color: isDark ? '#2dd4bf' : '#0d9488' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>label</span>
                          {selectedSignal.topico}
                        </span>
                      </div>
                    )}
                    {selectedSignal.topicosRelacionados && selectedSignal.topicosRelacionados.length > 0 && (
                      <div>
                        <span className="block text-[10px] mb-1.5" style={{ color: D.muted }}>Tópicos Secundarios</span>
                        <div className="flex flex-wrap gap-1">
                          {selectedSignal.topicosRelacionados.map(t => (
                            <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium border"
                              style={{ borderColor: isDark ? 'rgba(20,184,166,0.25)' : '#ccfbf1', background: isDark ? 'rgba(20,184,166,0.06)' : '#f0fdfa', color: isDark ? '#5eead4' : '#0f766e' }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 10 }}>sell</span>
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}


                {selectedType === 'escenario' && selectedSignal.probability != null && (
                  <div>
                    <span className="block text-[10px] mb-1.5" style={{ color: D.muted }}>Probabilidad de Ocurrencia</span>
                    <div className="flex items-center gap-2">
                      {[1,2,3,4,5].map(i => (
                        <span key={i} style={{
                          display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                          background: i <= selectedSignal.probability! ? PROB_COLORS[probLevel(selectedSignal.probability!)] : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
                          border: `1.5px solid ${i <= selectedSignal.probability! ? PROB_COLORS[probLevel(selectedSignal.probability!)] : 'transparent'}`,
                        }} />
                      ))}
                      <span className="text-xs font-black ml-1" style={{ color: PROB_COLORS[probLevel(selectedSignal.probability)] }}>
                        {selectedSignal.probability}/5 · {probLevel(selectedSignal.probability)}
                      </span>
                    </div>
                  </div>
                )}


                {selectedType === 'señal' && (() => {
                  const artDate = (selectedSignal as any).articleDate ?? null;
                  const dateStr = artDate;
                  return (
                    <div>
                      <span className="block text-[10px] mb-1" style={{ color: D.muted }}>Fecha del Artículo</span>
                      <div className="flex items-center gap-1.5" style={{ color: D.secondary }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>calendar_today</span>
                        <span className="text-xs font-semibold">
                          {dateStr
                            ? new Date(dateStr).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                            : 'Fecha no disponible'}
                        </span>
                      </div>
                    </div>
                  );
                })()}


                {(selectedSignal.source || selectedSignal.link) && (
                  <div className="p-4 rounded-xl border" style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(249,250,251,0.9)', borderColor: D.border }}>
                    <span className="block text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: D.muted }}>
                      {selectedType === 'escenario' ? 'Referencia' : 'Fuente Original'}
                    </span>
                    {selectedSignal.source && (
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: D.muted }}>article</span>
                        <span className="text-sm font-bold" style={{ color: D.text }}>{selectedSignal.source}</span>
                      </div>
                    )}
                    {selectedSignal.link && (
                      <a href={selectedSignal.link} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
                        style={{ color: '#2A9D8F' }}>
                        <Eye size={11} /> {selectedType === 'escenario' ? 'Ver referencia' : 'Visitar fuente'}
                      </a>
                    )}
                  </div>
                )}


                {selectedType !== 'tendencia' && (
                  <div className="rounded-xl border p-4 space-y-3"
                    style={{ borderColor: isDark ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.2)', background: isDark ? 'rgba(99,102,241,0.04)' : 'rgba(99,102,241,0.03)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Sparkles size={12} style={{ color: '#6366f1' }} />
                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#6366f1' }}>Métricas IA</span>
                      </div>
                      <div className="text-[9px] leading-relaxed" style={{ color: D.muted }}>
                        <span className="font-bold">Impacto (0-100):</span> afectación institucional/curricular si el fenómeno se materializa<br/>
                        <span className="font-bold">Urgencia (0-100):</span> velocidad con la que la institución debe actuar
                      </div>
                    </div>
                    {aiMetricsLoading ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: D.muted }}>
                        <Loader2 size={11} className="animate-spin" /> Analizando…
                      </span>
                    ) : aiMetrics ? (() => {
                      const lvl = impactLevel(aiMetrics.impact);
                      const ulvl = impactLevel(aiMetrics.urgency);
                      return (
                        <div className="flex gap-2 flex-wrap">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide"
                            style={{ background: IMP_COLORS[lvl] + '18', color: IMP_COLORS[lvl], border: `1.5px solid ${IMP_COLORS[lvl]}40` }}>
                            {lvl} Impacto · {aiMetrics.impact}
                          </span>
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide"
                            style={{ background: IMP_COLORS[ulvl] + '18', color: IMP_COLORS[ulvl], border: `1.5px solid ${IMP_COLORS[ulvl]}40` }}>
                            {ulvl} Urgencia · {aiMetrics.urgency}
                          </span>
                        </div>
                      );
                    })() : aiMetricsError ? (
                      <span className="text-[10px] leading-snug" style={{ color: '#F59E0B' }}>{aiMetricsError}</span>
                    ) : null}
                  </div>
                )}


                <div className="rounded-xl border overflow-hidden" style={{ borderColor: isDark ? 'rgba(42,157,143,0.25)' : 'rgba(42,157,143,0.2)' }}>
                  <div className="flex items-center gap-2 px-4 py-3 border-b"
                    style={{ background: isDark ? 'rgba(42,157,143,0.1)' : 'rgba(42,157,143,0.06)', borderColor: isDark ? 'rgba(42,157,143,0.2)' : 'rgba(42,157,143,0.15)' }}>
                    <Sparkles size={13} style={{ color: '#2A9D8F' }} />
                    <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#2A9D8F' }}>Análisis de Disrupción</span>
                  </div>
                  <div className="p-4" style={{ background: isDark ? 'rgba(42,157,143,0.04)' : '#fafffe' }}>
                    {aiAnalysis ? (
                      <div>
                        <div className="text-[11px] leading-relaxed max-h-52 overflow-y-auto custom-scrollbar space-y-1" style={{ color: D.secondary }}
                          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(aiAnalysis
                            .replace(/\*\*(.+?)\*\*/g, '<p class="text-[9px] font-black uppercase tracking-widest mt-3 mb-1 first:mt-0" style="color:#2A9D8F">$1</p>')
                            .replace(/^- (.+)$/gm, '<div class="flex gap-1.5 my-0.5"><span style="color:#2A9D8F;font-weight:900;flex-shrink:0">›</span><span>$1</span></div>')
                            .replace(/\n\n/g, '<div class="mt-1"></div>')
                            .replace(/\n/g, '')
                          ) }} />
                        <button onClick={() => { setAiAnalysis(null); setAiError(null); }}
                          className="mt-3 text-[9px] font-black uppercase tracking-widest hover:text-[#2A9D8F] transition-colors"
                          style={{ color: D.muted }}>
                          Limpiar
                        </button>
                      </div>
                    ) : (
                      <div className="text-center space-y-3">
                        <p className="text-[11px] leading-relaxed" style={{ color: D.secondary }}>
                          Proyecta riesgos de inacción y KPIs recomendados para este elemento.
                        </p>
                        {aiError && (
                          <p className="text-[10px] text-red-500 text-left">{aiError}</p>
                        )}
                        <button onClick={handleAiDeepDive} disabled={aiLoading}
                          className="w-full py-2.5 rounded-xl text-white font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50"
                          style={{ background: '#2A9D8F' }}>
                          {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                          <span>{aiLoading ? 'Procesando...' : 'Generar Análisis'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RadarView;
