// services/geminiService.ts
// Servicio de IA â€” HuggingFace (mÃ©tricas/anÃ¡lisis) + Groq Llama 3.1 (importaciÃ³n PDF)
// Proyecto: RADAR Observatorio de Carreras â€” metodologÃ­a de prospectiva (WEF Foresight)
import type { Signal } from '../types';

const AUTH = () => ({ 'Content-Type': 'application/json' });

// Análisis de Disrupción — token HF_API_KEY
async function callHF(prompt: string, maxTokens = 600): Promise<string> {
  const res = await fetch('/api/ai/generate', { method: 'POST', headers: AUTH(), body: JSON.stringify({ prompt, maxTokens }) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error || `Error ${res.status}`); }
  const data = await res.json();
  return data.text || 'No se obtuvo respuesta.';
}

// Métricas — token HF_API_KEY_METRICS (cuota independiente)
async function callMetrics(prompt: string, maxTokens = 120): Promise<string> {
  const res = await fetch('/api/ai/metrics', { method: 'POST', headers: AUTH(), body: JSON.stringify({ prompt, maxTokens }) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error || `Error ${res.status}`); }
  const data = await res.json();
  return data.text || '';
}

// Matriz de Escenarios Futuros — token HF_API_KEY_ESCENARIOS (cuota independiente)
async function callEscenarios(prompt: string, maxTokens = 1200): Promise<string> {
  const res = await fetch('/api/ai/escenarios', { method: 'POST', headers: AUTH(), body: JSON.stringify({ prompt, maxTokens }) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error || `Error ${res.status}`); }
  const data = await res.json();
  return data.text || 'No se obtuvo respuesta.';
}

// â”€â”€ Definiciones metodolÃ³gicas WEF (inyectadas en cada prompt) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DEF_SENAL = `
SEÃ‘AL DE CAMBIO (Weak Signal â€” MetodologÃ­a WEF Horizon Scanning):
Indicio temprano, parcial o incipiente de un cambio potencialmente importante que aÃºn no es ampliamente reconocido ni entendido.
NO es todavÃ­a una tendencia confirmada ni una predicciÃ³n. Es evidencia fragmentaria que puede anunciar la emergencia de nuevas tendencias o disrupciones.
En el RADAR se usa para capturar, identificar y dar sentido a "drivers of change" antes de que se consoliden.
`.trim();

const DEF_TENDENCIA = `
TENDENCIA ESTRATÃ‰GICA (Trend â€” MetodologÃ­a WEF):
PatrÃ³n sostenido de cambio confirmado por mÃºltiples fuentes y casos a lo largo del tiempo, con direcciÃ³n e impulso identificables.
Diferencia clave vs seÃ±al: la seÃ±al es evidencia temprana/fragmentaria; la tendencia es un patrÃ³n repetido, observable y con tracciÃ³n.
En el WEF se enmarca como fuerza transformadora interconectada (Transformation Maps), derivada de seÃ±ales que han ganado consistencia.
`.trim();

const DEF_ESCENARIO = `
ESCENARIO FUTURO (Scenario â€” MetodologÃ­a WEF):
SimulaciÃ³n de un futuro posible y plausible. NO es una predicciÃ³n ni requiere probabilidad Ãºnica.
Articula tendencias, seÃ±ales dÃ©biles, wildcards e incertidumbres en una narrativa coherente Ãºtil para stress-testing de estrategias institucionales.
En el WEF los escenarios sirven para explorar "Â¿quÃ© decisiones deberÃ­a tomar hoy si este futuro se materializara?".
`.trim();

/**
 * 0) EstimaciÃ³n de Impacto & Urgencia â€” Gemini Flash evalÃºa un elemento y devuelve mÃ©tricas 0-100
 *    Se llama al abrir un card en RadarView (lazy, 1 llamada por item, se cachea en memoria)
 */
export async function estimateImpactUrgency(
  title: string,
  text: string,
  category: string,
  tipo: 'seÃ±al' | 'tendencia' | 'escenario'
): Promise<{ impact: number; urgency: number }> {
  const prompt = `
Analiza esta ${tipo} desde la perspectiva de impacto en educaciÃ³n superior universitaria y estima dos mÃ©tricas:
- impact: impacto institucional/curricular si este fenÃ³meno se materializa (0=irrelevante, 100=transformaciÃ³n total del sistema)
- urgency: velocidad con la que la instituciÃ³n debe actuar (0=puede esperar varios aÃ±os, 100=acciÃ³n inmediata en menos de 6 meses)

TÃ­tulo: ${title}
CategorÃ­a PESTEL: ${category}
DescripciÃ³n: ${text.slice(0, 500)}

Responde SOLO con JSON vÃ¡lido, sin texto adicional:
{"impact": <entero 0-100>, "urgency": <entero 0-100>}
`.trim();

  const raw = await callMetrics(prompt, 120);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { impact: 50, urgency: 50 };
  try {
    const parsed = JSON.parse(match[0]);
    return {
      impact:  Math.min(100, Math.max(0, Number(parsed.impact)  || 50)),
      urgency: Math.min(100, Math.max(0, Number(parsed.urgency) || 50)),
    };
  } catch {
    return { impact: 50, urgency: 50 };
  }
}

/**
 * 1) Resumen estratÃ©gico (Deep Dive) â€” para RadarView, botÃ³n "Generar Deep Dive AI"
 *    Adapta la estructura segÃºn si es seÃ±al, tendencia o escenario
 */
export async function analyzeSignalDeepDive(
  signal: Signal,
  tipo: 'seÃ±al' | 'tendencia' | 'escenario' = 'seÃ±al'
): Promise<string> {
  const definicion = tipo === 'seÃ±al' ? DEF_SENAL : tipo === 'tendencia' ? DEF_TENDENCIA : DEF_ESCENARIO;

  const estructuras: Record<string, string> = {
    'señal': `
**SÃ­ntesis de la seÃ±al**
Escribe 2-3 oraciones explicando quÃ© estÃ¡ ocurriendo, dÃ³nde se detecta y por quÃ© es relevante como indicio temprano.

**Riesgos si no se actÃºa a tiempo**
- Riesgo institucional concreto 1
- Riesgo institucional concreto 2

**Oportunidades curriculares que abre**
- Oportunidad curricular 1
- Oportunidad curricular 2

**Competencias profesionales en juego**
- Competencia 1
- Competencia 2

**PrÃ³ximos pasos recomendados**
- AcciÃ³n institucional concreta 1
- AcciÃ³n institucional concreta 2`,

    tendencia: `
**SÃ­ntesis de la tendencia**
Escribe 2-3 oraciones explicando quÃ© patrÃ³n se consolida, con quÃ© velocidad y en quÃ© Ã¡mbitos de la educaciÃ³n superior.

**Impacto en carreras universitarias**
- Carrera o Ã¡rea afectada 1
- Carrera o Ã¡rea afectada 2

**Competencias que esta tendencia vuelve crÃ­ticas**
- Competencia crÃ­tica 1
- Competencia crÃ­tica 2

**Riesgos curriculares de no adaptarse**
- Riesgo curricular 1
- Riesgo curricular 2

**Acciones estratÃ©gicas para la instituciÃ³n**
- AcciÃ³n estratÃ©gica concreta 1
- AcciÃ³n estratÃ©gica concreta 2`,

    escenario: `
**SÃ­ntesis del escenario**
Escribe 2-3 oraciones explicando quÃ© futuro articula este escenario y quÃ© combinaciÃ³n de fuerzas lo harÃ­a posible.

**Condiciones que harÃ­an este escenario probable**
- Factor o tendencia impulsora 1
- Factor o tendencia impulsora 2

**Implicaciones para el diseÃ±o curricular**
- ImplicaciÃ³n curricular 1
- ImplicaciÃ³n curricular 2

**Perfiles profesionales que emergerÃ­an o desaparecerÃ­an**
- Perfil profesional emergente o en riesgo 1
- Perfil profesional emergente o en riesgo 2

**Decisiones institucionales que deberÃ­an tomarse hoy**
- AcciÃ³n de preparaciÃ³n institucional 1
- AcciÃ³n de preparaciÃ³n institucional 2`
  };

  const prompt = `
Marco metodolÃ³gico que debes aplicar:
${definicion}

---
Elemento a analizar:
- TÃ­tulo: ${signal.title}
- CategorÃ­a PESTEL: ${signal.category}
- DescripciÃ³n: ${signal.signalText}
- ImplicaciÃ³n directiva: ${signal.implicationText.replace(/<[^>]+>/g, '')}

Genera el resumen estratÃ©gico en espaÃ±ol usando EXACTAMENTE esta estructura. Reemplaza cada lÃ­nea de ejemplo con contenido real y especÃ­fico. NO copies los textos de ejemplo literalmente:
${estructuras[tipo]}
`.trim();

  const raw = await callHF(prompt, 800);
  // Limpiar artefactos: lÃ­neas que son solo placeholders sin contenido real
  return raw
    .replace(/^-\s*\[.*?\]\s*$/gm, '')   // elimina "- [texto placeholder]"
    .replace(/^\[.*?\]\s*$/gm, '')         // elimina "[texto placeholder]" solo en su lÃ­nea
    .replace(/\n{3,}/g, '\n\n')            // colapsa lÃ­neas vacÃ­as mÃºltiples
    .trim();
}

/**
 * 2) Racional del Cambio â€” auto-generado al abrir cualquier modal en RadarView
 *    UN pÃ¡rrafo analÃ­tico que explica las raÃ­ces estructurales del cambio.
 *    NO incluye recomendaciones. Es el fundamento teÃ³rico del fenÃ³meno.
 */
export async function generateRazonCambio(
  titulo: string,
  descCorta: string,
  tipo: 'seÃ±al' | 'tendencia' | 'escenario'
): Promise<string> {
  const definicion = tipo === 'seÃ±al' ? DEF_SENAL : tipo === 'tendencia' ? DEF_TENDENCIA : DEF_ESCENARIO;
  const tipoLabel  = tipo === 'seÃ±al' ? 'seÃ±al de cambio' : tipo === 'tendencia' ? 'tendencia estratÃ©gica' : 'escenario futuro';

  const prompt = `
Marco metodolÃ³gico:
${definicion}

---
Redacta el "Racional del Cambio" para esta ${tipoLabel} en educaciÃ³n superior universitaria.

Escribe UN solo pÃ¡rrafo (3-5 oraciones) que explique ÃšNICAMENTE por quÃ© este cambio estÃ¡ ocurriendo:
sus raÃ­ces estructurales, el contexto histÃ³rico y las fuerzas (tecnolÃ³gicas, econÃ³micas, sociales, polÃ­ticas) que lo impulsan.
NO incluyas recomendaciones, acciones ni predicciones. Solo el fundamento analÃ­tico del cambio.
Responde SOLO con el pÃ¡rrafo, sin tÃ­tulo ni encabezado.

TÃ­tulo: ${titulo}
DescripciÃ³n: ${descCorta}
`.trim();

  return callHF(prompt, 300);
}

/**
 * 3) RediseÃ±o curricular â€” para ImpactosView
 */
export async function analyzeCurricularRedesign(payload: any): Promise<string> {
  const prompt = `
Usando metodologÃ­a de prospectiva estratÃ©gica (seÃ±ales â†’ tendencias â†’ escenarios), analiza estos datos del RADAR Observatorio de Carreras
y propÃ³n un rediseÃ±o curricular universitario en espaÃ±ol. Incluye:
- Cursos que deben actualizarse y por quÃ©
- Nuevos mÃ³dulos o asignaturas sugeridas
- Competencias transversales por semestre
- Riesgos de no implementar los cambios

DATOS:
${JSON.stringify(payload, null, 2)}
`.trim();

  return callHF(prompt, 900);
}

/**
 * 4) Brief ejecutivo de prospectiva â€” para ReportsView
 */
export async function generateForesightBrief(input: any): Promise<string> {
  const prompt = `
Genera un brief ejecutivo de prospectiva para la instituciÃ³n universitaria, en espaÃ±ol, basado en datos del RADAR Observatorio de Carreras.
Estructura:
**Contexto del entorno**
**SeÃ±ales clave identificadas**
**Tendencias dominantes**
**Escenarios posibles (2-3)**
**Recomendaciones estratÃ©gicas**
**PrÃ³ximos pasos institucionales**

DATOS:
${JSON.stringify(input, null, 2)}
`.trim();

  return callHF(prompt, 900);
}

// â”€â”€ Tipos para herramientas prospectivas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ScenarioMatrixData {
  driver1: string;
  driver2: string;
  topRight:    { title: string; description: string };
  topLeft:     { title: string; description: string };
  bottomRight: { title: string; description: string };
  bottomLeft:  { title: string; description: string };
}

export interface FuturesWheelData {
  center: string;
  firstOrder: string[];
  secondOrder: string[][];
}

/**
 * 5) Matriz de Escenarios Futuros 2Ã—2
 *    Input: tendencia estratÃ©gica
 *    Output: JSON con 2 drivers + 4 escenarios (cuadrantes)
 */
export async function generateScenarioMatrix(
  items: Array<{ name: string; description: string; category: string; type?: string }>
): Promise<ScenarioMatrixData> {
  const itemsBlock = items.length === 1
    ? `TENDENCIA/SEÃ‘AL: ${items[0].name}\nDESCRIPCIÃ“N: ${items[0].description}\nCATEGORÃA PESTEL: ${items[0].category}`
    : items.map((it, i) => `[${i + 1}] ${it.name} (${it.category}): ${it.description}`).join('\n');

  const intro = items.length === 1
    ? 'Analiza esta tendencia/seÃ±al y crea una Matriz de Escenarios Futuros 2Ã—2 para educaciÃ³n superior universitaria.'
    : `Analiza estas ${items.length} tendencias/seÃ±ales de forma integrada y crea una Matriz de Escenarios Futuros 2Ã—2 que capture la interacciÃ³n entre ellas para educaciÃ³n superior universitaria.`;

  const prompt = `
Eres experto en prospectiva estratÃ©gica (metodologÃ­a WEF Foresight). ${intro}

${itemsBlock}

Identifica los 2 ejes de incertidumbre crÃ­ticos:
- driver1 = eje horizontal (bajo a alto, de izquierda a derecha)
- driver2 = eje vertical (bajo a alto, de abajo a arriba)

Genera exactamente estos 4 tipos de escenarios, cada uno con su naturaleza propia:

- topRight (ESCENARIO PROBABLE): driver1 ALTO + driver2 ALTO.
  Naturaleza: lo que probablemente ocurrirÃ¡ si las tendencias actuales continÃºan. Se basa en datos, estadÃ­sticas y proyecciones lineales. Es el "business as usual" proyectado hacia adelante.

- topLeft (ESCENARIO POSIBLE): driver1 BAJO + driver2 ALTO.
  Naturaleza: todo lo que podrÃ­a ocurrir sin romper las leyes de la fÃ­sica o la lÃ³gica, aunque parezca improbable o no sepamos cÃ³mo llegar ahÃ­. El nivel mÃ¡s amplio de posibilidad.

- bottomRight (ESCENARIO PLAUSIBLE): driver1 ALTO + driver2 BAJO.
  Naturaleza: lo que podrÃ­a ocurrir con los recursos y conocimientos actuales. Tiene una lÃ³gica de causa-efecto explicable, aunque no haya pruebas de que vaya a ocurrir.

- bottomLeft (ESCENARIO ABSURDO): driver1 BAJO + driver2 BAJO.
  Naturaleza: el futuro que queremos que suceda, basado en valores e ideales institucionales, no en datos. Es el escenario preferible o deseable aunque parezca utÃ³pico hoy.

Para cada escenario la descripciÃ³n debe ser un pÃ¡rrafo rico de 4 a 5 oraciones que sea fiel a esa naturaleza especÃ­fica y explique: quÃ© ocurre en ese mundo, quÃ© fuerzas lo sostienen, quÃ© implica para las universidades y quÃ© actores son clave.

Responde SOLO con JSON vÃ¡lido (sin markdown, sin bloques de cÃ³digo):
{"driver1":"<eje horizontal, 3-5 palabras>","driver2":"<eje vertical, 3-5 palabras>","topRight":{"title":"<4-6 palabras>","description":"<pÃ¡rrafo de 4-5 oraciones>"},"topLeft":{"title":"<4-6 palabras>","description":"<pÃ¡rrafo de 4-5 oraciones>"},"bottomRight":{"title":"<4-6 palabras>","description":"<pÃ¡rrafo de 4-5 oraciones>"},"bottomLeft":{"title":"<4-6 palabras>","description":"<pÃ¡rrafo de 4-5 oraciones>"}}
`.trim();

  const raw = await callEscenarios(prompt, 1200);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('La IA no devolviÃ³ JSON vÃ¡lido para la matriz');
  return JSON.parse(match[0]);
}

/**
 * 6) ExpansiÃ³n de un cuadrante de la Matriz de Escenarios â€” para panel derecho
 */
export async function expandScenarioDetail(
  tendencia: string,
  quadrantLabel: string,
  scenario: { title: string; description: string }
): Promise<string> {
  const whyLabel =
    quadrantLabel === 'Escenario Probable'  ? 'Por quÃ© es probable' :
    quadrantLabel === 'Escenario Posible'   ? 'Por quÃ© es posible'  :
    quadrantLabel === 'Escenario Plausible' ? 'Por quÃ© es plausible':
    quadrantLabel === 'Escenario Absurdo'   ? 'Por quÃ© podrÃ­a ocurrir' :
    'Por quÃ© es relevante';

  const prompt = `
Eres experto en prospectiva estratÃ©gica para educaciÃ³n superior universitaria.
Expande este escenario futuro en profundidad.

TENDENCIA ANALIZADA: ${tendencia}
CUADRANTE: ${quadrantLabel}
ESCENARIO: ${scenario.title}
DESCRIPCIÃ“N BASE: ${scenario.description}

Genera un anÃ¡lisis en espaÃ±ol con exactamente estas 4 secciones (usa los tÃ­tulos tal cual):

**${whyLabel}**
[2-3 oraciones explicando las fuerzas que lo harÃ­an posible]

**Implicaciones para la universidad**
- [bullet concreto]
- [bullet concreto]
- [bullet concreto]

**SeÃ±ales de alerta temprana**
- [indicador observable que anunciarÃ­a este escenario]
- [indicador observable]

**Acciones recomendadas**
- [acciÃ³n concreta a tomar hoy]
- [acciÃ³n concreta a tomar hoy]
`.trim();

  return callEscenarios(prompt, 600);
}

// â”€â”€ Tipos enriquecidos para importaciÃ³n de artÃ­culos â”€â”€â”€â”€â”€â”€â”€â”€
export interface PropuestaImportacion {
  id:                string;
  tipo:              'senal' | 'tendencia' | 'escenario';
  titulo:            string;
  nombre:            string;
  descCorta:         string;
  descLarga:         string;
  fuente:            string;
  urlFuente:         string;
  urlsFuente:        string[];
  urlImagen:         string;           // url_imagen_senal / tendencia / escenario
  urlVideo:          string;           // url_video_senal  / tendencia / escenario
  probabilidad:      number | null;    // 1-5, solo escenarios
  temasRelacionados: string[];         // solo tendencias
  pestelLetra:       string;           // letra derivada: P E S T A L
  pestelNombre:      string;           // nombre completo: "TecnolÃ³gico" / "Social; EconÃ³mico"
  sectorNombre:      string;           // exacto del catÃ¡logo oficial
  fragmento:         string;
  razonClasificacion: string;
  nivelEvidencia:    string;           // alto / medio / bajo
  paisOrigen:        string;           // â†’ pais_origen en DB
  fechaArticulo:     string;           // â†’ fecha_senal_articulo YYYY-MM-DD
  // SeÃ±ales
  actorPrincipal:    string;
  accionDetectada:   string;
  lugar:             string | null;    // legacy alias â†’ paisOrigen
  fechaMencionada:   string | null;    // legacy alias â†’ fechaArticulo
  cifrasClave:       string[];
  tecnologiaOTema:   string;
  // Tendencias
  definicionOperativa: string;
  fundamentoAnalitico: string;
  senalesSoporte:    string[];
  nivel:             string;           // macro / sectorial / transversal
  // Escenarios
  horizonteTemporal: string | null;
  tendenciasSoporte: string[];
  topico:            string;        // asunto principal del documento (escenarios)
  referencias:       string[];      // referencias bibliogrÃ¡ficas del bloque (escenarios)
}

export interface RelacionSugerida {
  idOrigen:          string;
  idDestino:         string;
  tipo:              'senal_tendencia' | 'tendencia_escenario' | 'senal_escenario';
  labelOrigen:       string;
  labelDestino:      string;
  aceptada:          boolean;
  confianzaRelacion: string;           // alto / medio / bajo
}

// â”€â”€ Helpers para importaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Extrae URLs Ãºnicas del texto PDF â€” soporta dos formatos:
 *  1. Bloques al pie de pÃ¡gina: [Links pÃ¡g.N: url1 | url2]
 *  2. Marcadores inline:        [â†’url]  (insertados por extractTextFromPDF) */
export function extractUrlsFromText(texto: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const addUrl = (raw: string) => {
    const url = raw.trim().replace(/[),.;]+$/g, '');
    if (url.startsWith('http') && !seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  };

  // Formato 1: bloques [Links pÃ¡g.N: url1 | url2]
  const rxBlock = /\[Links p(?:Ã¡|á)g\.\d+:\s*([^\]]+)\]/gi;
  let m;
  while ((m = rxBlock.exec(texto)) !== null) {
    for (const raw of m[1].split('|')) {
      addUrl(raw);
    }
  }

  // Formato 2: marcadores inline [â†’url]
  const rxInline = /\[(?:Ã¢â€ â€™|â†’|→)(https?:[^\]]+)\]/g;
  while ((m = rxInline.exec(texto)) !== null) {
    addUrl(m[1]);
  }

  // Formato 3: URLs planas pegadas al texto por pdfjs.
  const rxPlain = /https?:\/\/[^\s\]\)<>"']+/g;
  while ((m = rxPlain.exec(texto)) !== null) {
    addUrl(m[0]);
  }

  return result;
}

function extractReferenceUrlsByScenario(section: string): string[][] {
  const labels: { index: number; end: number }[] = [];
  const rxLabel = /(?:Referencias|References):/gi;
  let m: RegExpExecArray | null;

  while ((m = rxLabel.exec(section)) !== null) {
    labels.push({ index: m.index, end: m.index + m[0].length });
  }

  return labels.map((label, i) => {
    const nextLabel = labels[i + 1]?.index ?? section.length;
    const block = section
      .slice(label.end, nextLabel)
      .replace(/\[Links p(?:Ã¡|á)g\.\d+:[^\]]+\]/gi, ' ');

    const urls: string[] = [];
    const add = (raw: string) => {
      const url = raw.trim().replace(/[),.;]+$/g, '');
      if (url.startsWith('http')) urls.push(url);
    };

    const rxInline = /\[(?:Ã¢â€ â€™|â†’|→)(https?:[^\]]+)\]/g;
    while ((m = rxInline.exec(block)) !== null) add(m[1]);

    const rxPlain = /https?:\/\/[^\s\]\)<>"']+/g;
    while ((m = rxPlain.exec(block)) !== null) add(m[0]);

    return uniqueStrings(urls);
  });
}

/**
 * Extrae la secciÃ³n relevante del PDF segÃºn palabras clave.
 * Si no se encuentra ninguna keyword, devuelve el texto desde minPos.
 * @param minPos   PosiciÃ³n mÃ­nima de bÃºsqueda â€” sirve para saltar la portada y el ToC
 *                 y evitar matches falsos en entradas del Ã­ndice de contenidos.
 */
function extractSection(texto: string, keywords: string[], maxChars = 8000, minPos = 0): string {
  const lower = texto.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase(), minPos);
    if (idx !== -1) {
      const start = Math.max(0, idx - 100);
      return texto.slice(start, start + maxChars);
    }
  }
  return texto.slice(minPos, minPos + maxChars);
}

/** Convierte nombre PESTEL completo a letra cÃ³digo (P/E/S/T/A/L) */
const PESTEL_LETRA: Record<string, string> = {
  'polÃ­tico': 'P', 'politico': 'P',
  'econÃ³mico': 'E', 'economico': 'E',
  'social': 'S',
  'tecnolÃ³gico': 'T', 'tecnologico': 'T',
  'ecolÃ³gico': 'A', 'ecologico': 'A', 'ambiental': 'A',
  'legal': 'L',
};
function pestelToLetra(nombre: string): string {
  const first = (nombre || '').split(';')[0].trim().toLowerCase();
  return PESTEL_LETRA[first] || first.toUpperCase().charAt(0) || '';
}

function parseProbabilityFromSnippet(snippet: string): number | null {
  const normalized = snippet
    .replace(/\(cid:298\)/g, '\u25CF')
    .replace(/\(cid:102\)/g, '\u25CB')
    .replace(/\u012A/g, '\u25CF');

  const line = normalized.match(/(?:Probabilidad|Probability):\s*([\s\S]{0,100})/i)?.[1] || normalized;
  const beforeRefs = line.split(/Referencias:|References:/i)[0];
  const numMatch = beforeRefs.match(/(?:^|\D)([1-5])(?:\s*\/\s*5|\s+(?:de|of|out of)\s+5)(?:\D|$)/i)
    || beforeRefs.match(/^\s*([1-5])(?:\D|$)/);
  if (numMatch) return parseInt(numMatch[1], 10);

  const filled = (beforeRefs.match(/[\u25CF\u2022\u25C9\u25C6\u25A0\u25AA\u2605]/g) || []).length;
  const empty = (beforeRefs.match(/[\u25CB\u25CC\u25C7\u25A1\u25AB\u2606]/g) || []).length
    + (filled > 0 ? (beforeRefs.match(/\bf+\b/g) || []).join('').length : 0);

  if (filled > 0 || empty > 0) return Math.min(5, Math.max(1, filled));
  if (/\balta\b/i.test(beforeRefs)) return 4;
  if (/\bmedia\b/i.test(beforeRefs)) return 3;
  if (/\bbaja\b/i.test(beforeRefs)) return 2;
  return null;
}

function normalizeScenarioSectors(base: string[], scenarioText: string, officialSectors: string[]): string[] {
  const official = new Set(officialSectors);
  const sectors = new Set(base.filter(s => official.has(s)));
  const text = scenarioText.toLowerCase();
  const add = (...names: string[]) => names.forEach(name => { if (official.has(name)) sectors.add(name); });

  if (/manufactur|fabricaci|factory|factories|manufacturer|production|supply chains?/.test(text)) add('Industria');
  if (/consumer electronics|photonics|haptic|voice interfaces?|ambient sensing|detector|digital|sensor/.test(text)) add('TecnologÃ­a de la InformaciÃ³n');
  if (/wolbachia|mosquito|dengue|biofactor|public-health|salud pÃºblica/.test(text)) add('Salud', 'BiotecnologÃ­a y Ciencias de la Vida');
  if (/medical device|aptamer|diagnostic|point-of-care|healthcare|clinic|pharmac|pathogen|biosensor/.test(text)) add('Salud', 'BiotecnologÃ­a y Ciencias de la Vida');
  if (/agri-input|agricultur|seed|crop|plant breeding|speed-breeding|growers|pest shifts?/.test(text)) add('Agroindustria');
  if (/energy-intensive|grid|renewables|storage|demand-response|ancillary services|power|solar/.test(text)) add('EnergÃ­a', 'Industria');

  return Array.from(sectors);
}

function repairMojibake(value: any): string {
  const text = String(value || '');
  if (!/[ÃÂâ]/.test(text)) return text.replace(/\s+/g, ' ').trim();
  try {
    const bytes = Uint8Array.from(Array.from(text).map(ch => ch.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if ((decoded.match(/[ÃÂâ]/g) || []).length < (text.match(/[ÃÂâ]/g) || []).length) {
      return decoded.replace(/\s+/g, ' ').trim();
    }
  } catch {
    // Fallback below handles the common mojibake produced by PDF text extraction.
  }
  return text
    .replace(/\u00c3\u00a1/g, 'á').replace(/\u00c3\u00a9/g, 'é')
    .replace(/\u00c3\u00ad/g, 'í').replace(/\u00c3\u00b3/g, 'ó')
    .replace(/\u00c3\u00ba/g, 'ú').replace(/\u00c3\u00b1/g, 'ñ')
    .replace(/\u00c3\u0081/g, 'Á').replace(/\u00c3\u0089/g, 'É')
    .replace(/\u00c3\u008d/g, 'Í').replace(/\u00c3\u0093/g, 'Ó')
    .replace(/\u00c3\u009a/g, 'Ú').replace(/\u00c3\u0091/g, 'Ñ')
    .replace(/\u00c2/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeScenarioArray(values: any[]): string[] {
  return uniqueStrings((values || []).map(repairMojibake).filter(Boolean));
}

function translateKnownScenarioTitle(title: string): string {
  const clean = repairMojibake(title);
  const norm = clean.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/consumer electronics makers launch bezel-?less and screenless form factors/.test(norm)) {
    return 'Fabricantes de electrónica de consumo lanzan formatos sin bisel y sin pantalla mediante nuevos materiales y cadenas de suministro fotónicas';
  }
  if (/manufacturers will accelerate adoption of edge-to-edge and non-display interaction devices/.test(norm)) {
    return 'Fabricantes aceleran la adopción de dispositivos de borde a borde e interacción sin pantalla';
  }
  return clean;
}

function looksEnglish(text: string): boolean {
  return /\b(the|and|will|through|with|without|makers|manufacturers|supply|chains|devices|form factors|launch)\b/i.test(text);
}

function isBadScenarioSubtitle(text: string): boolean {
  return /manufacturers will accelerate adoption of edge-to-edge and non-display interaction devices/i.test(text);
}

function chooseScenarioTitle(extractedTitle: string, aiTitle: string): string {
  const extracted = repairMojibake(extractedTitle);
  const translatedExtracted = translateKnownScenarioTitle(extracted);
  if (translatedExtracted && translatedExtracted !== extracted) return translatedExtracted;

  const ai = repairMojibake(aiTitle);
  if (ai && !isBadScenarioSubtitle(ai) && !looksEnglish(ai)) return ai;
  return translatedExtracted || ai;
}

function makeScenarioName(title: string, fallback: string): string {
  const clean = repairMojibake(title || fallback).toLowerCase();
  if (/sin bisel|sin pantalla|bisel/.test(clean)) return 'electrónica sin bisel y sin pantalla';
  const stop = new Set(['los', 'las', 'una', 'uno', 'unos', 'unas', 'del', 'para', 'por', 'con', 'mediante', 'nuevos', 'nuevas']);
  const words = clean
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñáéíóúü\s-]/gi, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 2 && !stop.has(w));
  return uniqueStrings(words).slice(0, 5).join(' ').slice(0, 55);
}

function extractScenarioTitlesFromSection(section: string): string[] {
  const labels: number[] = [];
  const rx = /(?:Probabilidad|Probability):/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(section)) !== null) labels.push(m.index);
  let start = 0;
  return labels.map(labelIndex => {
    const rawBlock = section.slice(start, labelIndex);
    const cleanedBlock = (rawBlock.split(/(?:Referencias|References):/i).pop() || rawBlock)
      .replace(/\[Links p(?:Ã¡|á)g\.\d+:[^\]]+\]/gi, ' ')
      .replace(/\[(?:Ã¢â€ â€™|â†’|→)https?:[^\]]+\]/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .trim();
    const lines = cleanedBlock
      .split(/\n+/)
      .map(s => repairMojibake(s).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const lineCandidates: string[] = [];
    for (let idx = 0; idx < lines.length; idx += 1) {
      const line = lines[idx];
      if (/^(?:2\.1|previsiones|escenarios|en este|describimos|referencias|references|probabilidad|probability)/i.test(line)) continue;
      if (line.length < 25 || line.length > 190) continue;
      if (/\b(?:will accelerate adoption|requiring precision|supply chains will|retail positioning will|enabling)\b/i.test(line)) continue;
      const next = lines[idx + 1] || '';
      const combined = next &&
        !/[.!?:]$/.test(line) &&
        !/[.!?:]$/.test(next) &&
        !/^(?:probabilidad|probability|referencias|references)/i.test(next) &&
        !/\b(?:will accelerate adoption|requiring precision|supply chains will|retail positioning will|enabling)\b/i.test(next) &&
        `${line} ${next}`.length <= 220
          ? `${line} ${next}`
          : line;
      lineCandidates.push(combined);
    }
    const block = cleanedBlock
      .replace(/\s+/g, ' ')
      .trim();
    const sentences = block
      .split(/(?<=[.!?])\s+|\n+/)
      .map(s => repairMojibake(s).trim())
      .filter(s =>
        s.length >= 35 &&
        s.length <= 220 &&
        !/^(?:2\.1|previsiones|escenarios|en este|describimos|referencias|references)/i.test(s)
      );
    const title = lineCandidates[0]
      || sentences.find(s => !/\b(?:will|requiring|supply chains will|retail positioning will|enabling)\b/i.test(s.slice(80)))
      || sentences[0]
      || '';
    start = labelIndex + 1;
    return translateKnownScenarioTitle(title);
  });
}

type LinkEntrada = {
  id: string;
  url: string;
  anchorContext: string;
};

function cleanAnchorContext(text: string): string {
  return text
    .replace(/\[(?:Ã¢â€ â€™|â†’|→)https?:[^\]]+\]/g, ' ')
    .replace(/\[Links pÃƒÂ¡g\.\d+:[^\]]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contextAroundMarker(section: string, markerIndex: number): string {
  const before = section.slice(Math.max(0, markerIndex - 550), markerIndex);
  const after = section.slice(markerIndex, Math.min(section.length, markerIndex + 380));
  const merged = cleanAnchorContext(`${before} ${after}`);
  const sentences = merged.match(/[^.!?ã€‚]+[.!?ã€‚]?/g)?.map(s => s.trim()).filter(s => s.length > 20) || [];
  if (sentences.length >= 3) return sentences.slice(-3).join(' ').slice(0, 520);
  return merged.slice(-520);
}

function contextForUrl(section: string, url: string, fallbackText = ''): string {
  const idx = section.indexOf(url);
  if (idx >= 0) return contextAroundMarker(section, idx);
  return cleanAnchorContext(fallbackText).slice(0, 520);
}

function sourceFromUrl(url: string, fallback: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    const map: Record<string, string> = {
      'weforum.org': 'World Economic Forum',
      'cn.weforum.org': 'World Economic Forum',
      'oliverwyman.com': 'Oliver Wyman',
      'climateinsider.com': 'Climate Insider',
      'globaldata.com': 'GlobalData',
      'ppforum.ca': 'Public Policy Forum',
      'hbr.org': 'Harvard Business Review',
      'trendsresearch.org': 'TRENDS Research & Advisory',
      'nature.com': 'Nature',
      'wired.com': 'Wired',
      'sciencedaily.com': 'Science Daily',
      'insideclimatenews.org': 'Inside Climate News',
      'frontiersin.org': 'Frontiers',
      'springeropen.com': 'SpringerOpen',
      'cornell.edu': 'Cornell University',
      'avenir-suisse.ch': 'Avenir Suisse',
    };
    if (map[host]) return map[host];
    const match = Object.entries(map).find(([domain]) => host.endsWith(`.${domain}`));
    if (match) return match[1];
    return host.split('.').slice(-2, -1)[0]
      ?.replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase()) || fallback;
  } catch {
    return fallback;
  }
}

function dateFromUrl(url: string): string {
  const m = url.match(/\/(20\d{2})\/(\d{1,2})(?:\/(\d{1,2}))?\//);
  if (!m) return '';
  const yyyy = m[1];
  const mm = m[2].padStart(2, '0');
  const dd = (m[3] || '01').padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function uniqueStrings(values: any[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values || []) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function extractTrendRelatedTopics(sectionText: string): string[][] {
  const uncompactWords = (s: string) =>
    s.replace(/([a-zÃ¡Ã©Ã­Ã³ÃºÃ¼Ã±])([A-ZÃÃ‰ÃÃ“ÃšÃœÃ‘])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
  const parseBlock = (block: string): string[] => {
    const rx = /temas\s*relacionados\s*:\s*/i;
    const match = rx.exec(block);
    if (!match) return [];
    const rest = block.slice(match.index + match[0].length);
    const endCandidates = [
      rest.search(/\s3\.\d+\s+[A-ZÁÉÍÓÚÑ]/),
      rest.search(/\n\s*3\.\d+\s+/),
      rest.search(/\n\s*(?:4\s+)?(?:referencias|previsiones|escenarios|sobre inteligencia)/i),
      rest.search(/\n\s*Futuro de la manufactura\s*\n/i),
    ].filter(n => n >= 0);
    const end = endCandidates.length > 0 ? Math.min(...endCandidates) : rest.length;
    const rawLine = (end >= 0 ? rest.slice(0, end) : rest.slice(0, 900))
      .replace(/\[(?:ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢|Ã¢â€ â€™|â†’)https?:[^\]]+\]/g, '')
      .replace(/Futuro de la manufactura/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const items = uniqueStrings(rawLine.split(',').map(t => uncompactWords(t)).filter(t => {
      if (t.length < 2 || t.length > 90) return false;
      if (/^\d+$/.test(t)) return false;
      if (/^(y|e|o|u)$/i.test(t)) return false;
      return true;
    }));
    return items;
  };

  const headings: { index: number; label: string }[] = [];
  const headingRx = /(?:^|\n|\s)(3\.[1-5])\s+/g;
  let h: RegExpExecArray | null;
  while ((h = headingRx.exec(sectionText)) !== null) {
    headings.push({ index: h.index, label: h[1] });
  }

  if (headings.length > 0) {
    return headings.map((heading, i) => {
      const next = headings[i + 1]?.index ?? sectionText.length;
      return parseBlock(sectionText.slice(heading.index, next));
    });
  }

  const result: string[][] = [];
  const rx = /temas\s*relacionados\s*:\s*/gi;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(sectionText)) !== null) {
    const items = parseBlock(sectionText.slice(match.index));
    if (items.length > 0) result.push(items);
  }
  return result;
}

function fallbackSignalFromLink(link: LinkEntrada, fuenteDoc: string): any {
  let host = '';
  try { host = new URL(link.url).hostname.replace(/^www\./, ''); } catch {}
  const context = link.anchorContext || host || link.url;
  const titleBase = context
    .replace(/^[-â€“â€¢\s]+/, '')
    .split(/[.!?]/)[0]
    .trim()
    .slice(0, 90);
  return {
    idEntrada: link.id,
    titulo: titleBase || `SeÃ±al desde ${host || 'hipervÃ­nculo'}`,
    nombre: (titleBase || host || 'senal pendiente').toLowerCase().split(/\s+/).slice(0, 5).join(' '),
    descCorta: context.slice(0, 180),
    descLarga: context,
    urlVideo: '',
    fuente: sourceFromUrl(link.url, host || fuenteDoc),
    urlFuente: link.url,
    urlsFuente: [],
    paisOrigen: '',
    fechaArticulo: dateFromUrl(link.url),
    pestelNombres: [],
    sectorNombres: [],
    cifrasClave: [],
    fragmento: context.slice(0, 120),
  };
}

// Groq Llama 3.3 70B â€” importaciÃ³n PDF via backend (gratuito, 500k tokens/dÃ­a)
// Delay entre llamadas para respetar el lÃ­mite de TPM del free tier
const _sleepImport = (ms: number) => new Promise(r => setTimeout(r, ms));
async function callImport(prompt: string, maxTokens = 2000): Promise<string> {
  await _sleepImport(5000); // 5s entre llamadas para que el bucket TPM se recargue
  const res = await fetch('/api/ai/importar', {
    method: 'POST',
    headers: AUTH(),
    body: JSON.stringify({ prompt, maxTokens }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Error ${res.status}`);
  }
  const data = await res.json();
  return data.text || '';
}

function parseJSON<T>(raw: string, key: string): T[] {
  // Strip markdown fences if model wraps the JSON
  const clean = raw.replace(/```(?:json)?/gi, '').trim();

  const m = clean.match(/\{[\s\S]*\}/);
  if (!m) return [];

  // 1) Happy path â€” full valid JSON
  try {
    const parsed = JSON.parse(m[0]);
    if (Array.isArray(parsed[key])) return parsed[key];
  } catch { /* truncated â€” try recovery */ }

  // 2) Truncation recovery: extract every complete {...} object inside the array
  const keyIdx = m[0].indexOf(`"${key}"`);
  if (keyIdx === -1) return [];
  const bracketIdx = m[0].indexOf('[', keyIdx);
  if (bracketIdx === -1) return [];

  const items: T[] = [];
  let depth = 0;
  let objStart = -1;
  for (let i = bracketIdx + 1; i < m[0].length; i++) {
    const ch = m[0][i];
    if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try { items.push(JSON.parse(m[0].slice(objStart, i + 1))); } catch {}
        objStart = -1;
      }
    }
  }
  return items;
}

// WEF_SENAL / WEF_TENDENCIA / WEF_ESCENARIO eliminados:
// cada prompt de importaciÃ³n lleva su propia definiciÃ³n operativa inline.

/**
 * 8a) Extraer SEÃ‘ALES â€” una seÃ±al por URL Ãºnica detectada en el PDF
 *     Adaptado de la plantilla oficial del sistema RADAR
 */
export async function extraerSenales(
  texto: string,
  fuenteDoc: string,
  sectors: string[] = [],
  urlsDetectadas: string[] = []
): Promise<PropuestaImportacion[]> {
  if (!texto.trim()) return [];

  const sectorList = sectors.length > 0
    ? sectors.join('\n')
    : 'Salud\nLogistica\nFinanzas\nEducacion\nEnergia\nAeroespacial\nIndustria\nTecnologia de la Informacion\nMineria y Recursos Naturales\nAgroindustria\nConstruccion e Infraestructura\nBiotecnologia y Ciencias de la Vida\nTurismo y Hoteleria\nTelecomunicaciones\nMedioambiente y Sostenibilidad\nComercio y E-commerce\nGobierno y Sector Publico\nMedios, Comunicacion y Entretenimiento\nDefensa y Seguridad';

  const seccionSenalesRaw = extractSection(texto, [
    'novedades y tendencias', 'novedades', 'senales de cambio', 'seÃ±ales de cambio', 'noticias recientes',
  ], 28000);
  const seccionSenales = seccionSenalesRaw
    .split(/\n?\s*2\s+Previsiones y escenarios/i)[0]
    .split(/\n?\s*2\.1\s+Previsiones/i)[0];

  const URL_NAV_EXCLUIR = [
    'intelligence.weforum.org/topics/',
    'weforum.org/strategic-intelligence',
    'apps.apple.com/',
    'play.google.com/',
    'twitter.com/',
    'mailto:',
  ];
  const isNavUrl = (u: string) => URL_NAV_EXCLUIR.some(pat => u.includes(pat));

  const byUrl = new Map<string, LinkEntrada>();
  const addDetectedUrl = (rawUrl: string, markerIndex: number, fallbackContext = '') => {
    const url = rawUrl.trim().replace(/[),.;]+$/g, '');
    if (!url.startsWith('http') || isNavUrl(url)) return;
    const anchorContext = markerIndex >= 0
      ? contextAroundMarker(seccionSenales, markerIndex)
      : contextForUrl(seccionSenales, url, fallbackContext);
    const existing = byUrl.get(url);
    if (!existing || anchorContext.length > existing.anchorContext.length) {
      byUrl.set(url, { id: `link-${byUrl.size + 1}`, url, anchorContext });
    }
  };

  const rxUrl = /\[(?:Ã¢â€ â€™|â†’|→)(https?:[^\]]{10,})\]/g;
  let mu: RegExpExecArray | null;
  while ((mu = rxUrl.exec(seccionSenales)) !== null) {
    addDetectedUrl(mu[1], mu.index);
  }

  const rxBlockLinks = /\[Links p(?:Ã¡|á)g\.\d+:\s*([^\]]+)\]/gi;
  while ((mu = rxBlockLinks.exec(seccionSenales)) !== null) {
    for (const raw of mu[1].split('|')) addDetectedUrl(raw, mu.index);
  }

  const rxPlainUrls = /https?:\/\/[^\s\]\)<>"']+/g;
  while ((mu = rxPlainUrls.exec(seccionSenales)) !== null) {
    addDetectedUrl(mu[0], mu.index);
  }

  const inlineHipervinculos: LinkEntrada[] = Array.from(byUrl.values());
  if (inlineHipervinculos.length === 0) {
    const seenFallback = new Set<string>();
    for (const url of urlsDetectadas) {
      if (isNavUrl(url) || seenFallback.has(url)) continue;
      seenFallback.add(url);
      inlineHipervinculos.push({
        id: `link-${inlineHipervinculos.length + 1}`,
        url,
        anchorContext: contextForUrl(texto, url),
      });
    }
  }

  const hipervinculosLimitados: LinkEntrada[] = inlineHipervinculos.slice(0, 25).map(h => ({
    id: h.id,
    url: h.url,
    anchorContext: h.anchorContext.slice(0, 520),
  }));

  const makePrompt = (batch: LinkEntrada[]) => `
Eres un extractor de seÃ±ales para el Radar de innovaciÃ³n. Idioma de salida: espaÃ±ol.

TAREA: generar UNA seÃ±al por cada entrada del JSON HIPERVÃNCULOS. Sin excepciones.
- idEntrada = id exacto de la entrada.
- urlFuente = URL exacta de la entrada (no modificar, no omitir).
- titulo = inferir del anchorContext; si es corto, ampliar con el fenÃ³meno clave (mÃ¡x 95 chars).
- nombre = 3-5 palabras clave en minÃºsculas.
- descCorta = 1 frase causal (mÃ¡x 35 palabras).
- descLarga = 2 pÃ¡rrafos: quÃ© ocurre + implicancia para mercado laboral/educaciÃ³n (mÃ¡x 800 chars).
- fuente = publisher del dominio (weforum.org -> "World Economic Forum", hbr.org -> "Harvard Business Review", etc.).
- fechaArticulo = YYYY-MM-DD desde la URL o contexto; si solo mes/aÃ±o usar dÃ­a "01"; si no hay: "".
- paisOrigen = paÃ­s del fenÃ³meno en espaÃ±ol; si global o desconocido: "".
- pestelNombres = array con valores SOLO de: ["Social","TecnolÃ³gico","EconÃ³mico","EcolÃ³gico","PolÃ­tico","Legal"].
- sectorNombres = array con valores SOLO de: [${sectorList.split('\n').map(s => `"${s}"`).join(',')}].
- cifrasClave = array de cifras/porcentajes/montos explÃ­citos en el contexto; si no hay: [].
- fragmento = cita textual del anchorContext (mÃ¡x 120 chars).
- urlVideo = "" (salvo que haya URL YouTube/Vimeo explÃ­cita).
- urlsFuente = [].

REGLA CRÃTICA: NO crear seÃ±ales de texto plano. SOLO de entradas del JSON.
Debes devolver EXACTAMENTE ${batch.length} objetos, uno por cada idEntrada.
Si el contexto es incompleto, crea una seÃ±al revisable usando la URL y el fragmento disponible.
NO inventar datos. Si un campo no puede determinarse: "" o [].

FUENTE DEL DOCUMENTO: ${fuenteDoc}

HIPERVÃNCULOS DETECTADOS (una seÃ±al por entrada):
${JSON.stringify(batch, null, 2)}

================================
SALIDA
================================
Devuelve SOLO JSON vÃ¡lido, sin markdown, sin explicaciÃ³n y sin texto adicional.

{
  "senales": [
    {
      "idEntrada": "",
      "titulo": "",
      "nombre": "",
      "descCorta": "",
      "descLarga": "",
      "urlVideo": "",
      "fuente": "",
      "urlFuente": "",
      "urlsFuente": [],
      "paisOrigen": "",
      "fechaArticulo": "",
      "pestelNombres": [],
      "sectorNombres": [],
      "cifrasClave": [],
      "fragmento": ""
    }
  ]
}
`.trim();

  const arr: any[] = [];
  for (let i = 0; i < hipervinculosLimitados.length; i += 5) {
    const batch = hipervinculosLimitados.slice(i, i + 5);
    const raw = await callImport(makePrompt(batch), 2800);
    const parsed = parseJSON<any>(raw, 'senales');
    const byId = new Map<string, any>();
    for (const item of parsed) {
      const idEntrada = String(item.idEntrada || item.id || '');
      if (idEntrada) byId.set(idEntrada, item);
    }
    for (const link of batch) {
      const item = byId.get(link.id)
        || parsed.find((p: any) => String(p.urlFuente || '').trim() === link.url)
        || fallbackSignalFromLink(link, fuenteDoc);
      arr.push({
        ...item,
        idEntrada: link.id,
        urlFuente: link.url,
        fragmento: item.fragmento || link.anchorContext.slice(0, 120),
      });
    }
  }

  const ts  = Date.now();
  return arr.map((p: any, i: number): PropuestaImportacion => {
    const pNombres: string[] = Array.isArray(p.pestelNombres)
      ? p.pestelNombres.map(String).filter(Boolean)
      : String(p.pestelNombre || p.pestelLetra || '').split(';').map((s: string) => s.trim()).filter(Boolean);
    const pNombre = pNombres.join('; ');
    const sNombres: string[] = Array.isArray(p.sectorNombres)
      ? p.sectorNombres.map(String).filter(Boolean)
      : String(p.sectorNombre || p.id_sector || '').split(';').map((s: string) => s.trim()).filter(Boolean);
    const urlFuente = String(p.urlFuente || '');
    const urlsFuente = Array.isArray(p.urlsFuente)
      ? uniqueStrings(p.urlsFuente.filter((u: any) => typeof u === 'string' && u.startsWith('http') && u !== urlFuente))
      : [];
    return {
      id:                  `sen-${i}-${ts}`,
      tipo:                'senal',
      titulo:              String(p.titulo    || '').slice(0, 90),
      nombre:              String(p.nombre    || p.titulo || '').replace(/_/g, ' ').slice(0, 55),
      descCorta:           String(p.descCorta || '').slice(0, 200),
      descLarga:           String(p.descLarga || ''),
      fuente:              sourceFromUrl(urlFuente, String(p.fuente || fuenteDoc)),
      urlFuente,
      urlsFuente,
      urlImagen:           '',
      urlVideo:            String(p.urlVideo  || p.url_video  || ''),
      probabilidad:        null,
      temasRelacionados:   [],
      pestelNombre:        pNombre,
      pestelLetra:         pestelToLetra(pNombre),
      sectorNombre:        sNombres.join('; '),
      fragmento:           String(p.fragmento    || '').slice(0, 200),
      razonClasificacion:  String(p.razonClasificacion || ''),
      nivelEvidencia:      String(p.nivelEvidencia || ''),
      paisOrigen:          String(p.paisOrigen || p.pais_origen || ''),
      fechaArticulo:       String(p.fechaArticulo || p.fecha_senal_articulo || dateFromUrl(urlFuente)),
      actorPrincipal:      '',
      accionDetectada:     '',
      lugar:               p.paisOrigen ? String(p.paisOrigen) : null,
      fechaMencionada:     p.fechaArticulo ? String(p.fechaArticulo) : null,
      cifrasClave:         Array.isArray(p.cifrasClave) ? p.cifrasClave.map(String) : [],
      tecnologiaOTema:     String(p.tecnologiaOTema || ''),
      definicionOperativa: '',
      fundamentoAnalitico: '',
      senalesSoporte:      [],
      nivel:               '',
      horizonteTemporal:   null,
      tendenciasSoporte:   [],
      topico:              '',
      referencias:         [],
    };
  });
}

/**
 * 8b) Extraer TENDENCIAS â€” patrones de cambio sostenido del documento
 *     Adaptado de la plantilla oficial del sistema RADAR
 */
export async function extraerTendencias(
  texto: string,
  fuenteDoc: string,
  sectors: string[] = []
): Promise<PropuestaImportacion[]> {
  if (!texto.trim()) return [];

  const sectorList = sectors.length > 0
    ? sectors.join('\n')
    : 'Salud\nLogÃ­stica\nFinanzas\nEducaciÃ³n\nEnergÃ­a\nAeroespacial\nIndustria\nTecnologÃ­a de la InformaciÃ³n\nMinerÃ­a y Recursos Naturales\nAgroindustria\nConstrucciÃ³n e Infraestructura\nBiotecnologÃ­a y Ciencias de la Vida\nTurismo y HotelerÃ­a\nTelecomunicaciones\nMedioambiente y Sostenibilidad\nComercio y E-commerce\nGobierno y Sector PÃºblico\nMedios, ComunicaciÃ³n y Entretenimiento\nDefensa y Seguridad';

  // Buscar secciÃ³n "Contexto estratÃ©gico" donde estÃ¡n las tendencias (5 subsecciones 3.1-3.5).
  // Limitado para cubrir las 5 subsecciones sin arrastrar anexos completos.
  const seccionTendencias = extractSection(texto, [
    '3.1 navegar la revoluci\u00f3n digital', '3.1 navegar la revolucion digital',
    '3 contexto estratÃ©gico', 'contexto estratÃ©gico', 'contexto estrategico',
    'contexto', 'tendencias estratÃ©gicas',
  ], 18000, 3000);

  // Pre-extraer "Temas relacionados:" con regex para no depender del AI.
  // Esto preserva todos los topicos secundarios del PDF, incluso cuando vienen compactados.
  const temasExtraidos = extractTrendRelatedTopics(seccionTendencias);
  const temasHint = temasExtraidos.length > 0
    ? '\n\nTEMAS RELACIONADOS PRE-EXTRAÃDOS (en orden 3.1â†’3.N, usar exactamente estos valores):\n'
      + temasExtraidos.map((t, i) => `3.${i + 1}: ${JSON.stringify(t)}`).join('\n')
    : '';

  const prompt = `
ðŸŽ¯ Eres un asistente para registrar tendencias en una base de datos de un Radar de innovaciÃ³n.
A partir del texto de un PDF, genera los campos requeridos para la tabla \`tendencia\`.

Idioma de salida: espaÃ±ol.
MantÃ©n nombres propios, marcas e instituciones en su idioma original.

================================
REGLAS CRÃTICAS
================================
- NO usar fuentes externas.
- NO inventar datos.
- Trabaja SOLO con el contenido del PDF proporcionado.
- Si un campo no puede determinarse con evidencia suficiente, dejarlo vacÃ­o ("") o [] segÃºn corresponda.
- NO crear mÃ¡s de 5 tendencias.
- NO crear menos de 5 tendencias.
- Debes extraer EXACTAMENTE las 5 tendencias de la secciÃ³n "3 Contexto estratÃ©gico":
  3.1, 3.2, 3.3, 3.4 y 3.5.

================================
ALCANCE OBLIGATORIO
================================
Extrae tendencias SOLO desde la secciÃ³n:
"3 Contexto estratÃ©gico"

Ignora completamente:
- Resumen ejecutivo
- Novedades y tendencias
- Previsiones y escenarios
- Referencias
- Sobre Inteligencia EstratÃ©gica
- Colaboradores
- Agradecimientos

================================
REGLA DE EXTRACCIÃ“N
================================
Cada tendencia corresponde a una subsecciÃ³n numerada:
- 3.1
- 3.2
- 3.3
- 3.4
- 3.5

Para cada una:
- \`titulo\` = texto del encabezado de la subsecciÃ³n, SIN la numeraciÃ³n
- \`descCorta\` = lÃ­nea breve inmediatamente debajo del tÃ­tulo
- \`descLarga\` = cuerpo completo de la tendencia
- \`temasRelacionados\` = tÃ³picos secundarios listados despuÃ©s de "Temas relacionados:" en el bloque de esa tendencia
- NO incluir "Temas relacionados" dentro de \`descLarga\`

DelimitaciÃ³n del bloque:
- INICIO de una tendencia: encabezado "3.X [TÃ­tulo]"
- Luego viene la lÃ­nea breve debajo del tÃ­tulo
- Luego viene el cuerpo principal
- Luego aparece "Temas relacionados:"
- FIN de la tendencia: justo antes del siguiente encabezado 3.X o del fin de la secciÃ³n

================================
REGLA DE ORO â€” COPIA FIEL
================================
Tu trabajo principal es EXTRAER y COPIAR fielmente el contenido del informe.

- NO resumir \`descLarga\`
- NO reescribir \`descLarga\`
- NO mezclar contenido de una tendencia con otra
- NO incluir la numeraciÃ³n "3.1", "3.2", etc. dentro de \`titulo\`
- NO construir \`temasRelacionados\` desde el grÃ¡fico del mapa
- SÃ extraer \`temasRelacionados\` desde la lÃ­nea textual "Temas relacionados:" de cada bloque

================================
CAMPOS A COMPLETAR
================================
Debes devolver SOLO estos campos:

1. titulo
- obligatorio
- copiar el encabezado de la tendencia
- SIN numeraciÃ³n
- ejemplo correcto: "Navegar la revoluciÃ³n digital"
- ejemplo incorrecto: "3.1 Navegar la revoluciÃ³n digital"

2. nombre
- obligatorio
- micro-identificador de 3 a 5 palabras clave
- minÃºsculas
- sin artÃ­culos
- sin guiones bajos
- usar espacios
- ejemplo: "revolucion digital manufactura"

3. descCorta
- obligatorio
- copiar la lÃ­nea breve justo debajo del tÃ­tulo
- no resumir
- no tomar la primera oraciÃ³n del cuerpo si existe una bajada explÃ­cita
- mÃ¡ximo 250 caracteres

4. descLarga
- obligatorio
- copiar el contenido completo del bloque de la tendencia
- comienza despuÃ©s de \`descCorta\`
- termina antes de "Temas relacionados:"
- no resumir
- no agregar texto
- no incluir la lÃ­nea "Temas relacionados:"
- mÃ¡ximo 10000 caracteres

5. logica
- opcional
- dejar "" si no puede determinarse de manera textual
- solo completar si el bloque describe explÃ­citamente el porquÃ© de la tendencia y su relevancia actual
- no inventar

6. fuente
- si no hay una fuente Ãºnica y explÃ­cita para esa tendencia: ""
- no usar automÃ¡ticamente "World Economic Forum" salvo que el campo se quiera forzar asÃ­ por negocio
- si no se puede determinar inequÃ­vocamente desde el bloque: ""

7. urlFuente
- si no hay una URL puntual inequÃ­voca asociada a esa tendencia dentro del texto dado: ""
- no inventar

8. urlImagen
- si no aparece una URL de imagen explÃ­cita: ""

9. urlVideo
- si no aparece una URL de video explÃ­cita: ""

10. pestelNombres
- ARRAY JSON
- inferencia mÃ­nima permitida SOLO a partir del texto del bloque
- usar SOLO valores vÃ¡lidos:
  ["Social","TecnolÃ³gico","EconÃ³mico","EcolÃ³gico","PolÃ­tico","Legal"]
- incluir todos los que apliquen
- si no hay evidencia suficiente: []

11. sectorNombres
- ARRAY JSON
- inferencia mÃ­nima permitida SOLO a partir del texto del bloque
- usar SOLO sectores de esta lista oficial:
${sectorList}
- si el bloque trata de manufactura de forma general, priorizar "Industria"
- aÃ±adir otros sectores solo si el texto lo justifica claramente
- si no hay evidencia suficiente: []

12. paisOrigen
- si el bloque menciona un paÃ­s principal de origen de la tendencia, usarlo
- si es una tendencia global o no se puede determinar: ""

13. temasRelacionados
- ARRAY JSON de tÃ³picos secundarios
- extraer EXCLUSIVAMENTE desde la lÃ­nea textual "Temas relacionados:" del bloque de cada tendencia
- âš ï¸ IMPORTANTE: el PDF puede estar compactado sin espacios; la lÃ­nea puede aparecer como:
    "Temas relacionados: Tema1, Tema2, ..."    â† formato normal
    "Temasrelacionados: Tema1, Tema2, ..."     â† formato compactado (sin espacio)
    "Temasrelacionados:Tema1,Tema2,..."        â† totalmente compactado
  Busca CUALQUIERA de estas variantes al final del bloque de cada tendencia.
- Los temas individuales tambiÃ©n pueden aparecer compactados:
    "LatransformaciÃ³ndigitaldelosnegocios" = "La transformaciÃ³n digital de los negocios"
  En ese caso, separa las palabras y reconstruye el nombre del tema correctamente.
- la lÃ­nea tiene el formato: "Temas relacionados: Tema1, Tema2, Tema3, Tema4, ..."
- COPIA TODOS Y CADA UNO de los temas separados por coma, TAL COMO APARECEN en esa lÃ­nea
- si la lÃ­nea tiene 10 temas, devuelves 10 elementos; si tiene 15, devuelves 15
- NO omitas ningÃºn tema de la lista
- NO simplifiques ni resumas la lista
- NO generes temas propios ni uses los del pÃ¡rrafo principal
- NO uses el grÃ¡fico/mapa de temas del documento
- si no aparece la lÃ­nea "Temas relacionados:" (ni su variante compactada) en el bloque: []

14. fragmento
- cita textual breve del bloque de la tendencia
- mÃ¡ximo 150 caracteres
- debe salir del subtÃ­tulo o del cuerpo principal
- no usar "Temas relacionados" como fragmento

================================
REGLAS DE CONSISTENCIA
================================
- \`titulo\` y \`nombre\` deben ser distintos
- \`descCorta\` debe coincidir con la lÃ­nea breve bajo el tÃ­tulo
- \`descLarga\` no debe incluir el subtÃ­tulo ni "Temas relacionados:"
- \`temasRelacionados\` debe salir de la lÃ­nea textual del bloque, no del grÃ¡fico
- \`urlFuente\`, \`urlImagen\`, \`urlVideo\` deben ir vacÃ­os si el texto no los contiene explÃ­citamente
- No inventar links
- Debes devolver exactamente 5 objetos en \`tendencias\`

================================
CRITERIOS DE CLASIFICACIÃ“N MÃNIMA
================================
Usa estas pautas SOLO para \`pestelNombres\` y \`sectorNombres\`:

PESTEL:
- TecnolÃ³gico: IA, automatizaciÃ³n, sensores, IoT, 5G, impresiÃ³n 3D, materiales avanzados
- EconÃ³mico: productividad, competitividad, inversiÃ³n, costos, cadenas de valor
- EcolÃ³gico: emisiones, reciclaje, sostenibilidad, circularidad, cero neto
- PolÃ­tico: tensiones geopolÃ­ticas, polÃ­ticas industriales, contrataciÃ³n pÃºblica, regulaciÃ³n estatal
- Legal: normas, estÃ¡ndares, cumplimiento regulatorio
- Social: empleo, habilidades, fuerza laboral, bienestar, educaciÃ³n

Sector:
- si habla de manufactura general: "Industria"
- si ademÃ¡s habla de IA, analÃ­tica o tecnologÃ­as digitales: puedes aÃ±adir "TecnologÃ­a de la InformaciÃ³n"
- si habla explÃ­citamente de energÃ­a, salud, logÃ­stica, educaciÃ³n, etc., asignar solo si el texto lo respalda claramente

================================
ENTRADA
================================
FUENTE DEL DOCUMENTO: ${fuenteDoc}

TEXTO DEL PDF â€” secciÃ³n Contexto EstratÃ©gico:
${seccionTendencias}${temasHint}

================================
SALIDA
================================
Devuelve SOLO JSON vÃ¡lido, sin markdown y sin texto adicional.

{
  "tendencias": [
    {
      "titulo": "",
      "nombre": "",
      "descCorta": "",
      "descLarga": "",
      "logica": "",
      "fuente": "",
      "urlFuente": "",
      "urlImagen": "",
      "urlVideo": "",
      "pestelNombres": [],
      "sectorNombres": [],
      "paisOrigen": "",
      "temasRelacionados": [],
      "fragmento": ""
    }
  ]
}
`.trim();

  const raw = await callImport(prompt, 5000);
  const arr = parseJSON<any>(raw, 'tendencias');
  const ts  = Date.now();
  return arr.map((p: any, i: number): PropuestaImportacion => {
    const pNombres: string[] = Array.isArray(p.pestelNombres)
      ? p.pestelNombres.map(String).filter(Boolean)
      : String(p.pestelNombre || p.pestelLetra || '').split(';').map((s: string) => s.trim()).filter(Boolean);
    const pNombre = pNombres.join('; ');
    const sNombres: string[] = Array.isArray(p.sectorNombres)
      ? p.sectorNombres.map(String).filter(Boolean)
      : String(p.sectorNombre || p.id_sector || '').split(';').map((s: string) => s.trim()).filter(Boolean);
    const temasRelacionados = temasExtraidos[i]?.length
      ? temasExtraidos[i]
      : (Array.isArray(p.temasRelacionados)
        ? p.temasRelacionados.map(String).filter(Boolean)
        : String(p.temasRelacionados || '').split(';').map((s: string) => s.trim()).filter(Boolean));
    return {
      id:                  `ten-${i}-${ts}`,
      tipo:                'tendencia',
      titulo:              String(p.titulo    || '').slice(0, 90),
      nombre:              String(p.nombre    || p.titulo || '').replace(/_/g, ' ').slice(0, 55),
      descCorta:           String(p.descCorta || '').slice(0, 200),
      descLarga:           String(p.descLarga || ''),
      fuente:              String(p.fuente || fuenteDoc),
      urlFuente:           String(p.urlFuente || ''),
      urlsFuente:          Array.isArray(p.urlsFuente)
        ? uniqueStrings(p.urlsFuente.filter((u: any) => typeof u === 'string' && u.startsWith('http') && u !== String(p.urlFuente || '')))
        : [],
      urlImagen:           '',
      urlVideo:            String(p.urlVideo  || ''),
      probabilidad:        null,
      temasRelacionados,
      pestelNombre:        pNombre,
      pestelLetra:         pestelToLetra(pNombre),
      sectorNombre:        sNombres.join('; '),
      fragmento:           String(p.fragmento    || '').slice(0, 200),
      razonClasificacion:  String(p.razonClasificacion || ''),
      nivelEvidencia:      String(p.nivelEvidencia || ''),
      paisOrigen:          '',
      fechaArticulo:       '',
      actorPrincipal:      '',
      accionDetectada:     '',
      lugar:               null,
      fechaMencionada:     null,
      cifrasClave:         [],
      tecnologiaOTema:     '',
      definicionOperativa: String(p.definicionOperativa || ''),
      fundamentoAnalitico: String(p.fundamentoAnalitico || ''),
      senalesSoporte:      Array.isArray(p.senalesSoporte) ? p.senalesSoporte.map(String) : [],
      nivel:               String(p.nivel || ''),
      horizonteTemporal:   null,
      tendenciasSoporte:   [],
      topico:              '',
      referencias:         [],
    };
  });
}

/**
 * 8c) Extraer ESCENARIOS â€” futuros plausibles, previsiones o proyecciones del documento
 *     Adaptado de la plantilla oficial del sistema RADAR
 */
export async function extraerEscenarios(
  texto: string,
  fuenteDoc: string,
  sectors: string[] = []
): Promise<PropuestaImportacion[]> {
  if (!texto.trim()) return [];

  const sectorList = sectors.length > 0
    ? sectors.join('\n')
    : 'Salud\nLogÃ­stica\nFinanzas\nEducaciÃ³n\nEnergÃ­a\nAeroespacial\nIndustria\nTecnologÃ­a de la InformaciÃ³n\nMinerÃ­a y Recursos Naturales\nAgroindustria\nConstrucciÃ³n e Infraestructura\nBiotecnologÃ­a y Ciencias de la Vida\nTurismo y HotelerÃ­a\nTelecomunicaciones\nMedioambiente y Sostenibilidad\nComercio y E-commerce\nGobierno y Sector PÃºblico\nMedios, ComunicaciÃ³n y Entretenimiento\nDefensa y Seguridad';

  // Buscar secciÃ³n "2.1 Previsiones" donde estÃ¡n los escenarios en el PDF.
  // Se usa minPos=3000 para saltar portada + ToC (pÃ¡gs 1-2, ~2000 chars) y evitar
  // que el Ã­ndice de contenidos ("2.1 Previsiones  10") sea el primer match.
  // Palabras clave ordenadas de mÃ¡s especÃ­fica (texto de la intro de la secciÃ³n)
  // a mÃ¡s genÃ©rica (nombre de la secciÃ³n) como fallback.
  const seccionEscenariosBase = extractSection(texto, [
    'describimos las previsiones mÃ¡s probables',
    'describimoslasprevisionesmÃ¡sprobables',
    'describimoslasprevisionesmas',
    '2.1 previsiones',
    'previsiones y escenarios',
    'previsiones',
    'escenarios futuros',
    'proyecciones',
  ], 30000, 3000);
  const seccionEscenarios = seccionEscenariosBase
    .split(/\n?\s*2\.2\s+Escenarios/i)[0]
    .split(/\n?\s*2\.3\s+Implicaciones/i)[0];

  // Pre-procesar indicadores de probabilidad:
  // pdfjs extrae los cÃ­rculos rellenos como (cid:298) y los vacÃ­os como (cid:102).
  // Los reemplazamos por â— y â—‹ para que el modelo pueda contarlos.
  const seccionEscenariosProc = seccionEscenarios
    .replace(/\(cid:298\)/g, '\u25CF')
    .replace(/\(cid:102\)/g, '\u25CB')
    .replace(/\u012A/g, '\u25CF')
    // "Probabilidad: ●●●○○" -> "Probabilidad: 3/5" para que el conteo sea determinista.
    .replace(/(Probabilidad|Probability):\s*([^\n\r]*)/gi, (m) => {
      const n = parseProbabilityFromSnippet(m);
      return n ? m.replace(/(Probabilidad|Probability):\s*[^\n\r]*/i, (_x, label) => `${label}: ${n}/5`) : m;
    });

  const prompt = `
ðŸŽ¯ Eres un asistente para registrar escenarios en una base de datos de un Radar de innovaciÃ³n.
A partir del texto de un PDF, genera los campos requeridos para la tabla \`escenario\`.

Idioma de salida: espaÃ±ol.
MantÃ©n nombres propios, instituciones, marcas y tÃ­tulos de publicaciones en su idioma original cuando corresponda.

================================
REGLAS CRÃTICAS
================================
- NO usar fuentes externas.
- NO inventar datos.
- Trabaja SOLO con el contenido del PDF proporcionado.
- Si un campo no puede determinarse con evidencia suficiente, devolver "" o [] o null segÃºn corresponda.
- NO crear mÃ¡s registros de los que existan en el subapartado objetivo.
- NO crear menos registros de los que existan en el subapartado objetivo.

================================
ACLARACIÃ“N CLAVE DE NEGOCIO
================================
En este documento, los registros que deben guardarse en la tabla \`escenario\`
se extraen del subapartado:
"2.1 Previsiones"

IMPORTANTE:
- NO extraer nada desde "2.2 Escenarios", porque en este documento esa secciÃ³n no contiene escenarios desarrollados.
- NO extraer nada desde "2.3 Implicaciones para las partes interesadas".
- Cada bloque de previsiÃ³n dentro de "2.1 Previsiones" debe convertirse en UN registro de escenario.
- En este documento hay EXACTAMENTE 5 registros vÃ¡lidos.
- Debes devolver EXACTAMENTE 5 escenarios.

âš ï¸ ADVERTENCIA CRÃTICA â€” NO CONFUNDIR SECCIONES:
El documento tiene una secciÃ³n "1 Novedades y tendencias" que contiene subsecciones con
tÃ­tulos como "Navegando la RevoluciÃ³n Digital", "Priorizar la sostenibilidad",
"Construir cadenas de valor resilientes", etc.
ESOS NO SON ESCENARIOS. Son subsecciones de noticias.
IGNÃ“RALOS COMPLETAMENTE. Trabaja SOLO con los bloques de "2.1 Previsiones".

Los tÃ­tulos correctos de los escenarios son los encabezados de los bloques dentro de "2.1 Previsiones",
NO los tÃ­tulos de las subsecciones de "Novedades y tendencias".

================================
ALCANCE OBLIGATORIO
================================
Extrae SOLO los bloques del subapartado:
"2.1 Previsiones"

NO tratar como escenario:
- "2 Previsiones y escenarios"
- "2.1 Previsiones"
- "2.2 Escenarios"
- "2.3 Implicaciones para las partes interesadas"
- "Cadena causal experimental que ilustra esta previsiÃ³n usando IA."

================================
REGLA DE SEGMENTACIÃ“N
================================
Cada escenario corresponde a un bloque con esta estructura:

1. TÃTULO del bloque
2. PÃRRAFO descriptivo del bloque
3. lÃ­nea "Probabilidad:"
4. lÃ­nea "Referencias:"

Criterios de corte:
- El INICIO de un bloque es un tÃ­tulo de previsiÃ³n.
- Luego viene su descripciÃ³n.
- Luego viene su probabilidad.
- Luego vienen sus referencias.
- El FIN del bloque ocurre justo antes del siguiente tÃ­tulo de previsiÃ³n.
- En el quinto bloque, la probabilidad y referencias pueden continuar en la pÃ¡gina siguiente; debes unirlas al mismo bloque.

================================
REGLA DE ORO â€” COPIA FIEL + MAPEO CONTROLADO
================================
Tu tarea es reconocer, extraer y mapear fielmente.

- NO resumir la descripciÃ³n larga.
- NO parafrasear la descripciÃ³n larga.
- NO fusionar varios bloques en uno.
- NO dividir un mismo bloque en varios registros.
- SÃ puedes traducir al espaÃ±ol cuando el contenido estÃ© en inglÃ©s.
- SÃ puedes inferir mÃ­nimamente PESTEL y sector SOLO a partir del texto del bloque.
- SÃ debes mapear \`topico\` con el asunto principal del documento.

================================
CAMPOS A DEVOLVER
================================
Debes devolver SOLO estos campos por escenario:

1. topico
- obligatorio
- corresponde al asunto principal del artÃ­culo/documento
- en este informe debe salir del tÃ­tulo principal del documento
- copiar en espaÃ±ol tal como aparece
- ejemplo esperado para este documento: "Futuro de la manufactura"

2. titulo
- obligatorio
- copiar el tÃ­tulo exacto del bloque
- traducir al espaÃ±ol si estÃ¡ en inglÃ©s
- no resumir
- mÃ¡ximo 180 caracteres

3. nombre
- obligatorio
- micro-identificador de 3 a 5 palabras clave
- minÃºsculas
- sin artÃ­culos
- separado por espacios
- no usar guiones bajos

4. descCorta
- obligatorio
- copiar la primera oraciÃ³n descriptiva del bloque
- traducir al espaÃ±ol si estÃ¡ en inglÃ©s
- mÃ¡ximo 250 caracteres
- no usar la lÃ­nea de probabilidad ni referencias

5. descLarga
- obligatorio
- copiar la descripciÃ³n completa del bloque
- traducir al espaÃ±ol si estÃ¡ en inglÃ©s
- NO incluir el tÃ­tulo
- NO incluir la lÃ­nea "Probabilidad:"
- NO incluir la lÃ­nea "Referencias:"
- NO incluir "Cadena causal experimental..." salvo que forme parte explÃ­cita de la descripciÃ³n
- mÃ¡ximo 10000 caracteres

6. urlFuente
- string
- si existe una fuente principal inequÃ­voca dentro de las referencias, colocar la mÃ¡s representativa
- si no hay URL explÃ­cita sino solo referencia textual, dejar ""
- no inventar URLs

7. urlsFuente
- ARRAY JSON
- incluir URLs explÃ­citas adicionales si aparecen en el texto
- NO repetir \`urlFuente\`
- si el documento solo da referencias bibliogrÃ¡ficas y no URLs completas, devolver []

8. pestelNombres
- ARRAY JSON
- usar SOLO estos valores:
  ["Social","TecnolÃ³gico","EconÃ³mico","EcolÃ³gico","PolÃ­tico","Legal"]
- incluir todos los que apliquen segÃºn el texto del bloque
- no inventar categorÃ­as

9. sectorNombres
- ARRAY JSON
- usar SOLO sectores de esta lista oficial:
${sectorList}
- devolver un ARRAY; puede incluir mÃ¡s de un sector cuando el bloque lo justifique
- si el bloque trata de manufactura de forma general, incluir "Industria"
- aÃ±adir sectores especÃ­ficos ademÃ¡s de "Industria" cuando el texto lo justifique claramente
- no usar "Agroindustria" como sector genÃ©rico de manufactura; usarlo solo si habla de agricultura, semillas, cultivos, insumos agrÃ­colas o breeding vegetal
- no inventar sectores

10. tendenciasSoporte
- ARRAY JSON
- son las tendencias del propio documento que sustentan el escenario
- elegir SOLO de esta lista cerrada:
  [
    "Navegar la revoluciÃ³n digital",
    "Priorizar la sostenibilidad",
    "Construir cadenas de valor resilientes",
    "Hacer realidad la automatizaciÃ³n totalmente flexible",
    "Atraer a la fuerza laboral la prÃ³xima generaciÃ³n"
  ]
- incluir una o varias si el contenido del bloque se apoya claramente en ellas
- no inventar otras tendencias

11. probabilidad
- leer el valor de la lÃ­nea "Probabilidad:" o "Probability:" de ese bloque
- el indicador puede estar en varios formatos:
  a) Puntos/cÃ­rculos: contar los sÃ­mbolos rellenos (â—â€¢â—‰â—†â– â–ªâ˜…) de un mÃ¡ximo de 5
  b) Estrellas: contar las estrellas rellenas (â˜…) frente a las vacÃ­as (â˜†)
  c) NÃºmero explÃ­cito: "Probabilidad: 3" o "3/5" o "3 de 5" â†’ usar ese nÃºmero
  d) Texto: "alta" â†’ 4-5, "media" â†’ 3, "baja" â†’ 1-2
- devolver siempre un entero entre 1 y 5
- si no hay ningÃºn indicador de probabilidad: devolver null

12. referencias
- ARRAY JSON de strings
- extraer cada referencia individual de la lÃ­nea "Referencias:"
- mantener tÃ­tulos y medios tal como aparecen
- NO convertirlas en URL si el texto no da URL completa
- NO inventar referencias
- si no hay referencias: []

================================
REGLAS DE CONSISTENCIA
================================
- Debes devolver EXACTAMENTE 5 objetos.
- Cada objeto corresponde a una previsiÃ³n distinta del subapartado 2.1.
- \`topico\` debe ser el mismo en los 5 objetos porque pertenece al mismo artÃ­culo.
- \`titulo\` debe ser Ãºnico por registro.
- \`descLarga\` debe corresponder solo a ese bloque.
- \`probabilidad\` debe salir del mismo bloque.
- \`referencias\` debe salir del mismo bloque.
- \`tendenciasSoporte\` debe usar SOLO la lista cerrada indicada.
- Si la probabilidad del quinto bloque aparece en la pÃ¡gina siguiente, debes asociarla a ese mismo bloque.
- No mezclar referencias entre bloques.

================================
CRITERIOS DE CLASIFICACIÃ“N MÃNIMA
================================
PESTEL:
- TecnolÃ³gico: sensores, fotÃ³nica, almacenamiento, control, diagnÃ³sticos, manufactura avanzada, automatizaciÃ³n
- EconÃ³mico: costos, productividad, escalamiento, demanda, posicionamiento comercial
- EcolÃ³gico: energÃ­a, renovables, confiabilidad de red, sostenibilidad
- PolÃ­tico: normas, regulaciÃ³n, estÃ¡ndares pÃºblicos, autoridades municipales
- Legal: cumplimiento, protocolos, estÃ¡ndares formales
- Social: salud pÃºblica, cuidado preventivo, impacto en comunidades, acceso

Sector:
- manufactura general -> ["Industria"]
- electrÃ³nica de consumo / sensores / fotÃ³nica / interfaces digitales -> ["Industria","TecnologÃ­a de la InformaciÃ³n"]
- salud pÃºblica / mosquitos Wolbachia / dengue -> ["Salud","BiotecnologÃ­a y Ciencias de la Vida"]
- dispositivos mÃ©dicos / diagnÃ³sticos / aptÃ¡meros / point-of-care -> ["Salud","BiotecnologÃ­a y Ciencias de la Vida"]
- agricultura / semillas / insumos / cultivos / speed breeding -> ["Agroindustria"]
- energÃ­a / red / almacenamiento / renovables -> ["EnergÃ­a","Industria"]
- software / control / IA / sensores digitales -> aÃ±adir "TecnologÃ­a de la InformaciÃ³n" si aplica claramente

================================
ENTRADA
================================
FUENTE DEL DOCUMENTO: ${fuenteDoc}

TEXTO DEL PDF (subapartado 2.1 Previsiones):
${seccionEscenariosProc}

================================
SALIDA
================================
Devuelve SOLO JSON vÃ¡lido, sin markdown, sin comentarios y sin texto adicional.

{
  "escenarios": [
    {
      "topico": "",
      "titulo": "",
      "nombre": "",
      "descCorta": "",
      "descLarga": "",
      "urlFuente": "",
      "urlsFuente": [],
      "pestelNombres": [],
      "sectorNombres": [],
      "tendenciasSoporte": [],
      "probabilidad": null,
      "referencias": []
    }
  ]
}
`.trim();

  const raw = await callImport(prompt, 5000);
  const arr = parseJSON<any>(raw, 'escenarios');

  // Pre-compute all probability values in the section text, in order of appearance.
  // Searches both Spanish "Probabilidad:" and English "Probability:" since PDFs may be either.
  // Each escenario (index i) gets allProbabilities[i] â€” more reliable than title-based search.
  const allProbabilities: (number | null)[] = [];
  {
    // Collect all occurrence positions from both labels, then sort by position
    const positions: number[] = [];
    for (const label of ['Probabilidad:', 'Probability:']) {
      let p = 0;
      while (true) {
        const idx = seccionEscenariosProc.indexOf(label, p);
        if (idx === -1) break;
        positions.push(idx);
        p = idx + 1;
      }
    }
    positions.sort((a, b) => a - b);
    for (const idx of positions) {
      const snippet = seccionEscenariosProc.slice(idx, idx + 80);
      allProbabilities.push(parseProbabilityFromSnippet(snippet));
    }
  }

  const ts  = Date.now();
  const referenceUrlsByScenario = extractReferenceUrlsByScenario(seccionEscenariosProc);
  const titlesByScenario = extractScenarioTitlesFromSection(seccionEscenariosProc);
  return arr.map((p: any, i: number): PropuestaImportacion => {
    const pNombres: string[] = Array.isArray(p.pestelNombres)
      ? p.pestelNombres.map(repairMojibake).filter(Boolean)
      : repairMojibake(p.pestelNombre || p.pestelLetra || '').split(';').map((s: string) => s.trim()).filter(Boolean);
    const pNombre = pNombres.join('; ');
    const sNombres: string[] = Array.isArray(p.sectorNombres)
      ? p.sectorNombres.map(repairMojibake).filter(Boolean)
      : repairMojibake(p.sectorNombre || p.id_sector || '').split(';').map((s: string) => s.trim()).filter(Boolean);
    const scenarioText = [
      p.titulo,
      p.nombre,
      p.descCorta,
      p.descLarga,
      p.fragmento,
      Array.isArray(p.referencias) ? p.referencias.join(' ') : '',
    ].map(v => String(v || '')).join(' ');
    const sectorNombres = normalizeScenarioSectors(sNombres, scenarioText, sectorList.split('\n'));
    const referenceUrls = referenceUrlsByScenario[i] || [];
    const aiUrlFuente = String(p.urlFuente || '');
    const aiUrlsFuente = Array.isArray(p.urlsFuente)
      ? p.urlsFuente.filter((u: any) => typeof u === 'string' && u.startsWith('http'))
      : [];
    const scenarioUrls = referenceUrls.length > 0
      ? referenceUrls
      : uniqueStrings([aiUrlFuente, ...aiUrlsFuente].filter((u: string) => u.startsWith('http')));
    const scenarioTitle = chooseScenarioTitle(titlesByScenario[i] || '', p.titulo || '');
    const scenarioDescCorta = repairMojibake(p.descCorta || '').slice(0, 200);
    const scenarioDescLarga = repairMojibake(p.descLarga || '');
    return {
      id:                  `esc-${i}-${ts}`,
      tipo:                'escenario',
      titulo:              scenarioTitle.slice(0, 180),
      nombre:              makeScenarioName(scenarioTitle, p.nombre || p.titulo || '').slice(0, 55),
      descCorta:           scenarioDescCorta,
      descLarga:           scenarioDescLarga,
      fuente:              repairMojibake(p.fuente || fuenteDoc),
      urlFuente:           scenarioUrls[0] || '',
      urlsFuente:          scenarioUrls,
      urlImagen:           '',
      urlVideo:            String(p.urlVideo  || ''),
      probabilidad:        (() => {
        // 1) Scan del texto del PDF (bullets o nÃºmero)
        const fromPdf = allProbabilities[i] ?? null;
        if (fromPdf !== null) return fromPdf;
        // 2) Fallback: valor que el AI devolviÃ³ en el JSON
        return typeof p.probabilidad === 'number'
          ? Math.min(5, Math.max(1, Math.round(p.probabilidad)))
          : null;
      })(),
      temasRelacionados:   [],
      pestelNombre:        pNombre,
      pestelLetra:         pestelToLetra(pNombre),
      sectorNombre:        sectorNombres.join('; '),
      fragmento:           repairMojibake(p.fragmento || '').slice(0, 200),
      razonClasificacion:  repairMojibake(p.razonClasificacion || ''),
      nivelEvidencia:      repairMojibake(p.nivelEvidencia || ''),
      paisOrigen:          '',
      fechaArticulo:       '',
      actorPrincipal:      '',
      accionDetectada:     '',
      lugar:               null,
      fechaMencionada:     null,
      cifrasClave:         [],
      tecnologiaOTema:     '',
      definicionOperativa: '',
      fundamentoAnalitico: '',
      senalesSoporte:      [],
      nivel:               '',
      horizonteTemporal:   p.horizonteTemporal ? repairMojibake(p.horizonteTemporal) : null,
      tendenciasSoporte:   Array.isArray(p.tendenciasSoporte) ? normalizeScenarioArray(p.tendenciasSoporte) : [],
      topico:              repairMojibake(p.topico || ''),
      referencias:         referenceUrls.length > 0
        ? referenceUrls
        : (Array.isArray(p.referencias) ? normalizeScenarioArray(p.referencias) : []),
    };
  });
}

/**
 * 8d) Sugerir relaciones â€” jerarquÃ­a WEF: SeÃ±al â†’ Tendencia â†’ Escenario
 *     Adaptado de la plantilla oficial del sistema RADAR (anÃ¡lisis prospectivo)
 */
export async function sugerirRelaciones(
  propuestas: PropuestaImportacion[]
): Promise<RelacionSugerida[]> {
  const senales    = propuestas.filter(p => p.tipo === 'senal');
  const tendencias = propuestas.filter(p => p.tipo === 'tendencia');
  const escenarios = propuestas.filter(p => p.tipo === 'escenario');
  if (propuestas.length < 2) return [];

  // Pasa nombre + descCorta como contexto (igual que la plantilla: desc_larga + url_fuente)
  const fmt = (arr: PropuestaImportacion[], tipo: string) =>
    arr.length === 0
      ? `  (ningÃºn ${tipo})`
      : arr.map(p => `  ID: ${p.id}\n  nombre: ${p.nombre}\n  desc: ${p.descCorta.slice(0, 120)}`).join('\n\n');

  const prompt = `
ActÃºa como experto en future thinking, foresight estratÃ©gico y anÃ¡lisis prospectivo.
Tu tarea es identificar relaciones reales, justificadas y no forzadas entre seÃ±ales, tendencias y escenarios del mismo informe.

ðŸ” Criterio principal: analiza el contenido sustantivo (nombre + descripciÃ³n) de cada elemento.
Prioridad: lÃ³gica causal del contenido â†’ fenÃ³meno descrito â†’ tÃ­tulo/sector como apoyo secundario.

ðŸ“‹ CÃ³mo entender cada entidad
- SeÃ±al: evidencia concreta, emergente o temprana de cambio
- Tendencia: patrÃ³n mÃ¡s amplio y sostenido que agrupa varias seÃ±ales
- Escenario: proyecciÃ³n futura plausible derivada de seÃ±ales o tendencias

SEÃ‘ALES:
${fmt(senales, 'seÃ±al')}

TENDENCIAS:
${fmt(tendencias, 'tendencia')}

ESCENARIOS:
${fmt(escenarios, 'escenario')}

ðŸ”’ Reglas
- No forces relaciones artificiales. Una relaciÃ³n debe tener sentido prospectivo real.
- Tipos de relaciÃ³n vÃ¡lidos:
  â€¢ senal_tendencia: la seÃ±al es evidencia concreta del patrÃ³n que describe la tendencia
  â€¢ tendencia_escenario: la tendencia impulsa o sustenta el escenario futuro
  â€¢ senal_escenario: la seÃ±al anticipa directamente el fenÃ³meno del escenario
- Debes intentar relacionar TODOS los elementos que tengan conexiÃ³n temÃ¡tica real.
  No dejes seÃ±ales, tendencias ni escenarios sin ninguna relaciÃ³n si hay conexiÃ³n justificable.
- MÃ¡ximo 80 relaciones en total (prioriza las de confianza alta y media).

Por cada relaciÃ³n:
- tipo: "senal_tendencia" | "tendencia_escenario" | "senal_escenario"
- confianzaRelacion: "alto" (conexiÃ³n explÃ­cita) | "medio" (plausible) | "bajo" (especulativa)

Responde SOLO JSON vÃ¡lido:
{"relaciones":[{"idOrigen":"sen-0-xxx","idDestino":"ten-0-xxx","tipo":"senal_tendencia","confianzaRelacion":"alto"}]}
`.trim();

  const raw = await callImport(prompt, 2500);
  const arr = parseJSON<any>(raw, 'relaciones');
  const idMap = new Map(propuestas.map(p => [p.id, p.titulo]));

  return arr
    .filter((r: any) => r.idOrigen && r.idDestino && r.tipo
      && idMap.has(r.idOrigen) && idMap.has(r.idDestino))
    .map((r: any): RelacionSugerida => ({
      idOrigen:          r.idOrigen,
      idDestino:         r.idDestino,
      tipo:              r.tipo,
      labelOrigen:       idMap.get(r.idOrigen)  || r.idOrigen,
      labelDestino:      idMap.get(r.idDestino) || r.idDestino,
      aceptada:          r.confianzaRelacion !== 'bajo',  // pre-acepta alto y medio
      confianzaRelacion: String(r.confianzaRelacion || 'medio'),
    }));
}

/**
 * 7) Rueda de Futuros â€” consecuencias de 1.er y 2.o orden
 *    Input: tÃ³pico o concepto
 *    Output: JSON con centro + 5 consecuencias x 2 niveles
 */
export async function generateFuturesWheel(topic: string): Promise<FuturesWheelData> {
  const prompt = `
Eres experto en prospectiva estratÃ©gica. Genera una Rueda de Futuros para educaciÃ³n superior universitaria.

TÃ“PICO CENTRAL: ${topic}

Estructura requerida:
- center: el tÃ³pico reformulado en 3-5 palabras
- firstOrder: exactamente 5 consecuencias directas e inmediatas (frases de 3-5 palabras)
- secondOrder: exactamente 2 consecuencias derivadas por cada item de firstOrder (frases de 3-4 palabras)

Responde SOLO con JSON vÃ¡lido (sin markdown, sin bloques de cÃ³digo):
{"center":"<3-5 palabras>","firstOrder":["cons1","cons2","cons3","cons4","cons5"],"secondOrder":[["sub1a","sub1b"],["sub2a","sub2b"],["sub3a","sub3b"],["sub4a","sub4b"],["sub5a","sub5b"]]}
`.trim();

  const raw = await callHF(prompt, 500);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('La IA no devolviÃ³ JSON vÃ¡lido para la rueda');
  return JSON.parse(match[0]);
}
