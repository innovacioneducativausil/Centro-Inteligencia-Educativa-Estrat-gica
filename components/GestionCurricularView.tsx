import React, { useCallback, useEffect, useState } from 'react';
import { ThemeColors } from '../types';

interface GestionCurricularViewProps {
  themeColors: ThemeColors;
  onVolver?: () => void;
}

interface SilaboRow {
  id_silabo: string;
  id_curso: number;
  titulo: string;
  url_archivo: string | null;
  contenido: string | null;
  activo: number;
  nombre_curso: string;
  codigo_curso: string;
}

interface CursoOption {
  id_curso: number;
  nombre_curso: string;
  codigo_curso: string;
}

const EMPTY = { idCurso: '', titulo: '', urlArchivo: '', contenido: '' };

async function requestJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

//----------------reorg Gestion (Curricular)----------------
const GestionCurricularView: React.FC<GestionCurricularViewProps> = ({ themeColors, onVolver }) => {
  const isDark = themeColors.bg.includes('950') || themeColors.bg.includes('slate-900');
  const [rows, setRows] = useState<SilaboRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cursoQuery, setCursoQuery] = useState('');
  const [cursoOptions, setCursoOptions] = useState<CursoOption[]>([]);
  const [cursoLabel, setCursoLabel] = useState('');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { res, data } = await requestJson('/api/curricular/silabos', { credentials: 'include' });
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los silabos.');
      setRows(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar silabos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  useEffect(() => {
    if (!cursoQuery.trim()) { setCursoOptions([]); return; }
    const t = setTimeout(() => {
      requestJson(`/api/curricular/cursos-buscar?q=${encodeURIComponent(cursoQuery)}`, { credentials: 'include' })
        .then(({ res, data }) => { if (res.ok) setCursoOptions(data.data || []); })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [cursoQuery]);

  const resetForm = () => { setForm(EMPTY); setEditId(null); setCursoLabel(''); setCursoQuery(''); };

  const startEdit = (row: SilaboRow) => {
    setEditId(row.id_silabo);
    setForm({ idCurso: String(row.id_curso), titulo: row.titulo, urlArchivo: row.url_archivo || '', contenido: row.contenido || '' });
    setCursoLabel(`${row.codigo_curso} — ${row.nombre_curso}`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const url = editId ? `/api/curricular/silabos/${editId}` : '/api/curricular/silabos';
      const { res, data } = await requestJson(url, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el silabo.');
      setMessage(editId ? 'Silabo actualizado.' : 'Silabo creado.');
      resetForm();
      await fetchRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el silabo.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (row: SilaboRow) => {
    setError(null);
    try {
      const { res, data } = await requestJson(`/api/curricular/silabos/${row.id_silabo}/estado`, {
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
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: isDark ? '#e2e8f0' : '#0F2A3F', marginBottom: 4 }}>
            Curricular — Mapa de Silabos
          </h2>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>
            El Mapa Curricular se importa/edita directamente en el modulo Curricular. Benchmarking e Impacto Curricular ya tienen edicion propia dentro de sus vistas. Aqui se administran los silabos por curso.
          </p>
        </div>
        {onVolver && (
          <button type="button" onClick={onVolver}
            style={{ border: '1px solid #cbd5e1', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#e2e8f0' : '#334155', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', height: 34, flexShrink: 0 }}>
            Volver a Gestion
          </button>
        )}
      </div>

      <form onSubmit={submit}
        style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1.2fr 1.6fr auto', gap: 10, padding: 14, borderRadius: 12, background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.07)'}`, marginBottom: 16, position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <input className={inputCls} style={{ width: '100%' }} placeholder="Buscar curso..." value={cursoLabel || cursoQuery}
            onChange={e => { setCursoLabel(''); setCursoQuery(e.target.value); setForm({ ...form, idCurso: '' }); }} />
          {cursoOptions.length > 0 && !form.idCurso && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: isDark ? '#1e293b' : 'white', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, borderRadius: 8, marginTop: 2, maxHeight: 180, overflowY: 'auto' }}>
              {cursoOptions.map(c => (
                <div key={c.id_curso} onClick={() => { setForm({ ...form, idCurso: String(c.id_curso) }); setCursoLabel(`${c.codigo_curso} — ${c.nombre_curso}`); setCursoOptions([]); }}
                  style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: isDark ? '#e2e8f0' : '#1e293b' }}>
                  {c.codigo_curso} — {c.nombre_curso}
                </div>
              ))}
            </div>
          )}
        </div>
        <input className={inputCls} placeholder="Titulo del silabo" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
        <input className={inputCls} placeholder="URL del archivo" value={form.urlArchivo} onChange={e => setForm({ ...form, urlArchivo: e.target.value })} />
        <input className={inputCls} placeholder="Contenido / resumen" value={form.contenido} onChange={e => setForm({ ...form, contenido: e.target.value })} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button disabled={saving || !form.idCurso} style={{ border: 'none', borderRadius: 8, padding: '0 14px', background: '#0036DC', color: '#fff', fontSize: 12, fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}>
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
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Sin silabos registrados.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9' }}>
                  {['Curso', 'Titulo', 'Archivo', 'Estado', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id_silabo} style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}` }}>
                    <td style={{ padding: 12, color: isDark ? '#e2e8f0' : '#0F2A3F' }}>{row.codigo_curso} — {row.nombre_curso}</td>
                    <td style={{ padding: 12, fontWeight: 700, color: isDark ? '#e2e8f0' : '#0F2A3F' }}>{row.titulo}</td>
                    <td style={{ padding: 12, color: '#94a3b8' }}>
                      {row.url_archivo ? <a href={row.url_archivo} target="_blank" rel="noreferrer" style={{ color: '#1d4ed8' }}>Ver archivo</a> : '-'}
                    </td>
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

export default GestionCurricularView;
