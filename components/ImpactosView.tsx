
import React, { useState, useRef } from 'react';
import { Layers, Sparkles, X, Loader2, Wrench, ShieldAlert, BookOpen, Target, ArrowDownCircle, Cpu, Zap, ExternalLink } from 'lucide-react';
import { ThemeColors, Course } from '../types';
import { CURRICULUM_DATA, SIGNALS_DATA } from '../constants';
import { analyzeCurricularRedesign } from '../services/geminiService';

interface ImpactosViewProps {
  themeColors: ThemeColors;
}

const ImpactosView: React.FC<ImpactosViewProps> = ({ themeColors }) => {
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleAiRedesign = async () => {
    if (!selectedCourse) return;
    setLoadingAi(true);
    const signalTitles = selectedCourse.affectedBy.map(sid => SIGNALS_DATA.find(s => s.id === sid)?.title || '');
    const result = await analyzeCurricularRedesign(
      selectedCourse.name,
      selectedCourse.summary || '',
      signalTitles,
      selectedCourse.recommendedTools || []
    );
    setAiAnalysis(result);
    setLoadingAi(false);
  };

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      const progress = (scrollLeft / (scrollWidth - clientWidth)) * 100;
      setScrollProgress(progress);
    }
  };

  const scrollToCycle = (cycle: number) => {
    if (scrollContainerRef.current) {
      const columnWidth = 420;
      scrollContainerRef.current.scrollTo({
        left: (cycle - 1) * columnWidth,
        behavior: 'smooth'
      });
    }
  };

  const criticalityConfig = {
    low: { bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', indicator: 'bg-emerald-500' },
    medium: { bg: 'bg-amber-500/5', border: 'border-amber-500/20', indicator: 'bg-amber-500' },
    critical: { bg: 'bg-rose-500/5', border: 'border-rose-500/20', indicator: 'bg-rose-500' }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden relative">

      <header className="p-8 pb-4 shrink-0 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h3 className="text-4xl font-black tracking-tighter">Malla Curricular Inteligente</h3>
          <p className="opacity-50 text-xs font-black uppercase tracking-[0.3em] text-[#2A9D8F]">Auditoría de Impacto Académico</p>
        </div>

        <div className="flex flex-col items-end w-full md:w-auto">
          <div className="flex items-center space-x-3 mb-3">
            <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">Navegación Semestral</span>
            <div className="flex space-x-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(c => (
                <button
                  key={c}
                  onClick={() => scrollToCycle(c)}
                  className={`w-8 h-8 rounded-xl text-[11px] font-black transition-all border ${
                    Math.round(scrollProgress / 11) + 1 === c
                    ? 'bg-[#2A9D8F] text-white border-[#2A9D8F] shadow-lg scale-110'
                    : 'bg-black/5 dark:bg-white/5 border-transparent opacity-40 hover:opacity-100'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="w-72 h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#2A9D8F] transition-all duration-300"
              style={{ width: `${scrollProgress}%` }}
            />
          </div>
        </div>
      </header>


      <div className={`flex-1 overflow-hidden border-t ${themeColors.cardBorder} bg-black/[0.02] dark:bg-white/[0.02]`}>
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="h-full flex overflow-x-auto p-8 space-x-8 custom-scrollbar scroll-smooth"
        >
          {CURRICULUM_DATA.map(semester => (
            <div key={semester.semester} className="flex-none w-[400px]">
              <div className="mb-6 px-6 py-3 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-black/5 text-center font-black text-xs uppercase tracking-[0.4em] opacity-40">
                Semestre {semester.semester}
              </div>
              <div className="grid grid-cols-1 gap-4">
                {semester.courses.map(course => (
                  <button
                    key={course.id}
                    onClick={() => { setSelectedCourse(course); setAiAnalysis(null); }}
                    className={`p-6 rounded-[2rem] border text-left transition-all duration-300 relative group overflow-hidden ${
                      selectedCourse?.id === course.id
                        ? 'ring-4 ring-[#2A9D8F]/20 border-[#2A9D8F] shadow-2xl scale-[1.02] z-10'
                        : 'shadow-md hover:shadow-xl hover:translate-y-[-4px] hover:border-[#2A9D8F]/30'
                    } ${criticalityConfig[course.criticality].bg} ${criticalityConfig[course.criticality].border} ${themeColors.cardBg}`}
                  >
                    <div className="flex justify-between items-center mb-3">
                      <div className={`w-3 h-3 rounded-full ${criticalityConfig[course.criticality].indicator}`} />
                      <div className="flex -space-x-2">
                        {course.affectedBy.slice(0, 5).map(sid => (
                          <div key={sid} className="w-7 h-7 rounded-full bg-white dark:bg-slate-900 border border-black/5 flex items-center justify-center text-xs shadow-sm ring-2 ring-transparent group-hover:ring-[#2A9D8F]/30">
                            {SIGNALS_DATA.find(s => s.id === sid)?.emoji || '•'}
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="text-sm font-black leading-tight mb-2 group-hover:text-[#2A9D8F] transition-colors">{course.name}</p>
                    {course.summary && <p className="text-[11px] opacity-40 line-clamp-2 italic font-medium leading-relaxed">{course.summary}</p>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>


      {selectedCourse && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 md:p-12 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            onClick={() => setSelectedCourse(null)}
          />

          <div className={`relative w-full max-w-[1400px] h-full max-h-[90vh] rounded-[3.5rem] border shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] flex flex-col lg:flex-row gap-0 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 ${themeColors.cardBg} ${themeColors.cardBorder}`}>


            <div className="flex-[1.4] overflow-y-auto custom-scrollbar p-12 lg:p-20 border-r border-black/5 dark:border-white/10 space-y-12">
              <section>
                <div className="flex items-center space-x-4 mb-8 text-[#2A9D8F]">
                  <div className="p-4 rounded-2xl bg-[#2A9D8F]/10 shadow-inner"><BookOpen size={28} /></div>
                  <h5 className="text-sm font-black uppercase tracking-[0.3em]">Expediente Académico</h5>
                </div>
                <h4 className="text-6xl font-black mb-8 tracking-tighter leading-none text-balance">{selectedCourse.name}</h4>
                <div className="p-12 rounded-[3rem] bg-black/[0.03] dark:bg-white/[0.03] border-2 border-transparent hover:border-[#2A9D8F]/10 transition-all text-xl leading-relaxed opacity-90 italic font-medium relative group shadow-2xl">
                  <div className="absolute top-8 left-8 opacity-5 group-hover:opacity-10 transition-opacity"><Layers size={80}/></div>
                  "{selectedCourse.summary}"
                </div>
              </section>

              <section>
                <div className="flex items-center space-x-4 mb-10 text-rose-500">
                  <div className="p-4 rounded-2xl bg-rose-500/10 shadow-inner"><ShieldAlert size={28} /></div>
                  <h5 className="text-sm font-black uppercase tracking-[0.3em]">Racional de Impacto Externo</h5>
                </div>
                <div className="grid grid-cols-1 gap-6">
                  {selectedCourse.affectedBy.map(sid => {
                    const s = SIGNALS_DATA.find(x => x.id === sid);
                    return s ? (
                      <div key={sid} className="p-10 rounded-[3rem] border border-rose-500/10 bg-rose-500/[0.02] group hover:bg-rose-500/[0.05] hover:shadow-2xl transition-all flex items-start space-x-8">
                        <span className="text-6xl shrink-0 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500">{s.emoji}</span>
                        <div>
                          <h6 className="text-base font-black uppercase tracking-tight mb-2 text-rose-600 group-hover:text-rose-500">{s.title}</h6>
                          <p className="text-sm opacity-60 leading-relaxed font-medium">
                            Esta asignatura requiere reestructuración inmediata por la señal: <span className="font-bold text-rose-700">{s.signalText.toLowerCase()}</span>.
                          </p>
                        </div>
                      </div>
                    ) : null;
                  })}
                </div>
              </section>
            </div>


            <div className="flex-1 overflow-y-auto custom-scrollbar p-12 lg:p-20 space-y-12 bg-black/[0.03] dark:bg-white/[0.03]">
              <div className="grid grid-cols-1 gap-12">
                <section>
                  <div className="flex items-center space-x-4 mb-8 text-sky-500">
                    <div className="p-4 rounded-2xl bg-sky-500/10 shadow-inner"><Cpu size={28} /></div>
                    <h5 className="text-sm font-black uppercase tracking-[0.3em]">Ecosistema MedTech</h5>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {selectedCourse.recommendedTools?.map(tool => (
                      <div key={tool} className="px-6 py-4 rounded-2xl bg-white dark:bg-slate-800 border border-black/5 text-sm font-black shadow-lg flex items-center space-x-4 hover:border-sky-500/40 hover:translate-y-[-4px] transition-all">
                        <Wrench size={18} className="opacity-40 text-sky-500" />
                        <span>{tool}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="flex items-center space-x-4 mb-8 text-amber-500">
                    <div className="p-4 rounded-2xl bg-amber-500/10 shadow-inner"><Target size={28} /></div>
                    <h5 className="text-sm font-black uppercase tracking-[0.3em]">Objetivos de Rediseño</h5>
                  </div>
                  <div className="space-y-4">
                    {selectedCourse.contentToUpdate?.map((item, i) => (
                      <div key={i} className="flex items-center space-x-6 p-6 rounded-[2rem] bg-white dark:bg-slate-800 shadow-md border border-transparent hover:border-amber-500/30 transition-all group">
                        <ArrowDownCircle size={24} className="text-amber-500 shrink-0 group-hover:translate-y-2 transition-transform" />
                        <span className="text-sm font-bold opacity-80">{item}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {aiAnalysis && (
                <section className="p-12 rounded-[3.5rem] bg-[#2A9D8F]/10 border-2 border-[#2A9D8F]/20 animate-in zoom-in-95 shadow-3xl relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-6 opacity-5 rotate-12"><Sparkles size={150} /></div>
                  <div className="flex items-center space-x-4 mb-8 text-[#2A9D8F] relative z-10">
                    <Sparkles size={32} />
                    <h5 className="text-base font-black uppercase tracking-[0.2em]">Briefing Estratégico IA</h5>
                  </div>
                  <div className="text-base leading-relaxed whitespace-pre-line font-medium opacity-90 text-[#2A9D8F] dark:text-[#38BDF8] relative z-10">
                    {aiAnalysis}
                  </div>
                </section>
              )}

              <div className="pt-10 relative z-10">
                <button
                  onClick={handleAiRedesign}
                  disabled={loadingAi}
                  className="w-full py-8 rounded-[2.5rem] bg-[#2A9D8F] text-white font-black text-base uppercase tracking-[0.5em] flex items-center justify-center space-x-6 hover:bg-[#258a7e] hover:scale-[1.02] active:scale-95 transition-all shadow-[0_30px_60px_-15px_rgba(42,157,143,0.5)] disabled:opacity-50"
                >
                  {loadingAi ? <Loader2 className="animate-spin" size={32} /> : <Sparkles size={32} />}
                  <span>Ejecutar Rediseño IA</span>
                </button>
              </div>
            </div>


            <button
              onClick={() => setSelectedCourse(null)}
              className="absolute top-10 right-10 p-5 bg-white/10 hover:bg-white/30 dark:bg-white/5 dark:hover:bg-white/10 rounded-full transition-all z-[110] backdrop-blur-2xl shadow-2xl hover:scale-110 active:scale-90 border border-white/20"
            >
              <X size={36} className="text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImpactosView;
