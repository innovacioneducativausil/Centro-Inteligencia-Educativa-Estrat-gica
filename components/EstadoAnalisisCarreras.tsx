import React, { useEffect, useState } from 'react';

interface FilaCarrera {
  id_carrera: number;
  carrera: string;
  malla: string;
  cursos: number;
  analizados: number;
  pct_analizado: number;
  alineado: number;
  riesgo_parcial: number;
  obsolescente: number;
  oportunidad: number;
  con_evidencia_general: number;
}

interface Props {
  isDark: boolean;
  card: string;
  text: string;
  muted: string;
  border: string;
}

const ESTADOS = [
  { key: 'alineado', label: 'Alineado', color: '#2fb86b' },
  { key: 'riesgo_parcial', label: 'Riesgo parcial', color: '#f29a2e' },
  { key: 'obsolescente', label: 'Obsolescente', color: '#d6342c' },
  { key: 'oportunidad', label: 'Oportunidad', color: '#3b82f6' },
] as const;

/**
 * Resumen del analisis del mapa de estados por carrera (vigente). Una carrera cuenta
 * como "con motor actual" si tiene algun estado distinto de Alineado: el motor anterior
 * marcaba todo como Alineado, asi que 100 % alineado = dato antiguo sin validar.
 */
const EstadoAnalisisCarreras: React.FC<Props> = ({ isDark, card, text, muted, border }) => {
  const [filas, setFilas] = useState<FilaCarrera[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetch('/api/curricular/estado-carreras', { credentials: 'include' })
      .then(async r => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error || `Error ${r.status}`);
        return body;
      })
      .then(rows => { if (vivo) setFilas(Array.isArray(rows) ? rows : []); })
      .catch(e => { if (vivo) setError(e.message || 'No se pudo cargar el estado.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const esMotorActual = (f: FilaCarrera) => f.riesgo_parcial + f.obsolescente + f.oportunidad > 0;
  const actuales = filas.filter(esMotorActual);
  const pendientes = filas.filter(f => !esMotorActual(f));
  const suma = (k: keyof FilaCarrera) => actuales.reduce((a, f) => a + Number(f[k] || 0), 0);
  const totalAnalizados = suma('analizados');

  const th: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: muted, letterSpacing: '0.04em', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', fontSize: 13, color: text, whiteSpace: 'nowrap' };

  const fila = (f: FilaCarrera, viejo: boolean) => {
    const sin = f.cursos - f.analizados;
    return (
      <tr key={f.id_carrera} style={{ borderTop: `1px solid ${border}`, opacity: viejo ? 0.6 : 1 }}>
        <td style={{ ...td, textAlign: 'left', fontWeight: 600, whiteSpace: 'normal' }}>{f.carrera}</td>
        <td style={td}>{f.cursos}</td>
        <td style={td}>{f.analizados} <span style={{ color: muted, fontSize: 11 }}>({f.pct_analizado}%)</span></td>
        <td style={{ ...td, color: sin > 0 ? '#b45309' : '#2fb86b', fontWeight: 700 }}>{sin}</td>
        {ESTADOS.map(e => (
          <td key={e.key} style={{ ...td, color: viejo ? muted : e.color, fontWeight: 700 }}>{viejo ? '—' : f[e.key]}</td>
        ))}
      </tr>
    );
  };

  const cabecera = (
    <thead>
      <tr>
        <th style={{ ...th, textAlign: 'left' }}>Carrera</th>
        <th style={th}>Cursos</th>
        <th style={th}>Analizados</th>
        <th style={th} title="Cursos sin ninguna evidencia en Radar, Mercado o Benchmarking, o aún no procesados">Sin análisis</th>
        {ESTADOS.map(e => <th key={e.key} style={{ ...th, color: e.color }}>{e.label}</th>)}
      </tr>
    </thead>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 8, padding: '16px 18px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: text }}>Estado del análisis por carrera</div>
        <div style={{ fontSize: 12, color: muted, marginTop: 4, lineHeight: 1.5 }}>
          Malla vigente de cada carrera. &quot;Sin análisis&quot; son cursos que no tienen ninguna evidencia en Radar, Mercado o Benchmarking
          (el motor no inventa un estado sin material) o que todavía no se procesan. Las carreras en gris conservan datos del motor anterior
          (todo &quot;Alineado&quot;) y están en la cola de análisis.
        </div>
        {!cargando && !error && (
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 14 }}>
            <Resumen label="Carreras con motor actual" valor={`${actuales.length}/${filas.length}`} text={text} muted={muted} />
            <Resumen label="Cursos analizados" valor={String(totalAnalizados)} text={text} muted={muted} />
            {ESTADOS.map(e => (
              <Resumen key={e.key} label={e.label} color={e.color} text={text} muted={muted}
                valor={totalAnalizados ? `${suma(e.key)} · ${Math.round((suma(e.key) / totalAnalizados) * 100)}%` : '0'} />
            ))}
          </div>
        )}
      </div>

      {cargando && <div style={{ color: muted, fontSize: 13 }}>Cargando estado…</div>}
      {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      {!cargando && !error && (
        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 8, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            {cabecera}
            <tbody>
              {actuales.sort((a, b) => b.analizados - a.analizados).map(f => fila(f, false))}
              {pendientes.length > 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '10px 10px 4px', fontSize: 11, fontWeight: 700, color: muted, borderTop: `2px solid ${border}`, background: isDark ? 'rgba(148,163,184,0.06)' : '#f8fafc' }}>
                    EN COLA · datos del motor anterior, aún sin validar
                  </td>
                </tr>
              )}
              {pendientes.sort((a, b) => a.carrera.localeCompare(b.carrera)).map(f => fila(f, true))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Resumen: React.FC<{ label: string; valor: string; color?: string; text: string; muted: string }> = ({ label, valor, color, text, muted }) => (
  <div>
    <div style={{ fontSize: 11, color: muted, fontWeight: 700, letterSpacing: '0.04em' }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 800, color: color || text }}>{valor}</div>
  </div>
);

export default EstadoAnalisisCarreras;
