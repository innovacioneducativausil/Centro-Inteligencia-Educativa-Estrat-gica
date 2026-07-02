import React, { useState } from 'react';
import { Download, TrendingUp, Zap, BarChart2, CheckCircle2, Loader2, Sparkles, FileText } from 'lucide-react';
import { ThemeColors } from '../types';
import { SIGNALS_DATA } from '../constants';
import { generateForesightBrief } from '../services/geminiService';
import { logActividad } from '../services/actividadService';
import { getSenales } from '../services/apiService';
import { downloadExcel } from '../services/excelExport';

interface MallaResumen {
  nombre_version: string;
  anio_inicio: number;
  es_vigente: number;
  nombre_carrera: string;
  nombre_facultad: string;
  total_cursos: number;
}

interface ProgramaBenchmark {
  nombre_universidad: string;
  tipo_benchmark: string;
  pais: string;
  nombre_programa: string;
  modalidad: string | null;
  duracion: string | null;
  estado_extraccion: string;
}

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
  const [reportError, setReportError] = useState<string | null>(null);

  const logReportDownload = (id: string) => {
    logActividad('descargar_informe', {
      modulo: 'informes',
      elementoTipo: 'reporte',
      elementoTitulo: reportCards.find(report => report.id === id)?.title || id,
      metadata: { formato: 'xlsx', reporte: id },
    });
  };

  const handleGenerate = async (id: string) => {
    setGenerating(id);
    setReportError(null);
    try {
      if (id === 'ai-insights') {
        const topics = SIGNALS_DATA.map(s => `${s.category}: ${s.title}`);
        const brief = await generateForesightBrief(topics);
        setAiBrief(brief);
      } else if (id === 'signals') {
        const { data } = await getSenales();
        await downloadExcel('Radar_de_Senales', [{
          name: 'Señales',
          columns: [
            { header: 'Título', key: 'titulo', width: 45 },
            { header: 'Categoría', key: 'categoria', width: 20 },
            { header: 'PESTEL', key: 'pestel', width: 12 },
            { header: 'Sector', key: 'sector', width: 25 },
            { header: 'Urgencia', key: 'urgencia', width: 12 },
            { header: 'Impacto', key: 'impacto', width: 12 },
            { header: 'Madurez', key: 'madurez', width: 12 },
            { header: 'Publicado', key: 'publicado', width: 16 },
          ],
          rows: data.map(s => ({
            titulo: s.title,
            categoria: s.category,
            pestel: s.pestelLetra || '',
            sector: s.sector || '',
            urgencia: s.urgency,
            impacto: s.impact,
            madurez: s.maturity,
            publicado: s.publishedAt || '',
          })),
        }]);
        logReportDownload(id);
      } else if (id === 'curriculum') {
        const res = await fetch('/api/curricular/mallas', { credentials: 'include' });
        if (!res.ok) throw new Error('No se pudo obtener la información curricular.');
        const mallas: MallaResumen[] = await res.json();
        await downloadExcel('Auditoria_Curricular', [{
          name: 'Mallas',
          columns: [
            { header: 'Facultad', key: 'facultad', width: 40 },
            { header: 'Carrera', key: 'carrera', width: 40 },
            { header: 'Versión', key: 'version', width: 20 },
            { header: 'Año de inicio', key: 'anio', width: 14 },
            { header: 'Vigente', key: 'vigente', width: 12 },
            { header: 'Total cursos', key: 'cursos', width: 14 },
          ],
          rows: mallas.map(m => ({
            facultad: m.nombre_facultad,
            carrera: m.nombre_carrera,
            version: m.nombre_version,
            anio: m.anio_inicio,
            vigente: m.es_vigente ? 'Sí' : 'No',
            cursos: m.total_cursos,
          })),
        }]);
        logReportDownload(id);
      } else if (id === 'benchmark') {
        const res = await fetch('/api/mercado-laboral/benchmarking/programas', { credentials: 'include' });
        if (!res.ok) throw new Error('No se pudo obtener la información de benchmarking.');
        const programas: ProgramaBenchmark[] = await res.json();
        await downloadExcel('Benchmark_de_Facultades', [{
          name: 'Programas',
          columns: [
            { header: 'Universidad', key: 'universidad', width: 40 },
            { header: 'Tipo', key: 'tipo', width: 24 },
            { header: 'País', key: 'pais', width: 16 },
            { header: 'Programa', key: 'programa', width: 40 },
            { header: 'Modalidad', key: 'modalidad', width: 18 },
            { header: 'Duración', key: 'duracion', width: 16 },
            { header: 'Estado', key: 'estado', width: 16 },
          ],
          rows: programas.map(p => ({
            universidad: p.nombre_universidad,
            tipo: p.tipo_benchmark,
            pais: p.pais,
            programa: p.nombre_programa,
            modalidad: p.modalidad || '',
            duracion: p.duracion || '',
            estado: p.estado_extraccion,
          })),
        }]);
        logReportDownload(id);
      }
    } catch (err) {
      console.error(err);
      setReportError(err instanceof Error ? err.message : 'Error al generar el reporte.');
    } finally {
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
                <span>Descargar Excel</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {reportError && (
        <div className="px-4 py-3 rounded-xl text-sm font-semibold text-center"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#dc2626' }}>
          {reportError}
        </div>
      )}


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
