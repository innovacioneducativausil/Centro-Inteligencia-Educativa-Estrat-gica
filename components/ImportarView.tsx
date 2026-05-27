// components/ImportarView.tsx — Importación de artículos con clasificación IA (WEF Horizon Scanning)
// Flujo: Subir PDF → Procesando IA → Revisión (tabs) → Confirmado
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import PdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ThemeColors } from '../types';
import {
  PropuestaImportacion, RelacionSugerida,
  extraerSenales, extraerTendencias, extraerEscenarios, sugerirRelaciones,
  extractUrlsFromText,
} from '../services/geminiService';

// Configurar worker de pdfjs (Vite lo sirve como asset estático)
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorkerUrl;

interface ImportarViewProps { themeColors: ThemeColors; onVolver: () => void; }

// ── Tipos locales ────────────────────────────────────────────
type Step         = 'fuente' | 'procesando' | 'revision' | 'confirmado';
type TabRevision  = 'senales' | 'tendencias' | 'escenarios' | 'relaciones';
type ProgresoStep = 'idle' | 'loading' | 'done' | 'error';

interface PdfInfo { pages: number; chars: number; links: number; }

interface PropuestaLocal extends PropuestaImportacion {
  decision:      'pendiente' | 'aprobada' | 'rechazada';
  pestelIds:     string[];   // múltiples PESTEL
  sectorIds:     string[];   // múltiples sectores
  editTitulo:    string;
  editNombre:    string;
  editDescCorta: string;
  expanded:      boolean;
}
interface PestelOpt { id_pestel: string; nombre_pestel: string; letra_codigo: string; color: string; }
interface SectorOpt { id_sector: string; nombre_sector: string; }

// ── Estilos por tipo ─────────────────────────────────────────
const TIPO_STYLE = {
  senal:     { label: 'SEÑAL',     bg: '#fef3c7', text: '#92400e', icon: 'wifi_tethering', activeTab: '#f59e0b' },
  tendencia: { label: 'TENDENCIA', bg: '#dbeafe', text: '#1e40af', icon: 'trending_up',     activeTab: '#3b82f6' },
  escenario: { label: 'ESCENARIO', bg: '#f0fdf4', text: '#15803d', icon: 'auto_awesome',    activeTab: '#22c55e' },
} as const;

const authH = () => ({
  'Content-Type': 'application/json',
});

// ── Extracción de texto + hipervínculos desde PDF ────────────
async function extractTextFromPDF(file: File): Promise<{ texto: string; info: PdfInfo }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  let totalLinks = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const [textContent, annotations] = await Promise.all([
      page.getTextContent(),
      page.getAnnotations(),
    ]);

    // Recopilar anotaciones de tipo Link con URL resuelta
    // pdfjs puede usar ann.url, ann.unsafeUrl o ann.action.url según el PDF
    const linkAnns: { url: string; rect: [number, number, number, number] }[] = [];
    for (const ann of annotations as any[]) {
      if (ann.subtype !== 'Link') continue;
      const url: string = (ann.url as string)
        || (ann.unsafeUrl as string)
        || (ann.action?.type === 'URI' ? (ann.action?.url as string) : '')
        || '';
      if (url.startsWith('http') && Array.isArray(ann.rect)) {
        linkAnns.push({ url, rect: ann.rect as [number, number, number, number] });
      }
    }
    totalLinks += linkAnns.length;

    // Reconstruir texto con marcadores [→url] inline.
    // Estrategia en 2 pasos para máxima compatibilidad con PDFs de distintos orígenes:
    // Paso 1: mapear cada anotación al ítem de texto más cercano (tolerancia generosa + fallback distancia).
    // Paso 2: insertar el marcador [→url] después de ese ítem al construir pageText.
    const pageItems = textContent.items as any[];

    // ── Paso 1: anotación → índice del ítem de texto más cercano ─────────────
    const annToItemIdx = new Map<number, number>();   // annIdx → itemIdx
    for (let ai = 0; ai < linkAnns.length; ai++) {
      const rect  = linkAnns[ai].rect;
      const rxMin = Math.min(rect[0], rect[2]);
      const rxMax = Math.max(rect[0], rect[2]);
      const ryMin = Math.min(rect[1], rect[3]);
      const ryMax = Math.max(rect[1], rect[3]);
      const rcx   = (rxMin + rxMax) / 2;
      const rcy   = (ryMin + ryMax) / 2;

      let bestIdx  = -1;
      let bestDist = Infinity;

      // Intento 1: solapamiento con tolerancia generosa (±15 Y, ±5 X)
      for (let ii = 0; ii < pageItems.length; ii++) {
        const item = pageItems[ii];
        if (!item.str?.trim()) continue;
        const ix   = item.transform?.[4] ?? 0;
        const iy   = item.transform?.[5] ?? 0;
        const iw   = Math.max(item.width ?? 0, 1);
        const inX  = ix < rxMax + 5 && ix + iw > rxMin - 5;
        const inY  = iy >= ryMin - 15 && iy <= ryMax + 15;
        const dist = Math.sqrt((ix - rcx) ** 2 + (iy - rcy) ** 2);
        if (inX && inY && dist < bestDist) { bestDist = dist; bestIdx = ii; }
      }

      // Intento 2 (fallback): ítem más cercano en toda la página, máximo 300 unidades
      if (bestIdx === -1) {
        bestDist = Infinity;
        for (let ii = 0; ii < pageItems.length; ii++) {
          const item = pageItems[ii];
          if (!item.str?.trim()) continue;
          const ix   = item.transform?.[4] ?? 0;
          const iy   = item.transform?.[5] ?? 0;
          const dist = Math.sqrt((ix - rcx) ** 2 + (iy - rcy) ** 2);
          if (dist < bestDist) { bestDist = dist; bestIdx = ii; }
        }
        if (bestDist > 300) bestIdx = -1; // demasiado lejos → no mapear
      }

      if (bestIdx !== -1) annToItemIdx.set(ai, bestIdx);
    }

    // Índice inverso: ítemIdx → lista de anotaciones a insertar después de él
    const itemToAnns = new Map<number, number[]>();
    for (const [ai, ii] of annToItemIdx.entries()) {
      const list = itemToAnns.get(ii) ?? [];
      list.push(ai);
      itemToAnns.set(ii, list);
    }

    // ── Paso 2: construir pageText con marcadores [→url] en posición correcta ─
    let pageText = '';
    let lastY: number | null = null;

    for (let ii = 0; ii < pageItems.length; ii++) {
      const item = pageItems[ii];
      const y = item.transform?.[5] ?? 0;
      if (lastY !== null && Math.abs(y - lastY) > 3 && pageText.length > 0) {
        pageText += '\n';
      }
      pageText += item.str;
      if (item.hasEOL) pageText += '\n';
      lastY = y;

      // Insertar marcadores de anotaciones mapeadas a este ítem
      const anns = itemToAnns.get(ii);
      if (anns) {
        for (const ai of anns) {
          pageText += `[→${linkAnns[ai].url}]`;
        }
      }
    }

    // Bloque al final de página con TODAS las URLs (compatibilidad con extractUrlsFromText)
    if (linkAnns.length > 0) {
      pageText += `\n[Links pág.${pageNum}: ${linkAnns.map(a => a.url).join(' | ')}]`;
    }

    fullText += pageText + '\n';
  }

  return {
    texto: fullText,
    info: { pages: pdf.numPages, chars: fullText.length, links: totalLinks },
  };
}

// ── Componente principal ─────────────────────────────────────
const ImportarView: React.FC<ImportarViewProps> = ({ themeColors, onVolver }) => {
  const [step,       setStep]       = useState<Step>('fuente');
  const [tabRev,     setTabRev]     = useState<TabRevision>('senales');
  const [aiError,    setAiError]    = useState<string | null>(null);
  const [saveError,  setSaveError]  = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [resultado,  setResultado]  = useState<any>(null);

  // Metadatos
  const [topico,    setTopico]    = useState('');
  const [fuente,    setFuente]    = useState('');
  const [urlFuente, setUrlFuente] = useState('');
  const [autorPdf,  setAutorPdf]  = useState('');

  // PDF
  const [pdfFile,     setPdfFile]     = useState<File | null>(null);
  const [pdfTexto,    setPdfTexto]    = useState('');
  const [pdfInfo,     setPdfInfo]     = useState<PdfInfo | null>(null);
  const [extrayendo,  setExtrayendo]  = useState(false);
  const [pdfError,    setPdfError]    = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Progreso IA
  const [progreso, setProgreso] = useState<Record<string, ProgresoStep>>({
    senales: 'idle', tendencias: 'idle', escenarios: 'idle', relaciones: 'idle',
  });

  // Propuestas y relaciones
  const [propuestas, setPropuestas] = useState<PropuestaLocal[]>([]);
  const [relaciones, setRelaciones] = useState<RelacionSugerida[]>([]);

  // Catálogos
  const [pestels, setPestels] = useState<PestelOpt[]>([]);
  const [sectors, setSectors] = useState<SectorOpt[]>([]);

  useEffect(() => {
    fetch('/api/admin/options', { headers: authH() })
      .then(r => r.json())
      .then(d => { setPestels(d.pestels || []); setSectors(d.sectors || []); })
      .catch(() => {});
  }, []);

  const updateProp = (id: string, patch: Partial<PropuestaLocal>) =>
    setPropuestas(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));

  // Devuelve el primer contenedor scrollable encontrado (main, o el más cercano con overflow-y).
  const getScrollContainer = (): HTMLElement | null => {
    const main = document.querySelector('main') as HTMLElement | null;
    if (main) return main;
    // fallback: primer ancestro scrollable del body
    let el: HTMLElement | null = document.body;
    while (el) {
      const style = getComputedStyle(el);
      if (['auto', 'scroll'].includes(style.overflowY) && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return document.documentElement as HTMLElement;
  };

  // Al expandir una tarjeta, graba la posición y la restaura con múltiples rAF
  // para anular el auto-scroll del browser al montar inputs/textareas recién visibles.
  const handleToggleExpand = (id: string, currentExpanded: boolean) => {
    if (!currentExpanded) {
      const sc = getScrollContainer();
      if (sc) {
        const savedTop = sc.scrollTop;
        // Tres rAF consecutivos cubren el ciclo completo render → layout → paint del browser
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => { sc.scrollTop = savedTop; })
          )
        );
      }
    }
    updateProp(id, { expanded: !currentExpanded });
  };

  // Captura cualquier evento de focus dentro de la tarjeta expandida y restaura el scroll.
  // Necesario porque el browser hace scroll-to-focused-element automáticamente al
  // renderizar inputs/textareas que acaban de aparecer en el DOM.
  const handleFocusLock = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    const sc = getScrollContainer();
    if (!sc) return;
    const saved = sc.scrollTop;
    // Promise.resolve (microtask) dispara DESPUÉS del comportamiento por defecto del browser
    // pero ANTES del siguiente frame → cubre el scroll-to-focus nativo
    Promise.resolve().then(() => { sc.scrollTop = saved; });
    // rAF adicional como red de seguridad para browsers que difieren el scroll
    requestAnimationFrame(() => { sc.scrollTop = saved; });
  }, []);

  const toLocal = (item: PropuestaImportacion): PropuestaLocal => {
    // Normaliza acentos para comparación robusta (e.g. "Tecnologico" == "Tecnológico")
    const norm = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // PESTEL múltiple: "Tecnológico; Económico" o ["Tecnológico","Económico"] → ids
    const pestelIds: string[] = [];
    const rawPestels = (item.pestelNombre || item.pestelLetra || '')
      .split(';').map(s => s.trim()).filter(Boolean);
    for (const raw of rawPestels) {
      const rl = norm(raw);
      const m = pestels.find(p =>
        norm(p.nombre_pestel) === rl ||
        norm(p.nombre_pestel).includes(rl) ||
        rl.includes(norm(p.nombre_pestel)) ||
        p.letra_codigo.toLowerCase() === rl
      );
      if (m && !pestelIds.includes(m.id_pestel)) pestelIds.push(m.id_pestel);
    }

    // Sector múltiple: normalizado igual
    const sectorIds: string[] = [];
    const rawSectors = (item.sectorNombre || '')
      .split(';').map(s => s.trim()).filter(Boolean);
    for (const raw of rawSectors) {
      const rl = norm(raw);
      const m = sectors.find(s =>
        norm(s.nombre_sector) === rl ||
        norm(s.nombre_sector).includes(rl) ||
        rl.includes(norm(s.nombre_sector))
      );
      if (m && !sectorIds.includes(m.id_sector)) sectorIds.push(m.id_sector);
    }

    return {
      ...item,
      decision:      'pendiente',
      pestelIds,
      sectorIds,
      editTitulo:    item.titulo,
      editNombre:    item.nombre,
      editDescCorta: item.descCorta,
      expanded:      false,
    };
  };

  // ── Seleccionar / cambiar PDF ────────────────────────────────
  const handlePdfSelect = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setPdfError('Solo se aceptan archivos PDF.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setPdfError('El PDF supera el límite de 20 MB.');
      return;
    }

    setPdfFile(file);
    setPdfTexto('');
    setPdfInfo(null);
    setPdfError(null);
    setExtrayendo(true);

    // Autocompletar tópico con el nombre del archivo si está vacío
    if (!topico.trim()) {
      setTopico(file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' '));
    }

    try {
      const { texto, info } = await extractTextFromPDF(file);
      if (texto.trim().length < 100) {
        setPdfError('No se pudo extraer texto del PDF (puede ser un PDF escaneado sin OCR).');
        setPdfFile(null);
      } else {
        setPdfTexto(texto);
        setPdfInfo(info);
        // Extraer autor de la carátula: "Seleccionado, filtrado y editado con [AUTOR]"
        const match = texto.match(
          /Seleccionado[,.]?\s*filtrado\s*y\s*editado\s*con\s+([^\n\r\[→]{2,100})/i
        );
        if (match) setAutorPdf(match[1].trim());
      }
    } catch (err: any) {
      setPdfError(`Error al leer el PDF: ${err?.message || 'formato no soportado'}`);
      setPdfFile(null);
    } finally {
      setExtrayendo(false);
    }
  };

  // ── Drag & drop ─────────────────────────────────────────────
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handlePdfSelect(file);
  };

  // ── Paso 1 → 2: Procesar con IA (todo el texto del PDF) ─────
  const handleProcesar = async () => {
    if (!topico.trim()) { setAiError('El tópico/título del informe es obligatorio.'); return; }
    if (!pdfTexto || pdfTexto.trim().length < 100) { setAiError('Primero sube el PDF del artículo.'); return; }

    setAiError(null);
    setStep('procesando');
    const fuenteDoc = (fuente || topico).trim();
    const all: PropuestaImportacion[] = [];
    const upd = (k: string, v: ProgresoStep) => setProgreso(p => ({ ...p, [k]: v }));

    // Catálogo de sectores para que la IA elija el nombre exacto
    const sectorNames = sectors.map(s => s.nombre_sector);

    // Extraer URLs únicas del PDF para el flujo "una señal por URL"
    const urlsDetectadas = extractUrlsFromText(pdfTexto);

    // Las 3 llamadas reciben el texto completo del PDF + catálogo de sectores
    const errores: string[] = [];

    upd('senales', 'loading');
    try {
      const s = await extraerSenales(pdfTexto, fuenteDoc, sectorNames, urlsDetectadas);
      all.push(...s);
      upd('senales', 'done');
    } catch (e: any) { upd('senales', 'error'); errores.push(`Señales: ${e?.message || e}`); console.error('[señales]', e); }

    upd('tendencias', 'loading');
    try {
      const t = await extraerTendencias(pdfTexto, fuenteDoc, sectorNames);
      all.push(...t);
      upd('tendencias', 'done');
    } catch (e: any) { upd('tendencias', 'error'); errores.push(`Tendencias: ${e?.message || e}`); console.error('[tendencias]', e); }

    upd('escenarios', 'loading');
    try {
      const e = await extraerEscenarios(pdfTexto, fuenteDoc, sectorNames);
      all.push(...e);
      upd('escenarios', 'done');
    } catch (e: any) { upd('escenarios', 'error'); errores.push(`Escenarios: ${e?.message || e}`); console.error('[escenarios]', e); }

    if (all.length === 0) {
      setAiError(`La IA no pudo extraer elementos. ${errores.length > 0 ? errores.join(' | ') : 'Verifica que el documento tenga texto extraíble.'}`);
      setStep('fuente');
      return;
    }

    // Auto-fetch og:image para todas las señales con urlFuente (siempre usa la imagen real del artículo)
    await Promise.all(
      all
        .filter(item => item.tipo === 'senal' && item.urlFuente)
        .map(async item => {
          try {
            const r = await fetch(`/api/ai/og-image?url=${encodeURIComponent(item.urlFuente)}`, { headers: authH() });
            const d = await r.json();
            if (d.image) item.urlImagen = d.image;
          } catch { /* silencioso */ }
        })
    );

    upd('relaciones', 'loading');
    try {
      const rels = await sugerirRelaciones(all);
      setRelaciones(rels);
      upd('relaciones', 'done');
    } catch { upd('relaciones', 'error'); }

    setPropuestas(all.map(toLocal));
    const nSen  = all.filter(p => p.tipo === 'senal').length;
    const nTend = all.filter(p => p.tipo === 'tendencia').length;
    const nEsc  = all.filter(p => p.tipo === 'escenario').length;
    setTabRev(nTend >= nSen && nTend >= nEsc ? 'tendencias' : nEsc > nSen ? 'escenarios' : 'senales');
    setStep('revision');
  };

  // ── Confirmar aprobadas ─────────────────────────────────────
  const handleConfirmar = async () => {
    const aprobadas = propuestas.filter(p => p.decision === 'aprobada');
    if (aprobadas.length === 0) { setSaveError('Aprueba al menos una propuesta.'); return; }
    const sinCampos = aprobadas.filter(p => p.pestelIds.length === 0 || p.sectorIds.length === 0);
    if (sinCampos.length) { setSaveError('Todas las aprobadas necesitan al menos un PESTEL y un Sector.'); return; }

    setSaveError(null); setSaving(true);
    try {
      const res = await fetch('/api/importar/confirmar', {
        method: 'POST', headers: authH(),
        body: JSON.stringify({
          topico:    topico.trim(),
          fuente:    (fuente || topico).trim(),
          urlFuente: urlFuente.trim(),
          propuestas: aprobadas.map(p => ({
            id:                p.id,
            tipo:              p.tipo,
            titulo:            (p.editTitulo || p.titulo).trim(),
            nombre:            (p.editNombre || p.nombre || p.editTitulo || p.titulo).trim().slice(0, 55),
            descCorta:         (p.editDescCorta || p.descCorta).trim(),
            descLarga:         p.descLarga,
            fuente:            p.fuente,
            urlFuente:         p.urlFuente,
            urlsFuente:        p.urlsFuente,
            probabilidad:      p.probabilidad,
            temasRelacionados: p.temasRelacionados,
            pestelIds:         p.pestelIds,
            sectorIds:         p.sectorIds,
            // Campos enriquecidos → columnas DB
            razonClasificacion: p.razonClasificacion,
            paisOrigen:         p.paisOrigen  || p.lugar || '',
            fechaArticulo:      p.fechaArticulo || p.fechaMencionada || '',
            horizonteTemporal:  p.horizonteTemporal,
            urlImagen:          p.urlImagen,
            urlVideo:           p.urlVideo,
            autor:              autorPdf.trim() || undefined,
            ...(p.tipo === 'escenario' && {
              topico:     p.topico,
              referencias: p.referencias,
            }),
          })),
          relaciones: relaciones
            .filter(r => r.aceptada)
            .map(r => ({ idOrigen: r.idOrigen, idDestino: r.idDestino, tipo: r.tipo })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setResultado(data);
      setStep('confirmado');
    } catch (e: any) {
      setSaveError(e?.message || 'Error de conexión.');
    } finally { setSaving(false); }
  };

  const handleNuevo = () => {
    setStep('fuente'); setTopico(''); setFuente(''); setUrlFuente(''); setAutorPdf('');
    setPdfFile(null); setPdfTexto(''); setPdfInfo(null); setPdfError(null);
    setPreviewOpen(false);
    setPropuestas([]); setRelaciones([]);
    setAiError(null); setSaveError(null); setResultado(null);
    setProgreso({ senales: 'idle', tendencias: 'idle', escenarios: 'idle', relaciones: 'idle' });
  };

  // ── UI helpers ───────────────────────────────────────────────
  const isDark   = themeColors.bg.includes('950') || themeColors.bg.includes('slate-900');
  const inputCls = `w-full px-3 py-2 text-sm rounded-lg border outline-none transition-all focus:ring-2 focus:ring-blue-400/30 ${themeColors.inputBg} ${themeColors.inputBorder} ${themeColors.inputText}`;
  const cardCls  = `rounded-xl border shadow-sm ${themeColors.cardBg} ${themeColors.cardBorder}`;

  const nSen  = propuestas.filter(p => p.tipo === 'senal').length;
  const nTend = propuestas.filter(p => p.tipo === 'tendencia').length;
  const nEsc  = propuestas.filter(p => p.tipo === 'escenario').length;
  const nRel  = relaciones.length;
  const nApr  = propuestas.filter(p => p.decision === 'aprobada').length;

  const STEPS       = ['fuente', 'procesando', 'revision', 'confirmado'];
  const STEP_LABELS = ['1. Fuente', '2. Análisis IA', '3. Revisión', '4. Guardado'];
  const stepIdx     = STEPS.indexOf(step);

  // ── Tarjeta de propuesta ─────────────────────────────────────
  const PropCard = ({ prop }: { prop: PropuestaLocal }) => {
    const ts   = TIPO_STYLE[prop.tipo];
    const isAp = prop.decision === 'aprobada';
    const isRe = prop.decision === 'rechazada';
    const needPestel  = prop.decision === 'aprobada' && prop.pestelIds.length === 0;
    const needSector  = prop.decision === 'aprobada' && prop.sectorIds.length === 0;

    const togglePestel = (id: string) => {
      const ids = prop.pestelIds.includes(id)
        ? prop.pestelIds.filter(x => x !== id)
        : [...prop.pestelIds, id];
      updateProp(prop.id, { pestelIds: ids });
    };
    const toggleSector = (id: string) => {
      const ids = prop.sectorIds.includes(id)
        ? prop.sectorIds.filter(x => x !== id)
        : [...prop.sectorIds, id];
      updateProp(prop.id, { sectorIds: ids });
    };

    return (
      <div
        className={`${cardCls} transition-all`}
        style={{ opacity: isRe ? 0.45 : 1, borderLeft: `4px solid ${isAp ? '#22c55e' : isRe ? '#ef4444' : (isDark ? '#334155' : '#e2e8f0')}` }}
      >
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: ts.bg }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: ts.text }}>{ts.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            {/* Badges: tipo + PESTEL(s) + Sector(s) + evidencia */}
            <div className="flex flex-wrap items-center gap-1 mb-1">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: ts.bg, color: ts.text }}>
                {ts.label}
              </span>
              {prop.pestelIds.length > 0
                ? prop.pestelIds.map(pid => {
                    const p = pestels.find(x => x.id_pestel === pid);
                    if (!p) return null;
                    return (
                      <span key={pid} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9', color: p.color || '#64748b', border: `1px solid ${p.color || '#64748b'}40` }}>
                        {p.letra_codigo} · {p.nombre_pestel}
                      </span>
                    );
                  })
                : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>PESTEL pendiente</span>
              }
              {prop.sectorIds.length > 0
                ? prop.sectorIds.map(sid => {
                    const s = sectors.find(x => x.id_sector === sid);
                    if (!s) return null;
                    return (
                      <span key={sid} className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: isDark ? '#1e293b' : '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}>
                        {s.nombre_sector}
                      </span>
                    );
                  })
                : <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>Sector pendiente</span>
              }
              {prop.tipo === 'escenario' && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button" title={`Probabilidad ${n}/5`}
                      onClick={() => updateProp(prop.id, { probabilidad: prop.probabilidad === n ? null : n })}
                      className="text-base leading-none focus:outline-none transition-colors"
                      style={{ color: (prop.probabilidad || 0) >= n ? '#16a34a' : '#d1d5db' }}>
                      ●
                    </button>
                  ))}
                  <span className="text-[10px] font-bold ml-0.5" style={{ color: prop.probabilidad ? '#16a34a' : '#9ca3af' }}>
                    {prop.probabilidad ? `${prop.probabilidad}/5` : '?/5'}
                  </span>
                </span>
              )}
            </div>
            {/* Título */}
            <input
              type="text" value={prop.editTitulo} maxLength={180}
              onChange={e => updateProp(prop.id, { editTitulo: e.target.value })}
              className={`block w-full text-sm font-semibold bg-transparent border-0 border-b outline-none pb-0.5 mt-1 ${themeColors.headerText}`}
              style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}
              placeholder="Título (hasta 180 caracteres)"
            />
            {/* Nombre corto */}
            <input
              type="text" value={prop.editNombre} maxLength={55}
              onChange={e => updateProp(prop.id, { editNombre: e.target.value })}
              className="block w-full text-[11px] bg-transparent border-0 outline-none mt-0.5"
              style={{ color: '#9ca3af' }}
              placeholder="nombre-corto (3-5 palabras)"
            />
            {/* Desc corta */}
            <textarea
              value={prop.editDescCorta} maxLength={200} rows={2}
              onChange={e => updateProp(prop.id, { editDescCorta: e.target.value })}
              className="mt-1 block w-full text-xs bg-transparent border-0 outline-none resize-none"
              style={{ color: '#6b7280', lineHeight: 1.5 }}
              placeholder="Descripción corta…"
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button type="button" onClick={() => updateProp(prop.id, { decision: isAp ? 'pendiente' : 'aprobada' })}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
              style={{ backgroundColor: isAp ? '#22c55e' : (isDark ? '#1e293b' : '#f0fdf4'), color: isAp ? '#fff' : '#16a34a', border: `1px solid ${isAp ? '#22c55e' : '#bbf7d0'}` }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{isAp ? 'check_circle' : 'check'}</span>
              {isAp ? 'Aprobada' : 'Aprobar'}
            </button>
            <button type="button" onClick={() => updateProp(prop.id, { decision: isRe ? 'pendiente' : 'rechazada' })}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
              style={{ backgroundColor: isRe ? '#ef4444' : (isDark ? '#1e293b' : '#fef2f2'), color: isRe ? '#fff' : '#dc2626', border: `1px solid ${isRe ? '#ef4444' : '#fecaca'}` }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
              {isRe ? 'Rechazada' : 'Rechazar'}
            </button>
          </div>
        </div>

        <div className={`border-t ${themeColors.cardBorder}`}>
          {/* type="button" evita scroll-to-top al expandir */}
          <button type="button" onClick={() => handleToggleExpand(prop.id, prop.expanded)}
            className="flex items-center gap-1 text-xs font-medium px-4 py-2" style={{ color: '#1978e5' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, transform: prop.expanded ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>chevron_right</span>
            {prop.expanded ? 'Ocultar' : 'Ver detalle + asignar PESTEL y Sector'}
          </button>
          {prop.expanded && (
            <div className="px-4 pb-4 space-y-3" onFocusCapture={handleFocusLock}>

              {/* PESTEL multi-chip */}
              <div>
                <label className="block text-[11px] font-semibold mb-1.5" style={{ color: needPestel ? '#dc2626' : '#9ca3af' }}>
                  PESTEL <span style={{ color: '#ef4444' }}>*</span>
                  {needPestel && <span className="ml-1 font-normal">— selecciona al menos uno</span>}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {pestels.map(p => {
                    const active = prop.pestelIds.includes(p.id_pestel);
                    return (
                      <button key={p.id_pestel} type="button" onClick={() => togglePestel(p.id_pestel)}
                        className="text-[11px] px-2.5 py-1 rounded-full border font-medium transition-all"
                        style={{
                          backgroundColor: active ? (p.color || '#64748b') : 'transparent',
                          color:           active ? '#fff' : (p.color || '#64748b'),
                          borderColor:     p.color || '#64748b',
                        }}>
                        {p.letra_codigo} – {p.nombre_pestel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTOR multi-chip */}
              <div>
                <label className="block text-[11px] font-semibold mb-1.5" style={{ color: needSector ? '#dc2626' : '#9ca3af' }}>
                  SECTOR <span style={{ color: '#ef4444' }}>*</span>
                  {needSector && <span className="ml-1 font-normal">— selecciona al menos uno</span>}
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {sectors.map(s => {
                    const active = prop.sectorIds.includes(s.id_sector);
                    return (
                      <button key={s.id_sector} type="button" onClick={() => toggleSector(s.id_sector)}
                        className="text-[11px] px-2 py-0.5 rounded border transition-all"
                        style={{
                          backgroundColor: active ? '#1e40af' : 'transparent',
                          color:           active ? '#fff' : (isDark ? '#94a3b8' : '#64748b'),
                          borderColor:     active ? '#1e40af' : (isDark ? '#334155' : '#d1d5db'),
                        }}>
                        {s.nombre_sector}
                      </button>
                    );
                  })}
                </div>
              </div>
              {prop.temasRelacionados.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: '#9ca3af' }}>TEMAS RELACIONADOS</p>
                  <div className="flex flex-wrap gap-1">
                    {prop.temasRelacionados.map((t, i) => (
                      <span key={i} className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9', color: '#64748b' }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {prop.urlsFuente.length > 0 && prop.tipo !== 'escenario' && (
                <div>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: '#9ca3af' }}>URLS FUENTE ({prop.urlsFuente.length})</p>
                  <div className="space-y-0.5 max-h-28 overflow-y-auto">
                    {prop.urlsFuente.map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                        className="block text-[11px] truncate hover:underline" style={{ color: '#1978e5' }}>{u}</a>
                    ))}
                  </div>
                </div>
              )}
              {/* ── Campos específicos por tipo ─────────────────── */}
              {prop.tipo === 'senal' && (
                <div className="space-y-2">
                  {prop.descLarga && (
                    <div>
                      <p className="text-[10px] font-semibold mb-1" style={{ color: '#9ca3af' }}>DESCRIPCIÓN COMPLETA</p>
                      <div className="rounded-lg px-3 py-2 max-h-48 overflow-y-auto" style={{ backgroundColor: isDark ? '#1e293b' : '#f8fafc' }}>
                        <p className="text-xs whitespace-pre-wrap" style={{ color: isDark ? '#e2e8f0' : '#374151', lineHeight: 1.6 }}>{prop.descLarga}</p>
                      </div>
                    </div>
                  )}
                  {(prop.fuente || prop.urlFuente) && (
                    <div className="grid grid-cols-2 gap-2">
                      {prop.fuente && (
                        <div>
                          <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#9ca3af' }}>FUENTE</p>
                          <p className="text-xs" style={{ color: isDark ? '#e2e8f0' : '#374151' }}>{prop.fuente}</p>
                        </div>
                      )}
                      {prop.urlFuente && (
                        <div>
                          <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#9ca3af' }}>URL FUENTE</p>
                          <a href={prop.urlFuente} target="_blank" rel="noopener noreferrer"
                            className="block text-[11px] truncate hover:underline" style={{ color: '#1978e5' }}>{prop.urlFuente}</a>
                        </div>
                      )}
                    </div>
                  )}
                  {(prop.paisOrigen || prop.fechaArticulo) && (
                    <div className="grid grid-cols-2 gap-2">
                      {prop.paisOrigen && (
                        <div>
                          <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#9ca3af' }}>PAÍS DE ORIGEN</p>
                          <p className="text-xs" style={{ color: isDark ? '#e2e8f0' : '#374151' }}>{prop.paisOrigen}</p>
                        </div>
                      )}
                      {prop.fechaArticulo && (
                        <div>
                          <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#9ca3af' }}>FECHA ARTÍCULO</p>
                          <p className="text-xs" style={{ color: isDark ? '#e2e8f0' : '#374151' }}>{prop.fechaArticulo}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {prop.cifrasClave && prop.cifrasClave.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold mb-1" style={{ color: '#9ca3af' }}>CIFRAS CLAVE</p>
                      <div className="flex flex-wrap gap-1">
                        {prop.cifrasClave.map((c, i) => (
                          <span key={i} className="text-[11px] px-2 py-0.5 rounded"
                            style={{ backgroundColor: isDark ? '#1e293b' : '#fef3c7', color: '#92400e' }}>{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(prop.urlImagen || prop.urlVideo) && (
                    <div className="grid grid-cols-2 gap-2">
                      {prop.urlImagen && (
                        <div>
                          <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#9ca3af' }}>IMAGEN</p>
                          <a href={prop.urlImagen} target="_blank" rel="noopener noreferrer"
                            className="block text-[11px] truncate hover:underline" style={{ color: '#1978e5' }}>{prop.urlImagen}</a>
                        </div>
                      )}
                      {prop.urlVideo && (
                        <div>
                          <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#9ca3af' }}>VIDEO</p>
                          <a href={prop.urlVideo} target="_blank" rel="noopener noreferrer"
                            className="block text-[11px] truncate hover:underline" style={{ color: '#1978e5' }}>{prop.urlVideo}</a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {prop.tipo === 'tendencia' && (
                <div className="space-y-2">
                  {prop.descLarga && (
                    <div>
                      <p className="text-[10px] font-semibold mb-1" style={{ color: '#9ca3af' }}>DESCRIPCIÓN COMPLETA</p>
                      <div className="rounded-lg px-3 py-2 max-h-48 overflow-y-auto" style={{ backgroundColor: isDark ? '#1e293b' : '#f8fafc' }}>
                        <p className="text-xs whitespace-pre-wrap" style={{ color: isDark ? '#e2e8f0' : '#374151', lineHeight: 1.6 }}>{prop.descLarga}</p>
                      </div>
                    </div>
                  )}
                  {prop.fundamentoAnalitico && (
                    <div>
                      <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#9ca3af' }}>FUNDAMENTO ANALÍTICO</p>
                      <p className="text-xs" style={{ color: isDark ? '#e2e8f0' : '#374151', lineHeight: 1.5 }}>{prop.fundamentoAnalitico}</p>
                    </div>
                  )}
                  {prop.senalesSoporte && prop.senalesSoporte.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold mb-1" style={{ color: '#9ca3af' }}>SEÑALES DE SOPORTE</p>
                      <div className="space-y-0.5">
                        {prop.senalesSoporte.map((s, i) => (
                          <p key={i} className="text-[11px]" style={{ color: '#6b7280' }}>• {s}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {prop.tipo === 'escenario' && (
                <div className="space-y-2">
                  {prop.descLarga && (
                    <div>
                      <p className="text-[10px] font-semibold mb-1" style={{ color: '#9ca3af' }}>DESCRIPCIÓN COMPLETA</p>
                      <div className="rounded-lg px-3 py-2 max-h-48 overflow-y-auto" style={{ backgroundColor: isDark ? '#1e293b' : '#f8fafc' }}>
                        <p className="text-xs whitespace-pre-wrap" style={{ color: isDark ? '#e2e8f0' : '#374151', lineHeight: 1.6 }}>{prop.descLarga}</p>
                      </div>
                    </div>
                  )}
                  {prop.tendenciasSoporte && prop.tendenciasSoporte.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold mb-1" style={{ color: '#9ca3af' }}>TENDENCIAS DE SOPORTE</p>
                      <div className="flex flex-wrap gap-1">
                        {prop.tendenciasSoporte.map((t, i) => (
                          <span key={i} className="text-[11px] px-2 py-0.5 rounded"
                            style={{ backgroundColor: isDark ? '#052e16' : '#f0fdf4', color: '#15803d' }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {prop.referencias && prop.referencias.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold mb-1" style={{ color: '#9ca3af' }}>REFERENCIAS ({prop.referencias.length})</p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {prop.referencias.map((r, i) => (
                          <p key={i} className="text-[11px]" style={{ color: isDark ? '#cbd5e1' : '#475569', lineHeight: 1.45 }}>{r}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* ── Fragmento de origen ─────────────────────────── */}
              {prop.fragmento && (
                <div className="rounded-lg px-3 py-2" style={{ backgroundColor: isDark ? '#1e293b' : '#f8fafc' }}>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: '#9ca3af' }}>FRAGMENTO DE ORIGEN</p>
                  <p className="text-xs italic" style={{ color: '#6b7280', lineHeight: 1.5 }}>"{prop.fragmento}"</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── RENDER ───────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">

      {/* Breadcrumb */}
      <nav className="text-xs font-medium mb-6 flex items-center gap-1" style={{ color: '#9ca3af' }}>
        <button onClick={onVolver} className="hover:underline" style={{ color: '#1978e5' }}>Gestión</button>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
        <span className={themeColors.headerText}>Importar Artículo</span>
      </nav>

      {/* Stepper */}
      <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-1">
        {STEP_LABELS.map((label, i) => {
          const done = i < stepIdx; const cur = i === stepIdx;
          return (
            <React.Fragment key={label}>
              <div className="flex flex-col items-center flex-shrink-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: done ? '#22c55e' : cur ? '#1978e5' : (isDark ? '#334155' : '#e2e8f0'), color: done || cur ? '#fff' : '#94a3b8' }}>
                  {done ? <span className="material-symbols-outlined" style={{ fontSize: 15 }}>check</span> : i + 1}
                </div>
                <span className="text-xs mt-1 font-medium" style={{ color: cur ? '#1978e5' : '#9ca3af', whiteSpace: 'nowrap' }}>{label}</span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 mb-4" style={{ backgroundColor: done ? '#22c55e' : (isDark ? '#334155' : '#e2e8f0'), minWidth: 20 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ══ PASO 1: FUENTE ══ */}
      {step === 'fuente' && (
        <div className={`${cardCls} p-6 space-y-5`}>
          <div>
            <h2 className={`text-lg font-bold mb-1 ${themeColors.headerText}`}>Subir PDF del artículo</h2>
            <p className="text-xs" style={{ color: '#6b7280' }}>
              El sistema extrae todo el texto e hipervínculos del PDF, luego la IA clasifica señales, tendencias y escenarios con metodología WEF.
            </p>
          </div>

          {/* Zona de carga del PDF */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => !extrayendo && !pdfInfo && fileInputRef.current?.click()}
            className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 py-10 transition-colors cursor-pointer"
            style={{
              borderColor: pdfInfo ? '#22c55e' : extrayendo ? '#1978e5' : (isDark ? '#334155' : '#e2e8f0'),
              backgroundColor: pdfInfo ? (isDark ? '#052e16' : '#f0fdf4') : extrayendo ? (isDark ? '#1e3a5f' : '#eff6ff') : (isDark ? '#1e293b' : '#f8fafc'),
            }}
          >
            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfSelect(f); }} />

            {extrayendo ? (
              <>
                <Loader2 size={28} className="animate-spin" style={{ color: '#1978e5' }} />
                <p className="text-sm font-medium" style={{ color: '#1978e5' }}>Extrayendo texto e hipervínculos…</p>
              </>
            ) : pdfInfo ? (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#22c55e' }}>picture_as_pdf</span>
                <div className="text-center">
                  <p className="text-sm font-semibold" style={{ color: '#15803d' }}>{pdfFile?.name}</p>
                  <div className="flex items-center justify-center gap-3 mt-1 text-xs" style={{ color: '#6b7280' }}>
                    <span>{pdfInfo.pages} pág.</span>
                    <span>·</span>
                    <span>{(pdfInfo.chars / 1000).toFixed(1)}k caracteres</span>
                    {pdfInfo.links > 0 && <><span>·</span><span style={{ color: '#1978e5' }}>{pdfInfo.links} hipervínculos</span></>}
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setPdfFile(null); setPdfTexto(''); setPdfInfo(null); setPreviewOpen(false); }}
                  className="text-xs px-3 py-1 rounded-lg border" style={{ borderColor: '#e5e7eb', color: '#6b7280' }}>
                  Cambiar PDF
                </button>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 36, color: isDark ? '#64748b' : '#94a3b8' }}>upload_file</span>
                <div className="text-center">
                  <p className="text-sm font-medium" style={{ color: isDark ? '#e2e8f0' : '#374151' }}>Arrastra el PDF aquí o haz clic para seleccionar</p>
                  <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>Se extrae el texto completo incluyendo hipervínculos embebidos · Máx. 20 MB</p>
                </div>
              </>
            )}
          </div>

          {/* Error de extracción */}
          {pdfError && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>
              <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 17, marginTop: 1 }}>error</span>
              <p className="text-sm">{pdfError}</p>
            </div>
          )}

          {/* Vista previa del texto extraído */}
          {pdfTexto && (
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
              <button
                onClick={() => setPreviewOpen(v => !v)}
                className="flex items-center justify-between w-full px-4 py-2.5 text-xs font-semibold"
                style={{ backgroundColor: isDark ? '#1e293b' : '#f8fafc', color: isDark ? '#94a3b8' : '#64748b' }}>
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>subject</span>
                  Vista previa del texto extraído
                </span>
                <span className="material-symbols-outlined" style={{ fontSize: 15, transform: previewOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>expand_more</span>
              </button>
              {previewOpen && (
                <pre className="px-4 py-3 text-[11px] overflow-auto max-h-48 whitespace-pre-wrap"
                  style={{ color: isDark ? '#94a3b8' : '#6b7280', backgroundColor: isDark ? '#0f172a' : '#f8fafc', fontFamily: 'monospace' }}>
                  {pdfTexto.slice(0, 2000)}{pdfTexto.length > 2000 ? '\n… (texto truncado para vista previa)' : ''}
                </pre>
              )}
            </div>
          )}

          {/* Metadatos del artículo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1" style={{ color: isDark ? '#e2e8f0' : '#374151' }}>
                Título del informe <span style={{ color: '#9ca3af' }}>(tópico de trazabilidad)</span> <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input type="text" value={topico} onChange={e => setTopico(e.target.value)}
                placeholder="Ej: Futuro de la manufactura — WEF 2025" className={inputCls} maxLength={200} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: isDark ? '#e2e8f0' : '#374151' }}>Fuente / Organización</label>
              <input type="text" value={fuente} onChange={e => setFuente(e.target.value)}
                placeholder="Ej: World Economic Forum" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: isDark ? '#e2e8f0' : '#374151' }}>
                URL del documento <span className="font-normal" style={{ color: '#9ca3af' }}>(opcional)</span>
              </label>
              <input type="url" value={urlFuente} onChange={e => setUrlFuente(e.target.value)}
                placeholder="https://…" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: isDark ? '#e2e8f0' : '#374151' }}>
                Autor <span className="font-normal" style={{ color: '#9ca3af' }}>(extraído automáticamente de "Seleccionado, filtrado y editado con…")</span>
              </label>
              <input type="text" value={autorPdf} onChange={e => setAutorPdf(e.target.value)}
                placeholder="Se detecta del PDF automáticamente" className={inputCls} />
            </div>
          </div>

          {aiError && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>
              <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 17, marginTop: 1 }}>error</span>
              <p className="text-sm">{aiError}</p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleProcesar}
              disabled={!pdfInfo || !topico.trim() || extrayendo}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: '#1978e5' }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#1462c2'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#1978e5'; }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span>
              Analizar con IA
            </button>
          </div>
        </div>
      )}

      {/* ══ PASO 2: PROCESANDO ══ */}
      {step === 'procesando' && (
        <div className={`${cardCls} p-10 flex flex-col items-center gap-6`}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#eff6ff' }}>
            <Loader2 size={32} className="animate-spin" style={{ color: '#1978e5' }} />
          </div>
          <div className="text-center">
            <h2 className={`text-lg font-bold mb-1 ${themeColors.headerText}`}>Analizando el informe…</h2>
            <p className="text-sm" style={{ color: '#6b7280' }}>La IA aplica metodología WEF Horizon Scanning al texto completo del PDF.</p>
          </div>
          <div className="w-full max-w-xs space-y-3">
            {[
              { key: 'senales',    label: 'Extrayendo señales de empresa…',       icon: 'wifi_tethering' },
              { key: 'tendencias', label: 'Extrayendo tendencias estratégicas…',  icon: 'trending_up'    },
              { key: 'escenarios', label: 'Extrayendo escenarios (previsiones)…', icon: 'auto_awesome'   },
              { key: 'relaciones', label: 'Sugiriendo relaciones WEF…',           icon: 'hub'            },
            ].map(({ key, label, icon }) => {
              const st = progreso[key];
              return (
                <div key={key} className="flex items-center gap-3">
                  {st === 'loading' && <Loader2 size={16} className="animate-spin flex-shrink-0" style={{ color: '#1978e5' }} />}
                  {st === 'done'    && <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 18, color: '#22c55e' }}>check_circle</span>}
                  {st === 'error'   && <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 18, color: '#f59e0b' }}>warning</span>}
                  {st === 'idle'    && <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 18, color: '#cbd5e1' }}>{icon}</span>}
                  <span className="text-sm" style={{ color: st === 'done' ? '#22c55e' : st === 'loading' ? '#1978e5' : '#9ca3af' }}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ PASO 3: REVISIÓN ══ */}
      {step === 'revision' && (
        <div className="space-y-4">
          <div className={`${cardCls} px-5 py-3 flex flex-wrap items-center gap-3`}>
            <div className="flex items-center gap-2 text-sm">
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#1978e5' }}>picture_as_pdf</span>
              <strong className={themeColors.headerText}>Tópico:</strong>
              <span style={{ color: '#6b7280' }}>{topico}</span>
            </div>
            <div className="flex items-center gap-3 ml-auto text-xs font-semibold flex-wrap">
              {nSen  > 0 && <span style={{ color: '#92400e' }}>⚡ {nSen} señales</span>}
              {nTend > 0 && <span style={{ color: '#1e40af' }}>📈 {nTend} tendencias</span>}
              {nEsc  > 0 && <span style={{ color: '#15803d' }}>✨ {nEsc} escenarios</span>}
              {nRel  > 0 && <span style={{ color: '#7c3aed' }}>🔗 {nRel} relaciones</span>}
            </div>
          </div>

          <div className={`inline-flex p-1 rounded-xl border ${themeColors.cardBg} ${themeColors.cardBorder}`}>
            {([ ['senales','SEÑALES',nSen], ['tendencias','TENDENCIAS',nTend], ['escenarios','ESCENARIOS',nEsc], ['relaciones','RELACIONES',nRel] ] as [TabRevision, string, number][]).map(([key, label, count]) => (
              <button key={key} onClick={() => setTabRev(key)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${tabRev === key ? 'text-white shadow-sm' : `opacity-60 hover:opacity-90 ${themeColors.text}`}`}
                style={tabRev === key ? { background: key === 'senales' ? '#f59e0b' : key === 'tendencias' ? '#3b82f6' : key === 'escenarios' ? '#22c55e' : '#7c3aed' } : undefined}>
                {label}
                {count > 0 && <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center ${tabRev === key ? 'bg-white/25' : 'bg-black/10'}`}>{count}</span>}
              </button>
            ))}
          </div>

          {tabRev !== 'relaciones' && (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPropuestas(prev => prev.map(p =>
                  (tabRev === 'senales' && p.tipo === 'senal') ||
                  (tabRev === 'tendencias' && p.tipo === 'tendencia') ||
                  (tabRev === 'escenarios' && p.tipo === 'escenario')
                    ? { ...p, decision: 'aprobada' } : p
                ))}
                className="text-xs font-semibold px-3 py-1 rounded-full border" style={{ borderColor: '#22c55e', color: '#16a34a' }}>
                Aprobar todas
              </button>
            </div>
          )}

          <div className="space-y-3" style={{ overflowAnchor: 'none' }}>
            {tabRev === 'senales'    && propuestas.filter(p => p.tipo === 'senal').map(p     => <PropCard key={p.id} prop={p} />)}
            {tabRev === 'tendencias' && propuestas.filter(p => p.tipo === 'tendencia').map(p => <PropCard key={p.id} prop={p} />)}
            {tabRev === 'escenarios' && propuestas.filter(p => p.tipo === 'escenario').map(p => <PropCard key={p.id} prop={p} />)}
            {tabRev === 'relaciones' && (
              relaciones.length === 0
                ? <div className="text-center py-8 text-sm" style={{ color: '#9ca3af' }}>No se sugirieron relaciones.</div>
                : relaciones.map((r, i) => (
                  <div key={i} className={`${cardCls} px-4 py-3 flex items-center gap-3`}>
                    <input type="checkbox" checked={r.aceptada}
                      onChange={e => setRelaciones(prev => prev.map((x, j) => j === i ? { ...x, aceptada: e.target.checked } : x))}
                      className="rounded flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate" style={{ color: isDark ? '#e2e8f0' : '#374151' }}>
                        <span className="font-semibold">{r.labelOrigen}</span>
                        <span className="mx-2 font-bold" style={{ color: r.tipo === 'senal_tendencia' ? '#f59e0b' : r.tipo === 'senal_escenario' ? '#8b5cf6' : '#22c55e' }}>→</span>
                        <span className="font-semibold">{r.labelDestino}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {r.confianzaRelacion && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                          backgroundColor: r.confianzaRelacion === 'alto' ? '#f0fdf4' : r.confianzaRelacion === 'medio' ? '#fefce8' : '#fef2f2',
                          color:           r.confianzaRelacion === 'alto' ? '#15803d' : r.confianzaRelacion === 'medio' ? '#a16207' : '#dc2626',
                        }}>
                          {r.confianzaRelacion}
                        </span>
                      )}
                      <span className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: r.tipo === 'senal_tendencia' ? '#fef3c7' : r.tipo === 'senal_escenario' ? '#f5f3ff' : '#f0fdf4', color: r.tipo === 'senal_tendencia' ? '#92400e' : r.tipo === 'senal_escenario' ? '#6d28d9' : '#15803d' }}>
                        {r.tipo === 'senal_tendencia' ? 'señal → tendencia' : r.tipo === 'senal_escenario' ? 'señal → escenario' : 'tendencia → escenario'}
                      </span>
                    </div>
                  </div>
                ))
            )}
          </div>

          {saveError && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>
              <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 17, marginTop: 1 }}>error</span>
              <p className="text-sm">{saveError}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => { setStep('fuente'); setAiError(null); setSaveError(null); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium"
              style={{ borderColor: '#e5e7eb', color: '#6b7280' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_back</span>
              Volver
            </button>
            <button onClick={handleConfirmar} disabled={saving || nApr === 0}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: '#22c55e' }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#16a34a'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#22c55e'; }}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <span className="material-symbols-outlined" style={{ fontSize: 17 }}>save</span>}
              {saving ? 'Guardando…' : `Guardar ${nApr} elemento${nApr !== 1 ? 's' : ''} como borrador`}
            </button>
          </div>
        </div>
      )}

      {/* ══ PASO 4: CONFIRMADO ══ */}
      {step === 'confirmado' && resultado && (
        <div className={`${cardCls} p-10 flex flex-col items-center gap-6 text-center`}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#f0fdf4' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 38, color: '#22c55e' }}>check_circle</span>
          </div>
          <div>
            <h2 className={`text-xl font-bold mb-2 ${themeColors.headerText}`}>
              {resultado.creados > 0 ? `${resultado.creados} elemento${resultado.creados !== 1 ? 's' : ''} guardados como borrador` : 'Sin elementos guardados'}
            </h2>
            {resultado.topicoNombre && (
              <p className="text-sm mb-1" style={{ color: '#6b7280' }}>
                Tópico: <strong>{resultado.topicoNombre}</strong>
              </p>
            )}
            {resultado.relaciones > 0 && (
              <p className="text-sm" style={{ color: '#6b7280' }}>
                + {resultado.relaciones} relación{resultado.relaciones !== 1 ? 'es' : ''} creada{resultado.relaciones !== 1 ? 's' : ''}
              </p>
            )}
            <p className="text-xs mt-2" style={{ color: '#9ca3af' }}>
              Aparecerán en Señales / Tendencias / Escenarios con estado "Borrador". Edítalos y publícalos desde allí.
            </p>
          </div>
          {resultado.errores?.length > 0 && (
            <div className="w-full rounded-lg px-4 py-3 text-left" style={{ backgroundColor: '#fef2f2' }}>
              <p className="text-xs font-bold mb-2" style={{ color: '#dc2626' }}>Errores al guardar ({resultado.errores.length}):</p>
              <ul className="space-y-1">
                {resultado.errores.map((e: any, i: number) => (
                  <li key={i} className="text-xs" style={{ color: '#dc2626' }}>• {e.titulo}: {e.error}</li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={handleNuevo}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-semibold shadow-sm transition-all active:scale-95"
            style={{ backgroundColor: '#1978e5' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>add</span>
            Importar otro artículo
          </button>
        </div>
      )}
    </div>
  );
};

export default ImportarView;
