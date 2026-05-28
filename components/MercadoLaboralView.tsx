import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Database,
  GraduationCap,
  Lightbulb,
  LineChart,
  Loader2,
  Network,
  Search,
  Target,
  University,
  Wrench,
} from 'lucide-react';
import { ThemeColors } from '../types';
import BenchmarkingView from './BenchmarkingView';

interface MercadoLaboralViewProps {
  themeColors: ThemeColors;
  userRole?: string;
}

interface FiltroFacultad {
  nombre: string;
  carreras: string[];
}

interface MetodoPaso {
  orden: number;
  titulo: string;
  descripcion: string;
}

interface InformeResponse {
  informe: {
    id: number;
    facultad: string;
    carrera: string;
    periodo: string;
    tituloHeader: string | null;
    descripcionHeader: string | null;
    insightHeader: string | null;
    descripcion: string | null;
    objetivoFinal: string | null;
    documentoInformeUrl: string | null;
  };
  mercado: {
    puestos: { orden: number; nombre: string; descripcion: string | null; vacantes: string | null }[];
    habilidades: { categoria: string; habilidades: string[] }[];
    herramientas: { orden: number; nombre: string; descripcion: string | null }[];
    tendencias: { orden: number; titulo: string; descripcion: string | null }[];
    recomendacionesEstudiante: string[];
    recomendacionesCurriculares: string[];
  };
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Error ${res.status}`);
  return data as T;
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-3 border-b border-slate-200 pb-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#002D72] text-sm font-black text-white">
        {n}
      </span>
      <h2 className="text-sm font-black uppercase leading-tight tracking-wide text-[#002D72]">{title}</h2>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-semibold text-slate-500">{text}</p>;
}

function RecommendationBlock({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-slate-50 p-4">
      <div className="mb-3 flex items-center gap-3 text-[#002D72]">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#002D72] text-white">{icon}</span>
        <h3 className="text-sm font-black uppercase leading-tight">{title}</h3>
      </div>
      {items.length === 0 ? (
        <EmptyState text="Pendiente de curaduria" />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item} className="flex gap-2 text-xs font-semibold leading-relaxed text-slate-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#00A3E0]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 6 pasos fijos (coinciden con las imágenes de referencia) ─────────────────
const PASOS_FIJOS: MetodoPaso[] = [
  { orden: 1, titulo: 'Búsqueda Automatizada',   descripcion: 'Rastreo de miles de ofertas laborales en principales portales de empleo.' },
  { orden: 2, titulo: 'Recolección de Datos',    descripcion: 'Extracción y estructuración de la información de vacantes activas.' },
  { orden: 3, titulo: 'Procesamiento con IA',    descripcion: 'Procesamiento de lenguaje natural para limpiar y normalizar datos.' },
  { orden: 4, titulo: 'Identificación de Patrones', descripcion: 'Análisis semántico para agrupar habilidades y roles equivalentes.' },
  { orden: 5, titulo: 'Extracción de Insights',  descripcion: 'Generación de rankings de puestos, herramientas y competencias clave.' },
  { orden: 6, titulo: 'Aplicación Estratégica',  descripcion: 'Traducción de hallazgos del mercado en recomendaciones académicas.' },
];

// ── Iconos por orden de paso ──────────────────────────────────────────────────
const STEP_ICONS: Record<number, React.ReactNode> = {
  1: <Search        className="h-6 w-6" />,
  2: <Database      className="h-6 w-6" />,
  3: <Bot           className="h-6 w-6" />,
  4: <Network       className="h-6 w-6" />,
  5: <Lightbulb     className="h-6 w-6" />,
  6: <GraduationCap className="h-6 w-6" />,
};

const INSIGHTS = [
  { icon: <BriefcaseBusiness className="h-5 w-5" />, label: 'Puestos más demandados.' },
  { icon: <Lightbulb         className="h-5 w-5" />, label: 'Habilidades más solicitadas.' },
  { icon: <Wrench            className="h-5 w-5" />, label: 'Herramientas y conocimientos técnicos.' },
  { icon: <LineChart         className="h-5 w-5" />, label: 'Tendencias del mercado laboral.' },
  { icon: <BookOpen          className="h-5 w-5" />, label: 'Oportunidades de mejora curricular.' },
  { icon: <Target            className="h-5 w-5" />, label: 'Recomendaciones para empleabilidad.' },
];

const APLICACIONES = [
  'Actualización curricular.',
  'Diseño de experiencias formativas.',
  'Orientación a estudiantes y egresados.',
  'Fortalecimiento de competencias profesionales.',
  'Alineamiento con demandas del mercado.',
];

function MetodologiaView({ steps: _steps, onVerInformes }: { steps: MetodoPaso[]; onVerInformes: () => void }) {
  // Siempre usamos los 6 pasos estándar del diseño de referencia
  const steps = PASOS_FIJOS;
  return (
    <div className="space-y-6">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">
          <span className="material-symbols-outlined text-[13px]">calendar_today</span>
          Periodo: Perú 2025 - 2026
        </div>
        <h1 className="mt-3 text-2xl font-black leading-tight text-[#002D72]">
          Análisis técnico del mercado laboral
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-600">
          Herramienta de análisis para la toma de decisiones académicas, actualización curricular y fortalecimiento de la empleabilidad.
        </p>
      </div>

      {/* ── Sección pasos ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-xl font-black text-[#002D72]">¿Cómo se elaboraron los informes?</h2>
        <p className="mb-6 text-sm font-medium text-slate-500">
          Los informes fueron construidos mediante análisis automatizado de ofertas laborales, procesamiento con
          Inteligencia Artificial y extracción de patrones relevantes para la gestión académica.
        </p>
        {/* Pasos horizontales */}
        <div className="flex flex-wrap items-start gap-2 lg:flex-nowrap">
          {steps.map((step, idx) => (
            <React.Fragment key={step.orden}>
              <div className="flex-1 min-w-[130px] rounded-xl border border-slate-100 bg-slate-50 p-4 relative">
                {/* Número badge */}
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#00A3E0] text-[10px] font-black text-white">
                  {step.orden}
                </span>
                {/* Icono */}
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#002D72] shadow-sm border border-slate-100">
                  {STEP_ICONS[step.orden] ?? <BarChart3 className="h-5 w-5" />}
                </div>
                <h3 className="mb-1.5 text-[11px] font-black uppercase leading-tight tracking-wide text-[#002D72]">{step.titulo}</h3>
                <p className="text-[11px] font-medium leading-relaxed text-slate-500">{step.descripcion}</p>
              </div>
              {idx < steps.length - 1 && (
                <ArrowRight className="mt-6 h-5 w-5 shrink-0 text-slate-300 hidden lg:block" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Insights + Aplicación ─────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* Insights clave extraídos */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <div className="h-6 w-1 rounded-full bg-[#00A3E0]" />
            <h2 className="text-lg font-black text-[#002D72]">Insights clave extraídos</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {INSIGHTS.map(({ icon, label }) => (
              <div key={label}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#00A3E0] shadow-sm border border-slate-100">
                  {icon}
                </div>
                <span className="text-xs font-semibold leading-relaxed text-slate-700">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Aplicación Académica Estratégica */}
        <div className="rounded-2xl bg-[#002D72] p-6 text-white shadow-sm relative overflow-hidden">
          {/* Ícono decorativo */}
          <GraduationCap className="absolute right-5 top-5 h-20 w-20 text-white/10" />
          <div className="mb-5 flex items-center gap-2">
            <div className="h-6 w-1 rounded-full bg-[#00A3E0]" />
            <h2 className="text-lg font-black text-white">Aplicación Académica Estratégica</h2>
          </div>
          <ul className="mb-6 space-y-3">
            {APLICACIONES.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm font-medium text-blue-100">
                <span className="flex h-2 w-2 shrink-0 rounded-full bg-[#00A3E0]" />
                {item}
              </li>
            ))}
          </ul>
          <button onClick={onVerInformes}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00A3E0] px-5 py-3 text-sm font-black text-white shadow-md hover:bg-[#0091c7] transition-colors">
            Ver informes de mercado laboral <ArrowRight className="h-4 w-4" />
          </button>
        </div>

      </div>
    </div>
  );
}

const MercadoLaboralView: React.FC<MercadoLaboralViewProps> = ({ themeColors, userRole }) => {
  const [tab, setTab] = useState<'informe' | 'metodologia' | 'benchmarking'>('metodologia');
  const [facultades, setFacultades] = useState<FiltroFacultad[]>([]);
  const [facultad, setFacultad] = useState('');
  const [carrera, setCarrera] = useState('');
  const [informe, setInforme] = useState<InformeResponse | null>(null);
  const [metodologia, setMetodologia] = useState<MetodoPaso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isDark = themeColors.bg?.includes('950') || themeColors.bg?.includes('slate-900') || false;

  useEffect(() => {
    let alive = true;
    Promise.all([
      getJson<{ facultades: FiltroFacultad[] }>('/api/mercado-laboral/filtros'),
      getJson<{ data: MetodoPaso[] }>('/api/mercado-laboral/metodologia'),
    ])
      .then(([filters, metodo]) => {
        if (!alive) return;
        setFacultades(filters.facultades);
        setMetodologia(metodo.data);
        // No auto-seleccionar: el usuario debe elegir facultad y carrera
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!facultad || !carrera || tab !== 'informe') return;
    let alive = true;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ facultad, carrera }).toString();
    getJson<InformeResponse>(`/api/mercado-laboral/informe?${qs}`)
      .then((data) => alive && setInforme(data))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [facultad, carrera, tab]);

  const carreras = useMemo(
    () => facultades.find((f) => f.nombre === facultad)?.carreras ?? [],
    [facultades, facultad]
  );

  const handleFacultad = (value: string) => {
    setFacultad(value);
    setCarrera(''); // limpiar carrera al cambiar facultad
    setInforme(null);
  };

  const bg = isDark ? '#0f172a' : '#f8fafc';

  if (error && !informe && tab !== 'benchmarking') {
    return (
      <div className="flex min-h-full items-center justify-center p-8" style={{ background: bg }}>
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-full overflow-x-hidden p-4 md:p-6" style={{ background: bg }}>
      <div className="mx-auto max-w-[1500px] space-y-5">

        {/* Tabs de navegación */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'metodologia', label: 'Como se elaboraron', icon: Lightbulb },
            { key: 'informe',     label: 'Ver informes',        icon: Search },
            { key: 'benchmarking', label: 'Benchmarking Universitario', icon: University },
          ].map((item) => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key as typeof tab)}
                className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-black transition ${active ? 'bg-[#002D72] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
          {loading && tab !== 'benchmarking' && (
            <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando
            </span>
          )}
        </div>

        {/* ── TAB: BENCHMARKING ──────────────────────────────────────────── */}
        {tab === 'benchmarking' && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#002D72]">
                <University className="h-5 w-5 text-white" />
              </span>
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide text-[#002D72]">
                  Benchmarking Universitario
                </h2>
                <p className="text-xs font-medium text-slate-500">
                  Compara la malla propia con universidades competidoras y referentes internacionales
                </p>
              </div>
            </div>
            <BenchmarkingView themeColors={themeColors} userRole={userRole} />
          </div>
        )}

        {/* ── TABS: INFORME / METODOLOGIA ───────────────────────────────── */}
        {tab !== 'benchmarking' && (
          <>
            {/* Header y selector solo en tab informe */}
            {tab === 'informe' && (
              <>
                <header className="rounded-xl border border-slate-200 bg-[#002D72] p-5 text-white shadow-sm">
                  <div className="grid gap-5 lg:grid-cols-[260px_1fr_320px] lg:items-center">
                    <div>
                      <h1 className="text-2xl font-black uppercase leading-tight tracking-wide text-[#00A3E0] md:text-3xl">
                        {informe?.informe.tituloHeader || 'Informes de Mercado Laboral'}
                      </h1>
                      <p className="mt-1 text-lg font-black uppercase text-white">{informe?.informe.periodo || 'Perú 2025 - 2026'}</p>
                      <div className="mt-3 h-1 w-20 rounded-full bg-[#00A3E0]" />
                    </div>
                    <p className="border-l border-white/20 pl-5 text-sm font-medium leading-relaxed text-blue-50">
                      {informe?.informe.descripcionHeader || 'Selecciona una facultad y una carrera para visualizar el análisis técnico correspondiente.'}
                    </p>
                    <div className="rounded-lg bg-white/10 p-4 text-sm font-black leading-snug text-blue-50">
                      <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#00A3E0]">
                        <BarChart3 className="h-5 w-5" />
                      </div>
                      {informe?.informe.insightHeader || 'Sector en transformacion con demanda de perfiles digitales, analiticos y sostenibles.'}
                    </div>
                  </div>
                </header>
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                    <label className="block">
                      <span className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <span className="material-symbols-outlined text-[13px]">apartment</span> Facultad
                      </span>
                      <select value={facultad} onChange={(e) => handleFacultad(e.target.value)}
                        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-[#002D72] outline-none">
                        <option value="">Selecciona una facultad...</option>
                        {facultades.map((f) => <option key={f.nombre} value={f.nombre}>{f.nombre}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <span className="material-symbols-outlined text-[13px]">school</span> Carrera
                      </span>
                      <select value={carrera} onChange={(e) => setCarrera(e.target.value)} disabled={!facultad}
                        className="h-11 w-full rounded-lg border border-cyan-300 bg-white px-3 text-sm font-bold text-[#002D72] outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                        <option value="">Selecciona una carrera...</option>
                        {carreras.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    {informe?.informe.documentoInformeUrl && (
                      <a href={informe.informe.documentoInformeUrl} target="_blank" rel="noreferrer"
                        className="inline-flex h-11 items-center justify-center rounded-lg bg-[#002D72] px-4 text-sm font-black text-white">
                        Exportar informe
                      </a>
                    )}
                  </div>
                </section>
              </>
            )}

            {tab === 'metodologia' ? (
              <MetodologiaView steps={metodologia} onVerInformes={() => setTab('informe')} />
            ) : loading ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[#002D72]" />
                <p className="text-sm font-semibold text-slate-500">Cargando informe de mercado...</p>
              </div>
            ) : !informe ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white py-20 text-center shadow-sm">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E0F4FD]">
                  <Lightbulb className="h-8 w-8 text-[#00A3E0]" />
                </div>
                <div>
                  <p className="text-base font-black text-[#002D72]">Selecciona una facultad y una carrera</p>
                  <p className="mt-1 max-w-xs text-xs font-medium leading-relaxed text-slate-400">
                    Utilice los selectores superiores para consultar el informe de mercado laboral y tendencias de una carrera específica.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4 xl:grid-cols-4 xl:items-start">
                  <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <SectionTitle n={1} title="Top 5 de puestos mas frecuentes" />
                    <div className="flex-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: '360px' }}>
                      {informe.mercado.puestos.map((puesto) => (
                        <div key={puesto.orden} className="flex gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#002D72] text-white">
                            <BriefcaseBusiness className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="line-clamp-2 text-xs font-black leading-snug text-[#002D72]">{puesto.nombre}</h3>
                            {puesto.descripcion && <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-snug text-slate-500">{puesto.descripcion}</p>}
                            {puesto.vacantes && <p className="mt-1 text-[10px] font-black uppercase text-[#00A3E0]">Aprox. {puesto.vacantes}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <SectionTitle n={2} title="Habilidades mas demandadas" />
                    <div className="flex-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: '360px' }}>
                      {informe.mercado.habilidades.map((cat) => (
                        <div key={cat.categoria} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                          <div className="mb-1.5 flex items-center gap-2">
                            <GraduationCap className="h-4 w-4 shrink-0 text-[#002D72]" />
                            <h3 className="text-xs font-black leading-snug text-[#002D72]">{cat.categoria}</h3>
                          </div>
                          <ul className="list-disc space-y-0.5 pl-5 text-[11px] font-medium leading-snug text-slate-600">
                            {cat.habilidades.map((hab) => <li key={hab}>{hab}</li>)}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <SectionTitle n={3} title="Herramientas y conocimientos especificos" />
                    <div className="flex-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: '360px' }}>
                      {informe.mercado.herramientas.map((herr) => (
                        <div key={`${herr.orden}-${herr.nombre}`} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                          <div className="mb-1 flex items-center gap-2">
                            <Wrench className="h-4 w-4 shrink-0 text-[#002D72]" />
                            <h3 className="text-xs font-black text-[#002D72]">{herr.nombre}</h3>
                          </div>
                          {herr.descripcion && <p className="line-clamp-3 pl-6 text-[11px] font-medium leading-snug text-slate-500">{herr.descripcion}</p>}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <SectionTitle n={4} title="Tendencias y direccion del mercado" />
                    <div className="flex-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: '360px' }}>
                      {informe.mercado.tendencias.map((tend) => (
                        <div key={`${tend.orden}-${tend.titulo}`} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                          <div className="mb-1 flex items-center gap-2">
                            <LineChart className="h-4 w-4 shrink-0 text-[#002D72]" />
                            <h3 className="text-xs font-black leading-snug text-[#002D72]">{tend.titulo}</h3>
                          </div>
                          {tend.descripcion && <p className="line-clamp-3 pl-6 text-[11px] font-medium leading-snug text-slate-600">{tend.descripcion}</p>}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                  <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center gap-3 border-b border-slate-100 p-4">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#002D72] text-sm font-black text-white">5</span>
                      <h2 className="text-sm font-black uppercase tracking-wide text-[#002D72]">Sugerencia estrategica de empleabilidad</h2>
                    </div>
                    <div className="grid gap-4 p-5 md:grid-cols-2">
                      <RecommendationBlock icon={<GraduationCap className="h-6 w-6" />} title="Para estudiantes / egresados" items={informe.mercado.recomendacionesEstudiante} />
                      <RecommendationBlock icon={<BookOpen className="h-6 w-6" />} title="Para diseno curricular" items={informe.mercado.recomendacionesCurriculares} />
                    </div>
                  </section>

                  <aside className="rounded-xl bg-[#002D72] p-5 text-white shadow-sm">
                    <div className="mb-5 flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#00A3E0] text-[#00A3E0]">
                        <Target className="h-5 w-5" />
                      </span>
                      <div>
                        <h2 className="text-sm font-black uppercase tracking-wide">Objetivo final</h2>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-blue-50">{informe.informe.objetivoFinal}</p>
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#00A3E0] p-4 text-sm font-black leading-snug">
                      Profesionales preparados para liderar la transformacion del mercado laboral peruano.
                    </div>
                  </aside>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MercadoLaboralView;
