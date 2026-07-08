import dns from 'dns/promises';
import net from 'net';
import sanitizeHtmlLib from 'sanitize-html';

const RICH_TEXT_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'a',
];

const RICH_TEXT_ATTRS = {
  a: ['href', 'name', 'target', 'rel'],
  span: ['class'],
  div: ['class'],
  p: ['class'],
  h1: ['class'],
  h2: ['class'],
  h3: ['class'],
  h4: ['class'],
  h5: ['class'],
  h6: ['class'],
  code: ['class'],
  pre: ['class'],
};

//----------------TI-60----------------
// Sanitiza HTML enriquecido (control OWASP anti-XSS): solo permite un set
// acotado de tags/atributos y fuerza rel=noopener/noreferrer en enlaces.
export function sanitizeRichHtml(value) {
  return sanitizeHtmlLib(String(value ?? ''), {
    allowedTags: RICH_TEXT_TAGS,
    allowedAttributes: RICH_TEXT_ATTRS,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform('a', {
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
      }),
    },
  }).trim();
}

export function normalizePositiveInt(value, fallback = 1, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function validateExcelUpload(file) {
  if (!file) return 'No se recibió archivo';

  const originalName = file.originalname || '';
  const mimetype = file.mimetype || '';
  const hasExcelExt = /\.(xlsx|xls)$/i.test(originalName);
  const hasExcelMime = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ].includes(mimetype);

  if (!hasExcelExt || !hasExcelMime) {
    return 'Solo se aceptan archivos Excel válidos (.xlsx o .xls).';
  }
  return null;
}

export function validateWorkbookShape(rows, { maxRows = 50000, maxColumns = 250 } = {}) {
  if (!Array.isArray(rows)) return 'El archivo no pudo leerse como tabla.';
  if (rows.length > maxRows) return `El archivo supera el máximo permitido de ${maxRows} filas.`;
  const columnCount = rows[0] ? Object.keys(rows[0]).length : 0;
  if (columnCount > maxColumns) return `El archivo supera el máximo permitido de ${maxColumns} columnas.`;
  return null;
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (net.isIPv6(ip)) {
    const n = ip.toLowerCase();
    return n === '::1' || n.startsWith('fc') || n.startsWith('fd') || n.startsWith('fe80:') || n === '::';
  }

  return true;
}

//----------------TI-60----------------
// Guardia anti-SSRF (control OWASP): rechaza IPs privadas/localhost y
// resuelve el DNS para verificar que ningun registro apunte a red interna.
export async function isSafePublicHttpUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl));
  } catch {
    return false;
  }

  if (!['https:'].includes(parsed.protocol)) return false;

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '0.0.0.0' ||
    hostname === '::1'
  ) {
    return false;
  }

  if (net.isIP(hostname) && isPrivateIp(hostname)) return false;

  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    return records.length > 0 && records.every(record => !isPrivateIp(record.address));
  } catch {
    return false;
  }
}
