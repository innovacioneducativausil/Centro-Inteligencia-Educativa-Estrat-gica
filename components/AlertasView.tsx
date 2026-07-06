import React, { useCallback, useEffect, useState } from 'react';
import { ThemeColors } from '../types';

interface AlertasViewProps {
  themeColors: ThemeColors;
  onVolver?: () => void;
}

interface Metrica {
  key: string;
  label: string;
}

interface Regla {
  id_regla: string;
  nombre: string;
  metrica: string;
  operador: string;
  valor_umbral: string;
  activa: number;
  fecha_creacion: string;
}

interface ElementoAfectado {
  titulo: string;
  url?: string | null;
  detalle?: string | null;
}

interface AlertaGenerada {
  id_alerta: number;
  regla_nombre: string;
  mensaje: string;
  valor_medido: string;
  valor_umbral: string;
  fecha_generada: string;
  atendida: number;
  elementos_afectados: ElementoAfectado[] | null;
}

interface PuntoHistorial {
  valor: number;
  fecha: string;
}

const OPERADORES = ['>=', '>', '<=', '<'];
const EMPTY = { nombre: '', metrica: '', operador: '>=', valorUmbral: '' };

async function requestJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

//----------------TI-08 / TI-23 / TI-31----------------
// Mini sparkline (12+ puntos) con la tendencia de una metrica en los ultimos dias.
const Sparkline: React.FC<{ puntos: PuntoHistorial[]; isDark: boolean }> = ({ puntos, isDark }) => {
  if (puntos.length < 2) {
    return <span style={{ fontSize: 11, color: '#94a3b8' }}>Sin historial suficiente</span>;
  }
  const width = 120;
  const height = 32;
  const pad = 4;
  const valores = puntos.map(p => p.valor);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;
  const stepX = (width - pad * 2) / (puntos.length - 1);
  const coords = puntos.map((p, i) => {
    const x = pad + i * stepX;
    const y = height - pad - ((p.valor - min) / rango) * (height - pad * 2);
    return { x, y, ...p };
  });
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  const line = '#0D9488';
  const surface = isDark ? '#1e293b' : '#ffffff';

  return (
    <svg width={width} height={height} role="img" aria-label={`Tendencia: ultimo valor ${last.valor}`}>
      <path d={path} fill="none" stroke={line} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 4 : 2}
          fill={line} stroke={surface} strokeWidth={i === coords.length - 1 ? 2 : 1}>
          <title>{`${new Date(c.fecha).toLocaleString('es-PE')}: ${c.valor}`}</title>
        </circle>
      ))}
    </svg>
  );
};

//----------------TI-08 / TI-23 / TI-31----------------
// Avisa al recuadro flotante (Layout) que revise alertas pendientes ya,
// en vez de esperar su sondeo periodico de 5 minutos.
function notificarAlertasActualizadas() {
  window.dispatchEvent(new Event('radar-alertas-actualizar'));
}

//----------------TI-08 / TI-23 / TI-31----------------
const AlertasView: React.FC<AlertasViewProps> = ({ themeColors, onVolver }) => {
  const isDark = themeColors.bg.includes('950') || themeColors.bg.includes('slate-900');
  const [metricas, setMetricas] = useState<Metrica[]>([]);
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [generadas, setGeneradas] = useState<AlertaGenerada[]>([]);
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [historial, setHistorial] = useState<Record<string, PuntoHistorial[]>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [metricasRes, reglasRes, generadasRes] = await Promise.all([
        requestJson('/api/alertas/metricas', { credentials: 'include' }),
        requestJson('/api/alertas/reglas', { credentials: 'include' }),
        requestJson(`/api/alertas/generadas${soloPendientes ? '?pendientes=1' : ''}`, { credentials: 'include' }),
      ]);
      if (!metricasRes.res.ok) throw new Error('No se pudieron cargar las metricas.');
      if (!reglasRes.res.ok) throw new Error('No se pudieron cargar las reglas.');
      if (!generadasRes.res.ok) throw new Error('No se pudieron cargar las alertas.');
      setMetricas(metricasRes.data.data || []);
      setReglas(reglasRes.data.data || []);
      setGeneradas(generadasRes.data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar alertas.');
    } finally {
      setLoading(false);
    }
  }, [soloPendientes]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  //----------------TI-08 / TI-23 / TI-31----------------
  // Carga el historial (30 dias) de cada metrica usada por alguna regla, para el sparkline.
  useEffect(() => {
    const metricasUsadas = Array.from(new Set(reglas.map(r => r.metrica)));
    const faltantes = metricasUsadas.filter(m => !(m in historial));
    if (!faltantes.length) return;
    (async () => {
      const entries = await Promise.all(faltantes.map(async m => {
        const { res, data } = await requestJson(`/api/alertas/historial?metrica=${encodeURIComponent(m)}&dias=30`, { credentials: 'include' });
        return [m, res.ok ? (data.data || []) : []] as const;
      }));
      setHistorial(prev => {
        const next = { ...prev };
        entries.forEach(([m, puntos]) => { next[m] = puntos; });
        return next;
      });
    })();
  }, [reglas, historial]);

  const createRegla = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { res, data } = await requestJson('/api/alertas/reglas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la regla.');
      setForm(EMPTY);
      setMessage('Regla de alerta creada.');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la regla.');
    } finally {
      setSaving(false);
    }
  };

  const toggleRegla = async (regla: Regla) => {
    setError(null);
    try {
      const { res, data } = await requestJson(`/api/alertas/reglas/${regla.id_regla}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ activa: !regla.activa }),
      });
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la regla.');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la regla.');
    }
  };

  const deleteRegla = async (regla: Regla) => {
    if (!window.confirm(`¿Eliminar la regla "${regla.nombre}"?`)) return;
    setError(null);
    try {
      const { res, data } = await requestJson(`/api/alertas/reglas/${regla.id_regla}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar la regla.');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la regla.');
    }
  };

  const atenderAlerta = async (alerta: AlertaGenerada) => {
    setError(null);
    try {
      const { res, data } = await requestJson(`/api/alertas/generadas/${alerta.id_alerta}/atender`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(data.error || 'No se pudo marcar como atendida.');
      await fetchAll();
      notificarAlertasActualizadas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo marcar como atendida.');
    }
  };

  const evaluarAhora = async () => {
    setError(null);
    setMessage(null);
    try {
      const { res, data } = await requestJson('/api/alertas/evaluar', { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(data.error || 'No se pudo evaluar.');
      setMessage(`Evaluacion ejecutada. Alertas nuevas: ${data.generadas}.`);
      await fetchAll();
      notificarAlertasActualizadas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo evaluar.');
    }
  };

  const inputCls = `px-3 py-2 text-xs rounded-lg border outline-none ${
    isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'
  }`;

  return (
    <div style={{ padding: '32px 32px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: isDark ? '#e2e8f0' : '#0F2A3F', marginBottom: 4 }}>
            Alertas por Umbral
          </h2>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>
            Reglas configurables que generan alertas automaticas cuando una metrica cruza un umbral definido.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={evaluarAhora} style={{ border: 'none', borderRadius: 8, padding: '0 14px', background: '#0D9488', color: '#fff', fontSize: 12, fontWeight: 800, height: 34 }}>
            Evaluar ahora
          </button>
          {onVolver && (
            <button type="button" onClick={onVolver}
              style={{ border: '1px solid #cbd5e1', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#e2e8f0' : '#334155', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', height: 34 }}>
              Volver a Gestion
            </button>
          )}
        </div>
      </div>

      <form onSubmit={createRegla}
        style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr .6fr .7fr auto', gap: 10, padding: 14, borderRadius: 12, background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.07)'}`, marginBottom: 16 }}>
        <input className={inputCls} placeholder="Nombre de la regla" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
        <select className={inputCls} value={form.metrica} onChange={e => setForm({ ...form, metrica: e.target.value })}>
          <option value="">Selecciona metrica</option>
          {metricas.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <select className={inputCls} value={form.operador} onChange={e => setForm({ ...form, operador: e.target.value })}>
          {OPERADORES.map(op => <option key={op} value={op}>{op}</option>)}
        </select>
        <input className={inputCls} type="number" placeholder="Umbral" value={form.valorUmbral} onChange={e => setForm({ ...form, valorUmbral: e.target.value })} />
        <button disabled={saving} style={{ border: 'none', borderRadius: 8, padding: '0 14px', background: '#0036DC', color: '#fff', fontSize: 12, fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}>
          {saving ? 'Guardando' : 'Crear regla'}
        </button>
      </form>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{error}</div>}
      {message && <div style={{ color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 12, fontWeight: 700 }}>{message}</div>}

      <div style={{ borderRadius: 12, border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.08)'}`, background: isDark ? '#1e293b' : 'white', overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}` }}>
          Reglas configuradas
        </div>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Cargando...</div>
        ) : reglas.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Sin reglas configuradas.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ padding: '0 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Nombre</th>
                <th style={{ padding: '0 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Metrica</th>
                <th style={{ padding: '0 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Umbral</th>
                <th style={{ padding: '0 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Tendencia (30d)</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reglas.map(regla => (
                <tr key={regla.id_regla} style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}` }}>
                  <td style={{ padding: 12, fontWeight: 700, color: isDark ? '#e2e8f0' : '#0F2A3F' }}>{regla.nombre}</td>
                  <td style={{ padding: 12, color: '#94a3b8' }}>{metricas.find(m => m.key === regla.metrica)?.label || regla.metrica}</td>
                  <td style={{ padding: 12, color: '#94a3b8' }}>{regla.operador} {regla.valor_umbral}</td>
                  <td style={{ padding: 12 }}>
                    <Sparkline puntos={historial[regla.metrica] || []} isDark={isDark} />
                  </td>
                  <td style={{ padding: 12 }}>
                    <button onClick={() => toggleRegla(regla)}
                      style={{ border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 800, background: regla.activa ? '#dcfce7' : '#fee2e2', color: regla.activa ? '#166534' : '#991b1b', cursor: 'pointer' }}>
                      {regla.activa ? 'Activa' : 'Inactiva'}
                    </button>
                  </td>
                  <td style={{ padding: 12 }}>
                    <button onClick={() => deleteRegla(regla)}
                      style={{ border: '1px solid #fecaca', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 800, color: '#991b1b', background: '#fef2f2', cursor: 'pointer' }}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: isDark ? '#e2e8f0' : '#0F2A3F', textTransform: 'uppercase' }}>Alertas generadas</h3>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
          <input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} />
          Solo pendientes
        </label>
      </div>

      <div style={{ borderRadius: 12, border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.08)'}`, background: isDark ? '#1e293b' : 'white', overflow: 'hidden' }}>
        {generadas.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Sin alertas generadas.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {generadas.map(alerta => (
                <tr key={alerta.id_alerta} style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}` }}>
                  <td style={{ padding: 12, color: isDark ? '#e2e8f0' : '#0F2A3F' }}>
                    <div>{alerta.mensaje}</div>
                    {!!alerta.elementos_afectados?.length && (
                      <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {alerta.elementos_afectados.map((el, i) => (
                          <li key={i} style={{ fontSize: 11, color: '#64748b' }}>
                            {el.url ? (
                              <a href={el.url} target="_blank" rel="noopener noreferrer" style={{ color: '#0D9488', fontWeight: 700, textDecoration: 'none' }}>
                                {el.titulo}
                              </a>
                            ) : (
                              <span style={{ fontWeight: 700 }}>{el.titulo}</span>
                            )}
                            {el.detalle && <span> · {el.detalle}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td style={{ padding: 12, color: '#94a3b8' }}>{new Date(alerta.fecha_generada).toLocaleString('es-PE')}</td>
                  <td style={{ padding: 12 }}>
                    {alerta.atendida ? (
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#166534' }}>Atendida</span>
                    ) : (
                      <button onClick={() => atenderAlerta(alerta)}
                        style={{ border: '1px solid #bfdbfe', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', cursor: 'pointer' }}>
                        Marcar atendida
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AlertasView;
