
let lastAuditKey = '';
let lastAuditAt = 0;

export function logActividad(
  evento: string,
  opts: {
    accion?: string;
    modulo?: string;
    vista?: string;
    elementoUuid?: string;
    elementoTipo?: string;
    elementoTitulo?: string;
    detalle?: string;
    metadata?: Record<string, unknown>;
  } = {}
): void {
  const key = JSON.stringify({
    evento,
    accion: opts.accion,
    modulo: opts.modulo,
    vista: opts.vista,
    elementoTipo: opts.elementoTipo,
    elementoTitulo: opts.elementoTitulo,
    detalle: opts.detalle,
  });
  const now = Date.now();
  if (key === lastAuditKey && now - lastAuditAt < 2000) return;
  lastAuditKey = key;
  lastAuditAt = now;

  fetch('/api/actividad', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ evento, ...opts }),
  }).catch(() => {});
}
