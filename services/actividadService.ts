
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
  fetch('/api/actividad', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ evento, ...opts }),
  }).catch(() => {});
}
