import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  GraduationCap,
  Lightbulb,
  LineChart,
  Loader2,
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
        const firstFacultad = filters.facultades[0];
        if (firstFacultad) {
          setFacultad(firstFacultad.nombre);
          setCarrera(firstFacultad.carreras[0] || '');
        }
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
    const nextCarreras = facultades.find((f) => f.nombre === value)?.carreras ?? [];
    setCarrera(nextCarreras[0] || '');
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
            {/* Header */}
            <header className="rounded-xl border border-slate-200 bg-[#002D72] p-5 text-white shadow-sm">
              <div className="grid gap-5 lg:grid-cols-[260px_1fr_320px] lg:items-center">
                <div>
                  <h1 className="text-2xl font-black uppercase leading-tight tracking-wide text-[#00A3E0] md:text-3xl">
                    {informe?.informe.tituloHeader || 'Informes de mercado laboral'}
                  </h1>
                  <p className="mt-1 text-lg font-black uppercase text-white">{informe?.informe.periodo || 'Peru 2025 - 2026'}</p>
                  <div className="mt-3 h-1 w-20 rounded-full bg-[#00A3E0]" />
                </div>
                <p className="border-l border-white/20 pl-5 text-sm font-medium leading-relaxed text-blue-50">
                  {informe?.informe.descripcionHeader || 'Selecciona una carrera para visualizar el informe curado del mercado laboral.'}
                </p>
                <div className="rounded-lg bg-white/10 p-4 text-sm font-black leading-snug text-blue-50">
                  <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#00A3E0]">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  {informe?.informe.insightHeader || 'Sector en transformacion con demanda de perfiles digitales, analiticos y sostenibles.'}
                </div>
              </div>
            </header>

            {/* Selector facultad/carrera */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Facultad</span>
                  <select
                    value={facultad}
                    onChange={(e) => handleFacultad(e.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-[#002D72] outline-none"
                  >
                    {facultades.map((f) => <option key={f.nombre}>{f.nombre}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Carrera</span>
                  <select
                    value={carrera}
                    onChange={(e) => setCarrera(e.target.value)}
                    className="h-11 w-full rounded-lg border border-cyan-300 bg-white px-3 text-sm font-bold text-[#002D72] outline-none"
                  >
                    {carreras.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
                {informe?.informe.documentoInformeUrl && (
                  <a
                    href={informe.informe.documentoInformeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-[#002D72] px-4 text-sm font-black text-white"
                  >
                    Exportar informe
                  </a>
                )}
              </div>
            </section>

            {tab === 'metodologia' ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {metodologia.map((step) => (
                  <div key={step.orden} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 text-sm font-black text-[#00A3E0]">{step.orden}</span>
                      <h2 className="text-sm font-black uppercase tracking-wide text-[#002D72]">{step.titulo}</h2>
                    </div>
                    <p className="text-sm font-medium leading-relaxed text-slate-600">{step.descripcion}</p>
                  </div>
                ))}
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[#002D72]" />
                <p className="text-sm font-semibold text-slate-500">Cargando informe de mercado...</p>
              </div>
            ) : !informe ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
                <BarChart3 className="h-10 w-10 text-slate-300" />
                <p className="text-sm font-black uppercase tracking-wide text-slate-400">Sin informe disponible</p>
                <p className="text-xs font-medium text-slate-400">Selecciona otra facultad o carrera para ver el informe curado.</p>
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
