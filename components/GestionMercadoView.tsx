import React, { useCallback, useEffect, useState } from 'react';
import { ThemeColors } from '../types';

interface GestionMercadoViewProps {
  themeColors: ThemeColors;
  onVolver?: () => void;
}

interface InformeRow {
  id_informe: number;
  nombre_facultad: string;
  nombre_carrera: string;
  periodo: string;
  titulo_header: string | null;
  activo: number;
}

interface MetodologiaRow {
  id_metodologia: number;
  orden: number;
  titulo: string;
  descripcion: string | null;
  activo: number;
}

const EMPTY_INFORME = { nombreFacultad: '', nombreCarrera: '', periodo: '', tituloHeader: '', descripcion: '' };
const EMPTY_PASO = { orden: 1, titulo: '', descripcion: '' };

async function requestJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

//----------------reorg Gestion (Mercado)----------------
const GestionMercadoView: React.FC<GestionMercadoViewProps> = ({ themeColors, onVolver }) => {
  const isDark = themeColors.bg.includes('950') || themeColors.bg.includes('slate-900');
  const [informes, setInformes] = useState<InformeRow[]>([]);
  const [pasos, setPasos] = useState<MetodologiaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [informeForm, setInformeForm] = useState(EMPTY_INFORME);
  const [informeEditId, setInformeEditId] = useState<number | null>(null);
  const [pasoForm, setPasoForm] = useState(EMPTY_PASO);
  const [pasoEditId, setPasoEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [informesRes, pasosRes] = await Promise.all([
        requestJson('/api/mercado-laboral/admin/informes', { credentials: 'include' }),
        requestJson('/api/mercado-laboral/admin/metodologia', { credentials: 'include' }),
      ]);
      if (!informesRes.res.ok) throw new Error('No se pudieron cargar los informes.');
      if (!pasosRes.res.ok) throw new Error('No se pudo cargar la metodologia.');
      setInformes(informesRes.data.data || []);
      setPasos(pasosRes.data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos de mercado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const submitInforme = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const url = informeEditId ? `/api/mercado-laboral/admin/informes/${informeEditId}` : '/api/mercado-laboral/admin/informes';
      const { res, data } = await requestJson(url, {
        method: informeEditId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(informeForm),
      });
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el informe.');
      setMessage(informeEditId ? 'Informe actualizado.' : 'Informe creado.');
      setInformeForm(EMPTY_INFORME);
      setInformeEditId(null);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el informe.');
    } finally {
      setSaving(false);
    }
  };

  const toggleInforme = async (row: InformeRow) => {
    setError(null);
    try {
      const { res, data } = await requestJson(`/api/mercado-laboral/admin/informes/${row.id_informe}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ activo: !row.activo }),
      });
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el estado.');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado.');
    }
  };

  const submitPaso = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const url = pasoEditId ? `/api/mercado-laboral/admin/metodologia/${pasoEditId}` : '/api/mercado-laboral/admin/metodologia';
      const { res, data } = await requestJson(url, {
        method: pasoEditId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(pasoForm),
      });
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el paso.');
      setMessage('Metodologia guardada.');
      setPasoForm(EMPTY_PASO);
      setPasoEditId(null);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el paso.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = `px-3 py-2 text-xs rounded-lg border outline-none ${
    isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'
  }`;

  return (
    <div style={{ padding: '32px 32px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: isDark ? '#e2e8f0' : '#0F2A3F', marginBottom: 4 }}>
            Mercado Laboral
          </h2>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>
            Gestiona los informes de mercado (datos generales) y los pasos de "Como se elaboraron". El detalle de puestos, habilidades, herramientas, tendencias y recomendaciones de cada informe se administra en un siguiente avance.
          </p>
        </div>
        {onVolver && (
          <button type="button" onClick={onVolver}
            style={{ border: '1px solid #cbd5e1', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#e2e8f0' : '#334155', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', height: 34, flexShrink: 0 }}>
            Volver a Gestion
          </button>
        )}
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{error}</div>}
      {message && <div style={{ color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 12, fontWeight: 700 }}>{message}</div>}

      <h3 style={{ fontSize: 13, fontWeight: 800, color: isDark ? '#e2e8f0' : '#0F2A3F', textTransform: 'uppercase', marginBottom: 8 }}>Informes por carrera</h3>
      <form onSubmit={submitInforme}
        style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr .8fr 1.2fr auto', gap: 10, padding: 14, borderRadius: 12, background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.07)'}`, marginBottom: 16 }}>
        <input className={inputCls} placeholder="Facultad" value={informeForm.nombreFacultad} onChange={e => setInformeForm({ ...informeForm, nombreFacultad: e.target.value })} />
        <input className={inputCls} placeholder="Carrera" value={informeForm.nombreCarrera} onChange={e => setInformeForm({ ...informeForm, nombreCarrera: e.target.value })} />
        <input className={inputCls} placeholder="Periodo (ej. 2026-I)" value={informeForm.periodo} onChange={e => setInformeForm({ ...informeForm, periodo: e.target.value })} />
        <input className={inputCls} placeholder="Titulo del informe" value={informeForm.tituloHeader} onChange={e => setInformeForm({ ...informeForm, tituloHeader: e.target.value })} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button disabled={saving} style={{ border: 'none', borderRadius: 8, padding: '0 14px', background: '#0036DC', color: '#fff', fontSize: 12, fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}>
            {saving ? 'Guardando' : informeEditId ? 'Guardar' : 'Crear'}
          </button>
          {informeEditId && (
            <button type="button" onClick={() => { setInformeForm(EMPTY_INFORME); setInformeEditId(null); }} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '0 10px', background: 'none', fontSize: 12, fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div style={{ borderRadius: 12, border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.08)'}`, background: isDark ? '#1e293b' : 'white', overflow: 'hidden', marginBottom: 28 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Cargando...</div>
        ) : informes.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Sin informes registrados.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {informes.map(row => (
                <tr key={row.id_informe} style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}` }}>
                  <td style={{ padding: 12, color: isDark ? '#e2e8f0' : '#0F2A3F' }}>{row.nombre_facultad}</td>
                  <td style={{ padding: 12, fontWeight: 700, color: isDark ? '#e2e8f0' : '#0F2A3F' }}>{row.nombre_carrera}</td>
                  <td style={{ padding: 12, color: '#94a3b8' }}>{row.periodo}</td>
                  <td style={{ padding: 12 }}>
                    <button onClick={() => toggleInforme(row)}
                      style={{ border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 800, background: row.activo ? '#dcfce7' : '#fee2e2', color: row.activo ? '#166534' : '#991b1b', cursor: 'pointer' }}>
                      {row.activo ? 'Activo' : 'Archivado'}
                    </button>
                  </td>
                  <td style={{ padding: 12 }}>
                    <button onClick={() => { setInformeEditId(row.id_informe); setInformeForm({ nombreFacultad: row.nombre_facultad, nombreCarrera: row.nombre_carrera, periodo: row.periodo, tituloHeader: row.titulo_header || '', descripcion: '' }); }}
                      style={{ border: '1px solid #bfdbfe', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', cursor: 'pointer' }}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 800, color: isDark ? '#e2e8f0' : '#0F2A3F', textTransform: 'uppercase', marginBottom: 8 }}>Como se elaboraron (metodologia)</h3>
      <form onSubmit={submitPaso}
        style={{ display: 'grid', gridTemplateColumns: '.5fr 1.4fr 2fr auto', gap: 10, padding: 14, borderRadius: 12, background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.07)'}`, marginBottom: 16 }}>
        <input className={inputCls} type="number" placeholder="Orden" value={pasoForm.orden} onChange={e => setPasoForm({ ...pasoForm, orden: Number(e.target.value) })} />
        <input className={inputCls} placeholder="Titulo del paso" value={pasoForm.titulo} onChange={e => setPasoForm({ ...pasoForm, titulo: e.target.value })} />
        <input className={inputCls} placeholder="Descripcion" value={pasoForm.descripcion} onChange={e => setPasoForm({ ...pasoForm, descripcion: e.target.value })} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button disabled={saving} style={{ border: 'none', borderRadius: 8, padding: '0 14px', background: '#0036DC', color: '#fff', fontSize: 12, fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}>
            {saving ? 'Guardando' : pasoEditId ? 'Guardar' : 'Crear'}
          </button>
          {pasoEditId && (
            <button type="button" onClick={() => { setPasoForm(EMPTY_PASO); setPasoEditId(null); }} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '0 10px', background: 'none', fontSize: 12, fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div style={{ borderRadius: 12, border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.08)'}`, background: isDark ? '#1e293b' : 'white', overflow: 'hidden' }}>
        {pasos.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Sin pasos registrados.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {pasos.map(row => (
                <tr key={row.id_metodologia} style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}` }}>
                  <td style={{ padding: 12, color: '#94a3b8', width: 40 }}>{row.orden}</td>
                  <td style={{ padding: 12, fontWeight: 700, color: isDark ? '#e2e8f0' : '#0F2A3F' }}>{row.titulo}</td>
                  <td style={{ padding: 12, color: '#94a3b8' }}>{row.descripcion}</td>
                  <td style={{ padding: 12 }}>
                    <button onClick={() => { setPasoEditId(row.id_metodologia); setPasoForm({ orden: row.orden, titulo: row.titulo, descripcion: row.descripcion || '' }); }}
                      style={{ border: '1px solid #bfdbfe', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', cursor: 'pointer' }}>
                      Editar
                    </button>
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

export default GestionMercadoView;
