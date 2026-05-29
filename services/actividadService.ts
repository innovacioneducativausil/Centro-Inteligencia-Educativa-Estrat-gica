// services/actividadService.ts — Registra eventos de actividad (fire-and-forget).
export function logActividad(
  evento: string,
  opts: {
    modulo?: string;
    elementoUuid?: string;
    elementoTipo?: string;
    elementoTitulo?: string;
    metadata?: Record<string, unknown>;
  } = {}
): void {
  fetch('/api/actividad', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ evento, ...opts }),
  }).catch(() => {}); // nunca bloquear la UI por un fallo de logging
}
