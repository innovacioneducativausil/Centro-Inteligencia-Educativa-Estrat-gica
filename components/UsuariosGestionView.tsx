import React, { useCallback, useEffect, useState } from 'react';
import { ThemeColors } from '../types';

interface UsuariosGestionViewProps {
  themeColors: ThemeColors;
  onVolver?: () => void;
}

interface UserRow {
  id: string;
  nombre: string;
  nombreCorto: string;
  correo: string;
  rol: string;
  activo: boolean;
  ultimoAcceso: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  gestionable: boolean;
  modulosPermitidos: string[];
}

//----------------OBS-01 / TI-02----------------
const ROLES = ['usuario', 'lector', 'analista', 'editor'];
const EDIT_ROLES = ['admin', ...ROLES];
const MODULES = [
  { key: 'inicio', label: 'Inicio' },
  { key: 'radar', label: 'Radar' },
  { key: 'empleabilidad', label: 'Empleo' },
  { key: 'impactos', label: 'Impactos' },
  { key: 'curricular', label: 'Curricular' },
  { key: 'mercadoLaboral', label: 'Mercado' },
  { key: 'informes', label: 'Informes' },
  { key: 'gestion', label: 'Gestion' },
];

const EMPTY = {
  nombre: '',
  nombreCorto: '',
  correo: '',
  rol: 'usuario',
  password: '',
};

async function requestJson(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } catch (err) {
    await new Promise(resolve => window.setTimeout(resolve, 900));
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      return { res, data };
    } catch {
      throw new Error('No se pudo conectar con la API. Espera unos segundos y vuelve a guardar.');
    }
  }
}

const UsuariosGestionView: React.FC<UsuariosGestionViewProps> = ({ themeColors, onVolver }) => {
  const isDark = themeColors.bg.includes('950') || themeColors.bg.includes('slate-900');
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [rol, setRol] = useState('');
  const [estado, setEstado] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (rol) params.set('rol', rol);
      if (estado) params.set('estado', estado);
      const { res, data } = await requestJson(`/api/admin/usuarios?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(data.error || 'Error al cargar usuarios.');
      setRows(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar usuarios.');
    } finally {
      setLoading(false);
    }
  }, [q, rol, estado]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  //----------------OBS-01 / TI-02----------------
  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    setTempPassword(null);
    try {
      const { res, data } = await requestJson('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el usuario.');
      setForm(EMPTY);
      setSaveMessage({ type: 'ok', text: 'Usuario creado y guardado en la BD.' });
      await fetchUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear el usuario.';
      setError(message);
      setSaveMessage({ type: 'error', text: message });
    } finally {
      setSaving(false);
    }
  };

  //----------------OBS-01 / TI-02----------------
  const updateUser = async (user: UserRow, changes: Partial<UserRow>) => {
    setError(null);
    setSaveMessage(null);
    setSavingUserId(user.id);
    try {
      const next = { ...user, ...changes };
      const { res, data } = await requestJson(`/api/admin/usuarios/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          nombre: next.nombre,
          nombreCorto: next.nombreCorto,
          rol: next.rol,
          activo: next.activo,
          modulosPermitidos: next.modulosPermitidos,
        }),
      });
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar.');
      setRows(prev => prev.map(r => r.id === user.id ? data.user : r));
      setSaveMessage({ type: 'ok', text: `Cambios guardados en la BD para ${data.user.correo}.` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar.';
      setError(message);
      setSaveMessage({ type: 'error', text: message });
    } finally {
      setSavingUserId(null);
    }
  };

  //----------------TI-53 / OBS-01----------------
  const resetPassword = async (user: UserRow) => {
    setTempPassword(null);
    setError(null);
    setSaveMessage(null);
    try {
      const { res, data } = await requestJson(`/api/admin/usuarios/${user.id}/reset-password`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(data.error || 'No se pudo resetear.');
      setTempPassword(`${user.correo}: ${data.tempPassword}`);
      setSaveMessage({ type: 'ok', text: `Contrasena temporal guardada para ${user.correo}.` });
      await fetchUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo resetear.';
      setError(message);
      setSaveMessage({ type: 'error', text: message });
    }
  };

  //----------------OBS-01 / TI-02----------------
  const toggleModule = (user: UserRow, moduleKey: string) => {
    if (!user.gestionable) return;
    setRows(prev => prev.map(row => {
      if (row.id !== user.id) return row;
      const current = new Set(row.modulosPermitidos || []);
      if (current.has(moduleKey)) current.delete(moduleKey);
      else current.add(moduleKey);
      if (current.size === 0) current.add('inicio');
      return { ...row, modulosPermitidos: [...current] };
    }));
  };

  const inputCls = `px-3 py-2 text-xs rounded-lg border outline-none ${
    isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'
  }`;

  return (
    <div style={{ padding: '32px 32px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: isDark ? '#e2e8f0' : '#0F2A3F', marginBottom: 4 }}>
            Usuarios y Accesos
          </h2>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>
            Gestion de usuarios y accesos. Los cambios quedan guardados en la BD actual y auditados en Monitor.
          </p>
        </div>
        {onVolver && (
          <button type="button" onClick={onVolver}
            style={{ border: '1px solid #cbd5e1', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#e2e8f0' : '#334155', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', height: 34 }}>
            Volver a Gestion
          </button>
        )}
      </div>

      <form onSubmit={createUser}
        style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr 1.3fr .7fr .9fr auto', gap: 10, padding: 14, borderRadius: 12, background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.07)'}`, marginBottom: 16 }}>
        <input className={inputCls} placeholder="Nombre completo" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
        <input className={inputCls} placeholder="Nombre corto" value={form.nombreCorto} onChange={e => setForm({ ...form, nombreCorto: e.target.value })} />
        <input className={inputCls} placeholder="correo@usil.edu.pe" value={form.correo} onChange={e => setForm({ ...form, correo: e.target.value })} />
        <select className={inputCls} value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <input className={inputCls} placeholder="Temporal123!" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        <button disabled={saving} style={{ border: 'none', borderRadius: 8, padding: '0 14px', background: '#0036DC', color: '#fff', fontSize: 12, fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}>
          {saving ? 'Guardando' : 'Crear'}
        </button>
      </form>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <input className={inputCls} placeholder="Buscar usuario" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <select className={inputCls} value={rol} onChange={e => setRol(e.target.value)}>
          <option value="">Todos los roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          <option value="admin">admin</option>
        </select>
        <select className={inputCls} value={estado} onChange={e => setEstado(e.target.value)}>
          <option value="">Todos</option>
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
        </select>
        <button onClick={fetchUsers} style={{ border: 'none', borderRadius: 8, padding: '0 14px', background: '#0D9488', color: '#fff', fontSize: 12, fontWeight: 800 }}>
          Actualizar
        </button>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{error}</div>}
      {saveMessage && (
        <div style={{
          color: saveMessage.type === 'ok' ? '#166534' : '#991b1b',
          background: saveMessage.type === 'ok' ? '#dcfce7' : '#fee2e2',
          border: `1px solid ${saveMessage.type === 'ok' ? '#86efac' : '#fecaca'}`,
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: 12,
          marginBottom: 12,
          fontWeight: 700,
        }}>
          {saveMessage.text}
        </div>
      )}
      {tempPassword && (
        <div style={{ color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 12 }}>
          Contrasena temporal generada: <strong>{tempPassword}</strong>
        </div>
      )}

      <div style={{ borderRadius: 12, border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,63,0.08)'}`, background: isDark ? '#1e293b' : 'white', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Cargando usuarios...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9' }}>
                  {['Usuario', 'Correo', 'Rol', 'Estado', 'Ultimo acceso', 'Modulos', 'Seguridad', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(user => (
                  <tr key={user.id} style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}` }}>
                    <td style={{ padding: 12 }}>
                      <input className={inputCls} disabled={!user.gestionable} value={user.nombre} onChange={e => setRows(prev => prev.map(r => r.id === user.id ? { ...r, nombre: e.target.value } : r))} />
                    </td>
                    <td style={{ padding: 12, color: isDark ? '#cbd5e1' : '#334155', fontWeight: 600 }}>{user.correo}</td>
                    <td style={{ padding: 12 }}>
                      <select className={inputCls} disabled={!user.gestionable} value={user.rol} onChange={e => updateUser(user, { rol: e.target.value })}>
                        {EDIT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: 12 }}>
                      <button disabled={!user.gestionable} onClick={() => updateUser(user, { activo: !user.activo })}
                        style={{ border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 800, background: user.activo ? '#dcfce7' : '#fee2e2', color: user.activo ? '#166534' : '#991b1b', cursor: user.gestionable ? 'pointer' : 'default' }}>
                        {user.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td style={{ padding: 12, color: '#94a3b8' }}>{user.ultimoAcceso ? new Date(user.ultimoAcceso).toLocaleString('es-PE') : '-'}</td>
                    <td style={{ padding: 12, minWidth: 320 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {MODULES.map(module => {
                          const checked = (user.modulosPermitidos || []).includes(module.key);
                          const disabled = !user.gestionable || (module.key === 'gestion' && user.rol !== 'admin');
                          return (
                            <label key={module.key}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                border: `1px solid ${checked ? '#93c5fd' : '#e2e8f0'}`,
                                borderRadius: 999,
                                padding: '4px 8px',
                                fontSize: 10,
                                fontWeight: 800,
                                color: checked ? '#1d4ed8' : '#64748b',
                                background: checked ? '#eff6ff' : isDark ? '#0f172a' : '#fff',
                                opacity: disabled ? 0.55 : 1,
                                cursor: disabled ? 'default' : 'pointer',
                              }}>
                              <input
                                type="checkbox"
                                disabled={disabled}
                                checked={checked}
                                onChange={() => toggleModule(user, module.key)}
                                style={{ accentColor: '#0036DC' }}
                              />
                              {module.label}
                            </label>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ padding: 12, color: '#94a3b8' }}>
                      {user.lockedUntil ? 'Bloqueado' : `${user.failedLoginAttempts} intentos fallidos`}
                    </td>
                    <td style={{ padding: 12, display: 'flex', gap: 8 }}>
                      <button disabled={!user.gestionable || savingUserId === user.id} onClick={() => updateUser(user, {})}
                        style={{ border: '1px solid #bfdbfe', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', cursor: user.gestionable && savingUserId !== user.id ? 'pointer' : 'default' }}>
                        {savingUserId === user.id ? 'Guardando' : 'Guardar'}
                      </button>
                      <button disabled={!user.gestionable} onClick={() => resetPassword(user)}
                        style={{ border: '1px solid #fed7aa', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 800, color: '#9a3412', background: '#fff7ed', cursor: user.gestionable ? 'pointer' : 'default' }}>
                        Reset
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

export default UsuariosGestionView;
