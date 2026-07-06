import React, { useCallback, useEffect, useState } from 'react';
import { ThemeColors } from '../types';

interface GestionEmpleoViewProps {
  themeColors: ThemeColors;
  onVolver?: () => void;
}

interface InformeRow {
  id: number;
  nombre: string;
  anio: number;
  unidad: string;
  facultad: string;
  url_descarga: string | null;
  tipo_acceso: 'descarga' | 'sharepoint';
  activo: number;
}

const EMPTY = { nombre: '', anio: new Date().getFullYear(), unidad: '', facultad: '', urlDescarga: '', tipoAcceso: 'descarga' as const };

async function requestJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

//----------------reorg Gestion (Empleo)----------------
const GestionEmpleoView: React.FC<GestionEmpleoViewProps> = ({ themeColors, onVolver }) => {
  const isDark = themeColors.bg.includes('950') || themeColors.bg.includes('slate-900');
  const [rows, setRows] = useState<InformeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { res, data } = await requestJson('/api/empleabilidad/informes/admin', { credentials: 'include' });
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los informes.');
      setRows(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar informes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const resetForm = () => { setForm(EMPTY); setEditId(null); };

  const startEdit = (row: InformeRow) => {
    setEditId(row.id);
    setForm({
      nombre: row.nombre,
      anio: row.anio,
      unidad: row.unidad,
      facultad: row.facultad,
      urlDescarga: row.url_descarga || '',
      tipoAcceso: row.tipo_acceso,
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const url = editId ? `/api/empleabilidad/informes/${editId}` : '/api/empleabilidad/informes';
      const { res, data } = await requestJson(url, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el informe.');
      setMessage(editId ? 'Informe actualizado.' : 'Informe creado.');
      resetForm();
      await fetchRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el informe.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (row: InformeRow) => {
    setError(null);
    try {
      const { res, data } = await requestJson(`/api/empleabilidad/informes/${row.id}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ activo: !row.activo }),
      });
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el estado.');
      await fetchRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado.');
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
            Empleo — Informes Descargables
          </h2>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>
            Administra los informes que aparecen en Empleabilidad → Descarga de informes. La carga masiva de datos de egresados se hace desde el propio módulo Empleabilidad.
          </p>
        </div>
        {onVolver && (
          <button type="button" onClick={onVolver}
            style={{ border: '1px solid #cbd5e1', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#e2e8f0' : '#334155', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', height: 34 }}>
            Volver a Gestion
          </button>
        )}
      </div>

      <form onSubmit={submit}
        style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr .8fr .8fr 1.2fr .8fr auto', gap: 10, padding: 14, borderRadius: 12, background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.07)'}`, marginBottom: 16 }}>
        <input className={inputCls} placeholder="Nombre del informe" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
        <input className={inputCls} type="number" placeholder="Año" value={form.anio} onChange={e => setForm({ ...form, anio: Number(e.target.value) })} />
        <input className={inputCls} placeholder="Unidad" value={form.unidad} onChange={e => setForm({ ...form, unidad: e.target.value })} />
        <input className={inputCls} placeholder="Facultad" value={form.facultad} onChange={e => setForm({ ...form, facultad: e.target.value })} />
        <input className={inputCls} placeholder="URL de descarga" value={form.urlDescarga} onChange={e => setForm({ ...form, urlDescarga: e.target.value })} />
        <select className={inputCls} value={form.tipoAcceso} onChange={e => setForm({ ...form, tipoAcceso: e.target.value as any })}>
          <option value="descarga">Descarga</option>
          <option value="sharepoint">SharePoint</option>
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          <button disabled={saving} style={{ border: 'none', borderRadius: 8, padding: '0 14px', background: '#0036DC', color: '#fff', fontSize: 12, fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}>
            {saving ? 'Guardando' : editId ? 'Guardar' : 'Crear'}
          </button>
          {editId && (
            <button type="button" onClick={resetForm} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '0 10px', background: 'none', fontSize: 12, fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{error}</div>}
      {message && <div style={{ color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 12, fontWeight: 700 }}>{message}</div>}

      <div style={{ borderRadius: 12, border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.08)'}`, background: isDark ? '#1e293b' : 'white', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Cargando...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Sin informes registrados.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9' }}>
                  {['Nombre', 'Año', 'Unidad', 'Facultad', 'Acceso', 'Estado', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}` }}>
                    <td style={{ padding: 12, fontWeight: 700, color: isDark ? '#e2e8f0' : '#0F2A3F' }}>{row.nombre}</td>
                    <td style={{ padding: 12, color: '#94a3b8' }}>{row.anio}</td>
                    <td style={{ padding: 12, color: '#94a3b8' }}>{row.unidad}</td>
                    <td style={{ padding: 12, color: '#94a3b8' }}>{row.facultad}</td>
                    <td style={{ padding: 12, color: '#94a3b8' }}>{row.tipo_acceso}</td>
                    <td style={{ padding: 12 }}>
                      <button onClick={() => toggleActivo(row)}
                        style={{ border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 800, background: row.activo ? '#dcfce7' : '#fee2e2', color: row.activo ? '#166534' : '#991b1b', cursor: 'pointer' }}>
                        {row.activo ? 'Activo' : 'Archivado'}
                      </button>
                    </td>
                    <td style={{ padding: 12 }}>
                      <button onClick={() => startEdit(row)}
                        style={{ border: '1px solid #bfdbfe', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', cursor: 'pointer' }}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default GestionEmpleoView;
