import React, { useState } from 'react';
import { Download, TrendingUp, Zap, BarChart2, CheckCircle2, Loader2, Sparkles, FileText } from 'lucide-react';
import { ThemeColors } from '../types';
import { SIGNALS_DATA } from '../constants';
import { generateForesightBrief } from '../services/geminiService';
import { logActividad } from '../services/actividadService';

interface ReportsViewProps {
  themeColors: ThemeColors;
}

const reportCards = [
  {
    id: 'signals',
    title: 'Radar de Señales 2024',
    icon: Zap,
    accentColor: '#2A9D8F',
    desc: 'Análisis detallado de señales detectadas y su probabilidad de disrupción en el sistema educativo.'
  },
  {
    id: 'curriculum',
    title: 'Auditoría Curricular IA',
    icon: TrendingUp,
    accentColor: '#F4A261',
    desc: 'Estado de madurez de la malla curricular frente a la transformación digital y las demandas del mercado.'
  },
  {
    id: 'benchmark',
    title: 'Benchmark de Facultades',
    icon: BarChart2,
    accentColor: '#E76F51',
    desc: 'Comparativa competitiva de indicadores de innovación con líderes regionales y globales.'
  },
];

const ReportsView: React.FC<ReportsViewProps> = ({ themeColors }) => {
  const [generating, setGenerating] = useState<string | null>(null);
  const [aiBrief, setAiBrief] = useState<string | null>(null);

  const handleGenerate = async (id: string) => {
    setGenerating(id);
    if (id !== 'ai-insights') {
      logActividad('descargar_informe', {
        modulo: 'informes',
        elementoTipo: 'reporte',
        elementoTitulo: reportCards.find(report => report.id === id)?.title || id,
        metadata: { formato: 'pdf', reporte: id },
      });
    }
    try {
      if (id === 'ai-insights') {
        const topics = SIGNALS_DATA.map(s => `${s.category}: ${s.title}`);
        const brief = await generateForesightBrief(topics);
        setAiBrief(brief);
      }
      setTimeout(() => setGenerating(null), 2000);
    } catch (err) {
      console.error(err);
      setGenerating(null);
    }
  };

  return (
    <div className="p-8 space-y-10 max-w-5xl mx-auto">


      <header className="text-center space-y-3">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3"
          style={{ background: 'rgba(42,157,143,0.1)' }}
        >
          <FileText className="w-7 h-7 text-[#2A9D8F]" />
        </div>
        <h3 className="text-3xl font-black tracking-tighter">Centro de Inteligencia Estratégica</h3>
        <p className="opacity-55 text-base font-medium max-w-md mx-auto leading-relaxed">
          Exportación de hallazgos y resúmenes ejecutivos para la toma de decisiones.
        </p>
      </header>


      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {reportCards.map(report => (
          <div
            key={report.id}
            className={`rounded-3xl border shadow-md transition-all hover:shadow-xl hover:-translate-y-1 group overflow-hidden ${themeColors.cardBg} ${themeColors.cardBorder}`}
          >

            <div
              className="h-1.5 w-full"
              style={{ background: `linear-gradient(90deg, ${report.accentColor}, ${report.accentColor}66)` }}
            />

            <div className="p-6">

              <div
                className="p-3.5 rounded-2xl inline-flex mb-5 transition-transform group-hover:scale-110"
                style={{ background: `${report.accentColor}14` }}
              >
                <report.icon className="w-7 h-7" style={{ color: report.accentColor }} />
              </div>

              <h4 className="text-base font-black mb-2 leading-tight">{report.title}</h4>
              <p className="text-xs opacity-55 mb-6 leading-relaxed">{report.desc}</p>

              <button
                onClick={() => handleGenerate(report.id)}
                disabled={!!generating}
                className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-sm font-bold transition-all disabled:opacity-50 hover:text-white"
                style={{ background: 'rgba(0,0,0,0.04)' }}
                onMouseEnter={e => {
                  if (!generating) {
                    (e.currentTarget as HTMLButtonElement).style.background = report.accentColor;
                  }
                }}
                onMouseLeave={e => {
                  if (!generating) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)';
                  }
                }}
              >
                {generating === report.id
                  ? <Loader2 className="animate-spin" size={16} />
                  : <Download size={16} />
                }
                <span>Descargar .PDF</span>
              </button>
            </div>
          </div>
        ))}
      </div>


      <div className={`p-8 rounded-3xl border-2 border-dashed relative overflow-hidden ${themeColors.cardBorder}`}>

        <div
          className="absolute top-0 right-0 w-52 h-52 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(42,157,143,0.07) 0%, transparent 70%)',
            marginRight: '-4rem',
            marginTop: '-4rem'
          }}
        />

        <div className="flex flex-col md:flex-row items-start md:items-center gap-7 relative z-10">
          <div
            className="p-4 rounded-3xl flex-shrink-0"
            style={{ background: 'rgba(42,157,143,0.1)' }}
          >
            <Sparkles className="text-[#2A9D8F] w-10 h-10" />
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <h4 className="text-xl font-black mb-1">Resumen Ejecutivo de Foresight</h4>
              <p className="text-sm opacity-55 leading-relaxed">
                Genera un brief dinámico basado en las señales actuales para presentarlo directamente ante rectoría o decanato.
              </p>
            </div>

            {aiBrief ? (
              <div
                className="p-6 rounded-2xl border text-sm leading-relaxed animate-in fade-in zoom-in-95 duration-500"
                style={{ background: 'rgba(42,157,143,0.05)', borderColor: 'rgba(42,157,143,0.2)' }}
              >
                <div className="flex items-center space-x-2 mb-4 text-[#2A9D8F]">
                  <CheckCircle2 size={15} />
                  <span className="font-black uppercase tracking-widest text-[10px]">Generado con IA</span>
                </div>
                <p className="font-medium opacity-80 whitespace-pre-line">{aiBrief}</p>
              </div>
            ) : (
              <button
                onClick={() => handleGenerate('ai-insights')}
                disabled={!!generating}
                className="flex items-center space-x-3 px-7 py-3.5 text-white rounded-2xl font-black text-sm hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                style={{ background: '#2A9D8F', boxShadow: '0 8px 30px rgba(42,157,143,0.28)' }}
              >
                {generating === 'ai-insights'
                  ? <Loader2 className="animate-spin" size={17} />
                  : <Sparkles size={17} />
                }
                <span>Generar Foresight Briefing</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsView;
