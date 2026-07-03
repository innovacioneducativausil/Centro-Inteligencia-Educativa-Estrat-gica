import React, { useState, useMemo, useEffect, useRef } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Sparkles, Activity, Zap, ArrowRight, Eye, Loader2, Search, X } from 'lucide-react';
import { ThemeColors } from '../types';
import { getEstadisticas, getTendencias, getSenales, Estadisticas, ApiTrend, ApiSignal } from '../services/apiService';
import {
  generateScenarioMatrix, expandScenarioDetail,
  ScenarioMatrixData,
} from '../services/geminiService';

interface DashboardProps {
  themeColors: ThemeColors;
  setActiveView: (view: string) => void;
  setRadarTab: (tab: 'señales' | 'tendencias' | 'escenarios') => void;
  theme: 'light' | 'dark';
}

function makeTrend(total: number): { pv: number }[] {
  return Array.from({ length: 7 }, (_, i) => ({
    pv: Math.max(1, Math.round(total * (0.55 + i * 0.075))),
  }));
}

//----------------TI-06----------------
function tiempoRelativo(fecha: Date): string {
  const segundos = Math.floor((Date.now() - fecha.getTime()) / 1000);
  if (segundos < 60) return 'hace instantes';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return fecha.toLocaleString('es-PE');
}

function inlineBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} style={{ fontWeight: 700 }}>{part}</strong>
      : part
  );
}

function renderMd(text: string, mutedColor: string, _normalColor: string): React.ReactNode {
  return text.split('\n').map((line, i) => {
    const heading = line.match(/^\*\*(.+)\*\*\s*$/);
    if (heading) return (
      <p key={i} className="text-[10px] font-black uppercase tracking-widest mt-4 mb-1.5"
        style={{ color: '#10B981' }}>{heading[1]}</p>
    );
    if (line.startsWith('- ')) return (
      <li key={i} className="text-xs font-medium leading-relaxed ml-3 list-disc"
        style={{ color: mutedColor }}>{inlineBold(line.slice(2))}</li>
    );
    if (!line.trim()) return null;
    return (
      <p key={i} className="text-xs font-medium leading-relaxed"
        style={{ color: mutedColor }}>{inlineBold(line)}</p>
    );
  });
}

interface MatrixItem {
  uuid: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  type: 'señal' | 'tendencia';
}

function fromTrend(t: ApiTrend): MatrixItem {
  return { uuid: t.uuid, name: t.name, description: t.description, category: t.category, emoji: t.emoji, type: 'tendencia' };
}
function fromSignal(s: ApiSignal): MatrixItem {
  return { uuid: s.uuid, name: s.title, description: s.signalText, category: s.category, emoji: s.emoji, type: 'señal' };
}

type QuadrantKey = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

interface QuadrantCfg {
  key: QuadrantKey; label: string; icon: string; accent: string;
  bg: (d: boolean) => string; border: (d: boolean) => string;
}

const QUADRANT_CFG: QuadrantCfg[] = [
  { key: 'topLeft',    label: 'Escenario Posible',   icon: '⚡', accent: '#F59E0B',
    bg: d => d ? 'rgba(245,158,11,0.08)'  : 'rgba(245,158,11,0.06)',
    border: d => d ? 'rgba(245,158,11,0.30)'  : 'rgba(245,158,11,0.25)' },
  { key: 'topRight',   label: 'Escenario Probable',  icon: 'âœ¦',  accent: '#10B981',
    bg: d => d ? 'rgba(16,185,129,0.10)'  : 'rgba(16,185,129,0.07)',
    border: d => d ? 'rgba(16,185,129,0.35)'  : 'rgba(16,185,129,0.25)' },
  { key: 'bottomLeft', label: 'Escenario Absurdo',   icon: 'â—‰',  accent: '#64748B',
    bg: d => d ? 'rgba(100,116,139,0.10)' : 'rgba(100,116,139,0.06)',
    border: d => d ? 'rgba(100,116,139,0.30)' : 'rgba(100,116,139,0.20)' },
  { key: 'bottomRight', label: 'Escenario Plausible', icon: 'â†—',  accent: '#0EA5E9',
    bg: d => d ? 'rgba(14,165,233,0.09)'  : 'rgba(14,165,233,0.06)',
    border: d => d ? 'rgba(14,165,233,0.30)'  : 'rgba(14,165,233,0.20)' },
];

const MODULES = [
  {
    view: 'radar',
    icon: 'explore',
    title: 'Radar Tecnológico',
    desc: 'Visualiza el ciclo de adopción de tecnologías emergentes aplicadas al aula.',
    accent: '#002d72',
    accentBg: 'rgba(0,45,114,0.06)',
    tab: 'señales' as const,
  },
  {
    view: 'empleabilidad',
    icon: 'work_outline',
    title: 'Empleabilidad',
    desc: 'Gap analysis entre la oferta académica y la demanda laboral en tiempo real.',
    accent: '#006b58',
    accentBg: 'rgba(0,107,88,0.06)',
  },
  {
    view: 'impactos',
    icon: 'history_edu',
    title: 'Impacto Curricular',
    desc: 'Simulación de ajustes en mallas académicas frente a nuevas competencias requeridas.',
    accent: '#002d72',
    accentBg: 'rgba(0,45,114,0.06)',
  },
  {
    view: 'curricular',
    icon: 'dashboard',
    title: 'Malla Curricular',
    desc: 'Consola ejecutiva con KPIs de salud institucional y alertas de riesgo prospectivo.',
    accent: '#002d72',
    accentBg: '#002d72',
    isFeatured: true,
  },
  {
    view: 'mercadoLaboral',
    icon: 'query_stats',
    title: 'Mercado Laboral',
    desc: 'Informes técnicos por carrera con contraste entre demanda externa y empleabilidad USIL.',
    accent: '#00A3E0',
    accentBg: 'rgba(0,163,224,0.08)',
  },
];

const Dashboard: React.FC<DashboardProps> = ({ themeColors, setActiveView, setRadarTab }) => {
  const isDark = themeColors.bg.includes('950') || themeColors.bg.includes('slate-900');


  const C = {
    primary:            isDark ? '#b1c5ff' : '#001a48',
    primaryContainer:   '#002d72',
    secondary:          isDark ? '#38debb' : '#006b58',
    surface:            isDark ? '#0f172a'  : '#f7f9fc',
    surfaceContainer:   isDark ? '#1e293b'  : '#eceef1',
    surfaceContainerLow:isDark ? '#152032'  : '#f2f4f7',
    surfaceLowest:      isDark ? '#0f172a'  : '#ffffff',
    onSurface:          isDark ? '#e2e8f4'  : '#191c1e',
    onSurfaceVariant:   isDark ? '#94a3b8'  : '#444651',
    outlineVariant:     isDark ? 'rgba(255,255,255,0.10)' : 'rgba(196,198,210,0.6)',
  };


  const [stats, setStats]     = useState<Estadisticas | null>(null);
  const [loading, setLoading] = useState(true);

  //----------------TI-06----------------
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing]   = useState(false);

  const loadStats = React.useCallback((isManual = false) => {
    if (isManual) setRefreshing(true);
    return getEstadisticas()
      .then(s => { setStats(s); setLastUpdated(new Date()); })
      .catch(err => console.error('Dashboard stats:', err))
      .finally(() => { setLoading(false); if (isManual) setRefreshing(false); });
  }, []);

  useEffect(() => {
    loadStats();
    //----------------TI-06----------------
    const interval = setInterval(() => loadStats(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadStats]);


  const [searchType, setSearchType]                   = useState<'señal' | 'tendencia'>('señal');
  const [matrixQuery, setMatrixQuery]                 = useState('');
  const [matrixResults, setMatrixResults]             = useState<MatrixItem[]>([]);
  const [matrixDropdownOpen, setMatrixDropdownOpen]   = useState(false);
  const [matrixSelectedItems, setMatrixSelectedItems] = useState<MatrixItem[]>([]);
  const [matrixData, setMatrixData]                   = useState<ScenarioMatrixData | null>(null);
  const [matrixLoading, setMatrixLoading]             = useState(false);
  const [matrixError, setMatrixError]                 = useState<string | null>(null);
  const [matrixInfoOpen, setMatrixInfoOpen]           = useState(false);
  const matrixSearchTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownCloseTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);


  const [selectedQuadrant, setSelectedQuadrant]               = useState<QuadrantKey | null>(null);
  const [quadrantDetail, setQuadrantDetail]                   = useState<string | null>(null);
  const [quadrantDetailLoading, setQuadrantDetailLoading]     = useState(false);

  const handleInputFocus = () => {
    if (dropdownCloseTimer.current) clearTimeout(dropdownCloseTimer.current);
    if (matrixResults.length > 0) setMatrixDropdownOpen(true);
  };
  const handleInputBlur = () => {
    dropdownCloseTimer.current = setTimeout(() => setMatrixDropdownOpen(false), 150);
  };

  const handleMatrixSearch = (q: string) => {
    setMatrixQuery(q);
    if (matrixSearchTimer.current) clearTimeout(matrixSearchTimer.current);
    if (!q.trim()) { setMatrixResults([]); setMatrixDropdownOpen(false); return; }
    matrixSearchTimer.current = setTimeout(() => {
      const ql = q.toLowerCase();
      const fetch = searchType === 'tendencia'
        ? getTendencias({ q }).then(r => r.data.filter(t => t.name.toLowerCase().includes(ql)).slice(0, 8).map(fromTrend))
        : getSenales({ q }).then(r => r.data.filter(s => s.title.toLowerCase().includes(ql)).slice(0, 8).map(fromSignal));
      fetch
        .then(items => { setMatrixResults(items); setMatrixDropdownOpen(true); })
        .catch(() => setMatrixResults([]));
    }, 300);
  };

  const selectItem = (item: MatrixItem) => {
    if (dropdownCloseTimer.current) clearTimeout(dropdownCloseTimer.current);
    setMatrixSelectedItems(prev => prev.find(i => i.uuid === item.uuid) ? prev : [...prev, item]);
    setMatrixQuery('');
    setMatrixResults([]);
    setMatrixDropdownOpen(false);
    setMatrixData(null);
    setMatrixError(null);
    setSelectedQuadrant(null);
    setQuadrantDetail(null);
  };

  const removeItem = (uuid: string) => {
    setMatrixSelectedItems(prev => prev.filter(i => i.uuid !== uuid));
    setMatrixData(null);
    setSelectedQuadrant(null);
    setQuadrantDetail(null);
  };

  const handleSearchTypeChange = (type: 'tendencia' | 'señal') => {
    setSearchType(type);
    setMatrixQuery('');
    setMatrixResults([]);
    setMatrixSelectedItems([]);
    setMatrixData(null);
    setSelectedQuadrant(null);
    setQuadrantDetail(null);
    setMatrixDropdownOpen(false);
  };

  const handleGenerateMatrix = async () => {
    if (!matrixSelectedItems.length) return;
    setMatrixLoading(true);
    setMatrixError(null);
    setSelectedQuadrant(null);
    setQuadrantDetail(null);
    try {
      const data = await generateScenarioMatrix(
        matrixSelectedItems.map(i => ({ name: i.name, description: i.description, category: i.category, type: i.type }))
      );
      setMatrixData(data);
    } catch (e: any) {
      setMatrixError(e.message || 'Error al generar la matriz');
    } finally {
      setMatrixLoading(false);
    }
  };

  const handleSelectQuadrant = async (key: QuadrantKey, cfg: QuadrantCfg) => {
    if (!matrixData || !matrixSelectedItems.length) return;
    setSelectedQuadrant(key);
    setQuadrantDetail(null);
    setQuadrantDetailLoading(true);
    const cell = matrixData[key] as { title: string; description: string };
    const combinedName = matrixSelectedItems.map(i => i.name).join(' + ');
    try {
      const detail = await expandScenarioDetail(combinedName, cfg.label, cell);
      setQuadrantDetail(detail);
    } catch (e: any) {
      setQuadrantDetail(`Error: ${e.message}`);
    } finally {
      setQuadrantDetailLoading(false);
    }
  };


  const kpiCards = useMemo(() => {
    if (!stats) return null;
    const { kpis } = stats;
    return [
      { title: 'Señales Activas',   value: kpis.senales,    change: `+${kpis.senalesMes} este mes`,  trend: makeTrend(kpis.senales),    icon: Zap,      accentColor: '#0EA5E9', onClick: () => { setRadarTab('señales');    setActiveView('radar'); } },
      { title: 'Tendencias',        value: kpis.tendencias, change: `${kpis.pesteles} categorías`,   trend: makeTrend(kpis.tendencias), icon: Activity, accentColor: '#F59E0B', onClick: () => { setRadarTab('tendencias'); setActiveView('radar'); } },
      { title: 'Escenarios',        value: kpis.escenarios, change: `${kpis.sectores} sectores`,     trend: makeTrend(kpis.escenarios), icon: Eye,      accentColor: '#10B981', onClick: () => { setRadarTab('escenarios'); setActiveView('radar'); } },
      { title: 'Analistas Activos', value: kpis.usuarios,   change: 'en plataforma',                 trend: makeTrend(kpis.usuarios),   icon: Sparkles, accentColor: '#A855F7', onClick: undefined },
    ];
  }, [stats, setActiveView, setRadarTab]);


  const normalText  = C.onSurface;
  const mutedText   = C.onSurfaceVariant;
  const solidCardBg = C.surfaceLowest;
  const dropdownBg  = isDark ? '#1e293b' : '#ffffff';
  const dropdownBdr = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  const inputStyle: React.CSSProperties = {
    background:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
    border:       `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'}`,
    color:        normalText,
    borderRadius: '0.875rem',
    padding:      '0.625rem 1rem 0.625rem 2.5rem',
    width:        '100%',
    fontSize:     '0.875rem',
    fontWeight:   '600',
    outline:      'none',
  };


  const KpiCard = ({ title, value, change, trend, icon: Icon, accentColor, onClick }: any) => (
    <div
      onClick={onClick}
      className={`relative p-5 rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg group overflow-hidden ${onClick ? 'cursor-pointer' : ''}`}
      style={{ background: solidCardBg, border: `1px solid ${C.outlineVariant}` }}
    >
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ background: accentColor }} />
      <div className="absolute inset-0 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 15% 15%, ${accentColor}, transparent 65%)` }} />
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="p-2.5 rounded-xl flex items-center justify-center" style={{ background: `${accentColor}18` }}>
          <Icon style={{ color: accentColor }} className="w-4 h-4" />
        </div>
        <div className="w-20 h-9">
          <ResponsiveContainer>
            <LineChart data={trend}>
              <Line type="monotone" dataKey="pv" stroke={accentColor} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="relative z-10">
        <p className="text-[9px] font-black mb-1 uppercase tracking-[0.18em]" style={{ color: mutedText }}>{title}</p>
        <div className="flex items-baseline space-x-2">
          <h4 className="text-2xl font-black tracking-tight" style={{ color: normalText }}>{loading ? '—' : value}</h4>
          <span className="text-[10px] font-bold" style={{ color: accentColor }}>{change}</span>
        </div>
      </div>
      {onClick && (
        <div className="mt-3 flex items-center space-x-1 text-[9px] font-black uppercase tracking-widest relative z-10" style={{ color: accentColor }}>
          <span>Ver Detalles</span>
          <ArrowRight size={9} className="group-hover:translate-x-1 transition-transform" />
        </div>
      )}
    </div>
  );

  return (
    <div className="animate-in fade-in duration-700">


      <section
        className="relative px-8 py-20 overflow-hidden"
        style={{ background: C.surface }}
      >

        <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(0,107,88,0.07), transparent 65%)' }} />
        <div className="absolute -bottom-24 -left-16 w-96 h-96 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(0,26,72,0.05), transparent 65%)' }} />

        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">


          <div className="z-10">
            <span
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-6"
              style={{ background: 'rgba(0,107,88,0.10)', color: C.secondary, border: '1px solid rgba(0,107,88,0.20)' }}
            >
              <Sparkles size={9} /> Strategic Observatory v4.0
            </span>

            <h1
              className="text-5xl lg:text-[3.75rem] font-extrabold leading-[1.1] mb-6 tracking-tight"
              style={{ fontFamily: "'Manrope', 'Bricolage Grotesque', sans-serif", color: C.primary }}
            >
              Anticipa el futuro para{' '}
              <span style={{ color: C.secondary }}>
                transformar la educación
              </span>{' '}
              hoy.
            </h1>

            <p className="text-lg leading-relaxed mb-10 max-w-xl" style={{ color: C.onSurfaceVariant }}>
              Nuestra inteligencia curada permite a líderes institucionales detectar señales tempranas,
              modelar escenarios prospectivos y optimizar el impacto curricular con precisión estratégica.
            </p>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => { setRadarTab('señales'); setActiveView('radar'); }}
                className="flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-sm transition-all hover:shadow-xl hover:-translate-y-0.5"
                style={{ background: '#002d72', color: '#ffffff' }}
              >
                Comenzar Análisis Prospectivo
                <span className="material-symbols-outlined text-base" style={{ fontSize: '18px' }}>trending_up</span>
              </button>
              <button
                onClick={() => setActiveView('informes')}
                className="flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-sm transition-all hover:-translate-y-0.5"
                style={{ background: solidCardBg, color: C.primary, border: `1px solid ${C.outlineVariant}` }}
              >
                Ver Reporte de Impacto
              </button>
            </div>
          </div>


          <div className="relative hidden lg:block">

            <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full pointer-events-none"
              style={{ background: 'rgba(0,107,88,0.10)', filter: 'blur(80px)' }} />


            <div
              className="relative z-10 p-6 rounded-[2rem] shadow-2xl"
              style={{ background: solidCardBg, border: `1px solid ${C.outlineVariant}` }}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: C.onSurfaceVariant }}>
                    Estado en Tiempo Real
                  </p>
                  <h3
                    className="text-lg font-extrabold"
                    style={{ fontFamily: "'Manrope', sans-serif", color: C.primary }}
                  >
                    Observatorio Activo
                  </h3>
                </div>
                <div className="w-2.5 h-2.5 rounded-full animate-pulse-dot" style={{ background: '#22c55e' }} />
              </div>


              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: 'Señales',    value: stats?.kpis.senales,    icon: 'sensors',    color: '#0EA5E9' },
                  { label: 'Tendencias', value: stats?.kpis.tendencias, icon: 'trending_up', color: '#F59E0B' },
                  { label: 'Escenarios', value: stats?.kpis.escenarios, icon: 'view_in_ar', color: '#10B981' },
                  { label: 'Analistas',  value: stats?.kpis.usuarios,   icon: 'group',      color: '#A855F7' },
                ].map(({ label, value, icon, color }) => (
                  <div key={label} className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: C.surfaceContainer }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}18` }}>
                      <span className="material-symbols-outlined" style={{ color, fontSize: '16px' }}>{icon}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider truncate" style={{ color: C.onSurfaceVariant }}>{label}</p>
                      <p className="text-xl font-extrabold leading-none mt-0.5" style={{ color: C.onSurface }}>
                        {loading ? '—' : (value ?? '—')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>


              <div className="p-4 rounded-2xl" style={{ background: 'linear-gradient(135deg, #001a48, #002d72)' }}>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1.5">Insight del Mes</p>
                <p className="text-xs text-white/90 leading-relaxed">
                  {stats
                    ? `+${stats.kpis.senalesMes} nuevas señales en el último mes sobre ${stats.kpis.pesteles} categorías PESTEL.`
                    : 'Cargando inteligencia estratégica…'}
                </p>
              </div>
            </div>


            <div
              className="absolute -bottom-5 -left-6 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl z-20"
              style={{ background: isDark ? '#1e293b' : '#ffffff' }}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(0,107,88,0.15)' }}>
                <span className="material-symbols-outlined" style={{ color: '#006b58', fontSize: '20px', fontVariationSettings: "'FILL' 1" }}>insights</span>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: C.onSurfaceVariant }}>Señales Activas</p>
                <p className="text-xl font-extrabold leading-none mt-0.5" style={{ color: C.primary }}>
                  {loading ? '—' : (stats?.kpis.senales ?? '—')}
                </p>
              </div>
            </div>
          </div>

        </div>
      </section>


      <section
        className="py-20 px-8"
        style={{ background: C.surfaceContainer }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2
              className="text-3xl lg:text-4xl font-extrabold mb-3"
              style={{ fontFamily: "'Manrope', 'Bricolage Grotesque', sans-serif", color: C.primary }}
            >
              Metodología de Inteligencia
            </h2>
            <p className="max-w-2xl mx-auto" style={{ color: C.onSurfaceVariant }}>
              Un flujo de trabajo optimizado para transformar datos brutos en decisiones institucionales de alto impacto.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { n: '01', title: 'Detectar',    desc: 'Escaneo global de señales débiles y tendencias emergentes en el sector educativo y laboral.',            icon: 'radar' },
              { n: '02', title: 'Categorizar', desc: 'Clasificación taxonómica mediante IA para identificar relevancia, urgencia y dominios afectados.',       icon: 'category' },
              { n: '03', title: 'Proyectar',   desc: 'Modelado de escenarios prospectivos para anticipar disrupciones y oportunidades de mercado.',            icon: 'query_stats' },
              { n: '04', title: 'Actuar',      desc: 'Implementación de ajustes curriculares y alianzas estratégicas basadas en evidencia.',                   icon: 'rocket_launch', accent: true },
            ].map(step => (
              <div
                key={step.n}
                className="p-8 rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg group"
                style={{
                  background: solidCardBg,
                  border: step.accent ? '2px solid rgba(0,107,88,0.25)' : `1px solid ${C.outlineVariant}`,
                }}
              >
                <div className="text-4xl font-black mb-5" style={{ color: 'rgba(0,107,88,0.15)' }}>{step.n}</div>
                <h3
                  className="text-xl font-bold mb-3"
                  style={{ fontFamily: "'Manrope', sans-serif", color: C.primary }}
                >{step.title}</h3>
                <p className="text-sm leading-relaxed mb-5" style={{ color: C.onSurfaceVariant }}>{step.desc}</p>
                <span className="material-symbols-outlined text-3xl" style={{ color: C.secondary }}>{step.icon}</span>
              </div>
            ))}
          </div>
        </div>
      </section>


      <section className="py-14 px-8" style={{ background: C.surface }}>
        <div className="max-w-7xl mx-auto">
          {/*----------------TI-06----------------*/}
          <div className="flex items-center justify-end gap-2 mb-3">
            <span className="text-[11px] font-semibold" style={{ color: mutedText }}>
              {lastUpdated ? `Actualizado ${tiempoRelativo(lastUpdated)}` : 'Actualizando...'}
            </span>
            <button
              onClick={() => loadStats(true)}
              disabled={refreshing}
              title="Actualizar indicadores"
              className="p-1 rounded-lg transition-colors"
              style={{ color: mutedText, cursor: refreshing ? 'default' : 'pointer' }}
            >
              <span className={`material-symbols-outlined text-[16px] ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {kpiCards ? kpiCards.map(card => (
              <KpiCard key={card.title} {...card} />
            )) : (
              [1, 2, 3, 4].map(i => (
                <div key={i} className="p-5 rounded-2xl" style={{ background: solidCardBg, border: `1px solid ${C.outlineVariant}` }}>
                  <div className="animate-pulse space-y-3">
                    <div className="h-8 w-8 rounded-xl" style={{ background: C.surfaceContainer }} />
                    <div className="h-7 w-20 rounded" style={{ background: C.surfaceContainer }} />
                    <div className="h-3 w-28 rounded" style={{ background: C.surfaceContainerLow }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>


      <section className="py-16 px-8" style={{ background: C.surfaceContainerLow }}>
        <div className="max-w-7xl mx-auto">

          <div className="flex items-end justify-between mb-8">
            <div>
              <h2
                className="text-3xl font-extrabold mb-1"
                style={{ fontFamily: "'Manrope', 'Bricolage Grotesque', sans-serif", color: C.primary }}
              >
                Matriz de Escenarios Futuros
              </h2>
              <p style={{ color: C.onSurfaceVariant }}>Priorización estratégica basada en incertidumbre e impacto.</p>
            </div>
            <span
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: '#059669' }}
            >
              <Sparkles size={9} /> IA Generativa
            </span>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">


            <div className="lg:col-span-2">
              <div
                className="p-7 rounded-3xl relative"
                style={{ background: solidCardBg, border: `1px solid ${C.outlineVariant}` }}
              >

                <div className="absolute inset-0 pointer-events-none rounded-3xl"
                  style={{ background: 'radial-gradient(ellipse at top right, rgba(16,185,129,0.06), transparent 55%)' }} />


                <div className="flex items-center gap-2 mb-1 relative">
                  <p className="text-sm font-semibold" style={{ color: mutedText }}>
                    Selecciona una o más {searchType === 'tendencia' ? 'tendencias' : 'señales'} para que la IA genere los 4 escenarios posibles.
                  </p>
                  <div className="relative" style={{ display: 'inline-flex', flexShrink: 0 }}>
                    <button
                      onClick={() => setMatrixInfoOpen(v => !v)}
                      className="flex items-center justify-center rounded-full transition-colors"
                      style={{
                        width: 20, height: 20,
                        background: matrixInfoOpen ? 'rgba(16,185,129,0.15)' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                        color: '#6b7280',
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 900, lineHeight: 1 }}>i</span>
                    </button>
                    {matrixInfoOpen && (
                      <div
                        className="absolute z-50 top-7 left-1/2 -translate-x-1/2 rounded-xl border shadow-xl p-4"
                        style={{ width: 260, background: dropdownBg, borderColor: 'rgba(16,185,129,0.25)', color: mutedText }}
                      >
                        <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#10B981' }}>¿Qué es la Matriz de Escenarios?</p>
                        <p className="text-[11px] leading-relaxed">Visualiza cómo podría desarrollarse el futuro al representar dos incertidumbres críticas en ejes perpendiculares, formando <strong>cuatro escenarios distintos</strong>.</p>
                      </div>
                    )}
                  </div>
                </div>


                <div className="flex gap-2 mb-3 mt-4">
                  {(['señal', 'tendencia'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => handleSearchTypeChange(type)}
                      className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
                      style={{
                        background: searchType === type ? C.secondary    : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                        color:      searchType === type ? 'white'         : mutedText,
                        border:     searchType === type ? 'none'          : `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
                      }}
                    >
                      {type === 'tendencia' ? '📈 Tendencia' : '⚡ Señal'}
                    </button>
                  ))}
                </div>


                <div className="flex gap-3 mb-4 relative z-20">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: mutedText }} />
                    <input
                      value={matrixQuery}
                      onChange={e => handleMatrixSearch(e.target.value)}
                      onFocus={handleInputFocus}
                      onBlur={handleInputBlur}
                      placeholder={searchType === 'tendencia' ? 'Buscar tendencia estratégica…' : 'Buscar señal de cambio…'}
                      style={inputStyle}
                    />
                    {matrixDropdownOpen && matrixResults.length > 0 && (
                      <div
                        className="absolute top-full left-0 right-0 mt-1 rounded-2xl shadow-2xl"
                        style={{ background: dropdownBg, border: `1px solid ${dropdownBdr}`, zIndex: 9999 }}
                      >
                        {matrixResults.map(t => (
                          <button
                            key={t.uuid}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => selectItem(t)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                            style={{ color: normalText }}
                            onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span className="text-lg leading-none">{t.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate">{t.name}</p>
                              <p className="text-[10px] font-medium truncate" style={{ color: mutedText }}>{t.category}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleGenerateMatrix}
                    disabled={!matrixSelectedItems.length || matrixLoading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-black uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    style={{
                      background: matrixSelectedItems.length && !matrixLoading ? C.secondary : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                      color:      matrixSelectedItems.length && !matrixLoading ? 'white'       : normalText,
                    }}
                  >
                    {matrixLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    <span>Generar</span>
                  </button>
                </div>


                {matrixSelectedItems.length > 0 && (
                  <div className="flex items-start gap-2 mb-4 flex-wrap">
                    <span className="text-[9px] font-black uppercase tracking-widest mt-2" style={{ color: mutedText }}>Analizando:</span>
                    {matrixSelectedItems.map(item => (
                      <div key={item.uuid} className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold"
                        style={{ background: isDark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.08)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)' }}>
                        <span>{item.emoji}</span>
                        <span className="max-w-xs truncate">{item.name}</span>
                        <button onClick={() => removeItem(item.uuid)} className="ml-1 hover:opacity-70 transition-opacity">
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}


                {matrixError && (
                  <div className="mb-4 px-4 py-3 rounded-2xl text-sm font-bold"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#dc2626' }}>
                    {matrixError}
                  </div>
                )}


                {matrixLoading && (
                  <div className="py-10 flex flex-col items-center gap-3" style={{ color: mutedText }}>
                    <Loader2 size={28} className="animate-spin" style={{ color: '#10B981' }} />
                    <p className="text-sm font-bold">Generando escenarios…</p>
                  </div>
                )}


                {matrixData && !matrixLoading && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                    <div className="lg:col-span-2">
                      <div className="flex justify-center mb-3">
                        <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full"
                          style={{ background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: mutedText }}>
                          â†‘ {matrixData.driver2} (alto)
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {QUADRANT_CFG.map(q => {
                          const cell = matrixData[q.key] as { title: string; description: string };
                          const isSel = selectedQuadrant === q.key;
                          return (
                            <div
                              key={q.key}
                              onClick={() => handleSelectQuadrant(q.key, q)}
                              className="p-5 rounded-2xl cursor-pointer transition-transform hover:scale-[1.02]"
                              style={{
                                background: q.bg(isDark),
                                border: `1.5px solid ${isSel ? q.accent : q.border(isDark)}`,
                                outline: isSel ? `2px solid ${q.accent}40` : 'none',
                                outlineOffset: '2px',
                              }}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-base">{q.icon}</span>
                                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: q.accent }}>{q.label}</span>
                              </div>
                              <h4 className="text-sm font-black mb-1.5" style={{ color: normalText }}>{cell.title}</h4>
                              <p className="text-xs leading-relaxed font-medium" style={{ color: mutedText }}>{cell.description}</p>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-center">
                        <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full"
                          style={{ background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: mutedText }}>
                          â†“ {matrixData.driver2} (bajo) Â· â† {matrixData.driver1} bajo Â· {matrixData.driver1} alto â†’
                        </span>
                      </div>
                    </div>


                    <div
                      className="lg:col-span-1 rounded-2xl p-5 flex flex-col"
                      style={{
                        background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
                        border:     `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
                        minHeight:  240,
                      }}
                    >
                      {quadrantDetailLoading ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: mutedText }}>
                          <Loader2 size={22} className="animate-spin" style={{ color: '#10B981' }} />
                          <p className="text-xs font-bold">Expandiendo escenario…</p>
                        </div>
                      ) : quadrantDetail && selectedQuadrant ? (() => {
                        const q = QUADRANT_CFG.find(c => c.key === selectedQuadrant)!;
                        const cell = matrixData[selectedQuadrant] as { title: string; description: string };
                        return (
                          <div className="animate-in fade-in duration-500">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xl">{q.icon}</span>
                              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: q.accent }}>{q.label}</span>
                            </div>
                            <h4 className="text-sm font-black mb-3" style={{ color: normalText }}>{cell.title}</h4>
                            <div className="text-xs space-y-0.5">
                              {renderMd(quadrantDetail, mutedText, normalText)}
                            </div>
                          </div>
                        );
                      })() : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-4" style={{ color: mutedText }}>
                          <span className="text-3xl opacity-30">â†™</span>
                          <p className="text-xs font-bold">Presiona un cuadrante</p>
                          <p className="text-[10px] font-medium opacity-70 leading-relaxed">La IA expandirá el escenario con implicaciones y acciones recomendadas.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}


                {!matrixData && !matrixLoading && (
                  <div className="py-10 flex flex-col items-center text-center" style={{ color: mutedText }}>
                    <div className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center text-3xl"
                      style={{ background: isDark ? 'rgba(0,107,88,0.08)' : 'rgba(0,107,88,0.06)' }}>âŠž</div>
                    <p className="text-sm font-bold mb-1">Selecciona una o más {searchType === 'tendencia' ? 'tendencias' : 'señales'}</p>
                    <p className="text-xs font-medium opacity-70">La IA identificará los ejes de incertidumbre clave y generará 4 escenarios posibles.</p>
                  </div>
                )}
              </div>
            </div>


            <div
              className="flex flex-col gap-6 p-7 rounded-3xl h-fit"
              style={{ background: 'linear-gradient(175deg, #001a48 0%, #002d72 100%)', color: '#ffffff' }}
            >
              <div>
                <h3
                  className="text-2xl font-bold mb-5"
                  style={{ fontFamily: "'Manrope', 'Bricolage Grotesque', sans-serif" }}
                >
                  Estado Global
                </h3>
                <div className="space-y-3">
                  {[
                    { icon: 'sensors',    label: 'Señales Monitoreadas', value: stats?.kpis.senales,    color: '#38BDF8' },
                    { icon: 'trending_up', label: 'Mega-Tendencias',      value: stats?.kpis.tendencias, color: '#34D399' },
                    { icon: 'view_in_ar', label: 'Escenarios Activos',   value: stats?.kpis.escenarios, color: '#A78BFA' },
                  ].map(({ icon, label, value, color }) => (
                    <div key={label}
                      className="flex items-center justify-between p-4 rounded-2xl"
                      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}>
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-xl" style={{ color }}>{icon}</span>
                        <span className="text-sm font-medium text-white/85">{label}</span>
                      </div>
                      <span className="text-xl font-bold">{loading ? '—' : (value ?? '—')}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-5 rounded-3xl" style={{ background: 'linear-gradient(135deg, rgba(0,107,88,0.9), rgba(0,71,58,0.95))' }}>
                <h4 className="font-bold text-base mb-2">Insight Destacado</h4>
                <p className="text-xs text-white/85 leading-relaxed mb-4">
                  {stats
                    ? `La demanda de señales en ${stats.kpis.pesteles} categorías PESTEL ha crecido significativamente. +${stats.kpis.senalesMes} señales incorporadas este mes.`
                    : 'Cargando inteligencia estratégica…'}
                </p>
                <button
                  onClick={() => setActiveView('radar')}
                  className="w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all hover:opacity-90"
                  style={{ background: '#ffffff', color: '#001a48' }}
                >
                  Ver Análisis de Impacto
                  <span className="material-symbols-outlined text-sm" style={{ fontSize: '16px' }}>arrow_forward</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </section>


      <section className="py-20 px-8" style={{ background: C.surfaceContainer }}>
        <div className="max-w-7xl mx-auto">
          <div className="mb-10">
            <h2
              className="text-3xl font-extrabold mb-2"
              style={{ fontFamily: "'Manrope', 'Bricolage Grotesque', sans-serif", color: C.primary }}
            >
              Módulos Estratégicos
            </h2>
            <p style={{ color: C.onSurfaceVariant }}>
              Herramientas especializadas para la gestión del conocimiento institucional.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {MODULES.map(mod => (
              <div
                key={mod.view}
                onClick={() => { if (mod.tab) setRadarTab(mod.tab); setActiveView(mod.view); }}
                className="p-7 rounded-3xl cursor-pointer group transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
                style={{
                  background: solidCardBg,
                  border: mod.isFeatured ? `2px solid rgba(0,45,114,0.20)` : `1px solid ${C.outlineVariant}`,
                }}
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 transition-all duration-300"
                  style={{
                    background:  mod.isFeatured ? '#002d72' : mod.accentBg,
                    color:       mod.isFeatured ? '#ffffff' : mod.accent,
                  }}
                >
                  <span
                    className="material-symbols-outlined text-3xl"
                    style={{
                      fontSize: '28px',
                      fontVariationSettings: mod.isFeatured ? "'FILL' 1" : "'FILL' 0",
                    }}
                  >{mod.icon}</span>
                </div>
                <h3
                  className="text-lg font-bold mb-2"
                  style={{ fontFamily: "'Manrope', sans-serif", color: C.primary }}
                >{mod.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: C.onSurfaceVariant }}>{mod.desc}</p>
                <div
                  className="mt-4 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: mod.accent }}
                >
                  <span>Abrir módulo</span>
                  <ArrowRight size={10} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      <section className="px-8 py-20" style={{ background: C.surface }}>
        <div className="max-w-7xl mx-auto">
          <div
            className="relative rounded-[3rem] p-12 lg:p-20 overflow-hidden text-center"
            style={{ background: 'linear-gradient(135deg, #001a48 0%, #002d72 60%, #003a8c 100%)' }}
          >

            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 70% 30%, rgba(0,107,88,0.25), transparent 60%)' }} />
            <div className="relative z-10 max-w-3xl mx-auto">
              <h2
                className="text-4xl lg:text-6xl font-extrabold text-white mb-6"
                style={{ fontFamily: "'Manrope', 'Bricolage Grotesque', sans-serif" }}
              >
                ¿Listo para liderar el cambio?
              </h2>
              <p className="text-lg mb-10" style={{ color: 'rgba(255,255,255,0.70)' }}>
                Accede a la plataforma de inteligencia estratégica más avanzada para la toma de decisiones en educación superior.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => { setRadarTab('señales'); setActiveView('radar'); }}
                  className="px-10 py-4 rounded-2xl font-bold text-base transition-all hover:shadow-2xl hover:-translate-y-0.5"
                  style={{ background: '#006b58', color: '#ffffff' }}
                >
                  Explorar el Radar
                </button>
                <button
                  onClick={() => setActiveView('informes')}
                  className="px-10 py-4 rounded-2xl font-bold text-base transition-all hover:-translate-y-0.5"
                  style={{ background: 'rgba(255,255,255,0.10)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.20)' }}
                >
                  Ver Informes Estratégicos
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
};

export default Dashboard;

