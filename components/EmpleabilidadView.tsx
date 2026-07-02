import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ThemeColors } from '../types';
import { logActividad } from '../services/actividadService';

interface EmpleabilidadViewProps {
  themeColors: ThemeColors;
  userRole?: string;
}


interface MapeoFila { columna: string; campo: string; tipo: string; }
interface PreviewData {
  format: 'wide' | 'tall';
  totalRows: number;

  years?: number[];
  yearCols?: Record<number, Record<string, string>>;
  fixedCols?: Record<string, string> | null;
  aiUsed?: boolean;
  mapeoResumen?: MapeoFila[];

  anioEncuesta?: number;
  trimestre?: string;
  colsDetected?: { key: string; columna: string }[];
  tallCols?: Record<string, string | null>;
  preview: { doc: string; nombre: string; carrera: string; facultad: string; programa: string }[];
}

function ImportModal({ onClose, accent, card, text, border }: {
  onClose: () => void; accent: string; card: string; text: string; border: string;
}) {
  const fileRef  = useRef<HTMLInputElement>(null);
  const [file,    setFile]    = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [result,      setResult]      = useState<{
    imported: number; skipped: number;
    errors: {fila:number;error:string}[];
    skipReasons?: Record<string,number>;
    skipDetails?: Record<string, { count: number; registros: {dni:string;nombre:string}[] }>;
  } | null>(null);
  const [expandedSkip, setExpandedSkip] = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [showMapeo,   setShowMapeo]   = useState(false);
  const [anioOverride,    setAnioOverride]    = useState<string>('');
  const [selYears,        setSelYears]        = useState<number[]>([]);
  const [importProgress,  setImportProgress]  = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval>>();

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true); setError(null); setPreview(null); setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch('/api/empleabilidad/preview', {
        method: 'POST', body: fd,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error al previsualizar');
      setPreview(data);
      if (data.format === 'wide' && data.years?.length) setSelYears(data.years);

      if (data.format === 'tall' && !data.anioEncuesta) {
        const m = file?.name?.match(/(20[2-9]\d)/);
        if (m) setAnioOverride(m[1]);
      } else if (data.format === 'tall' && data.anioEncuesta) {
        setAnioOverride(String(data.anioEncuesta));
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleImport = async () => {
    if (!file || !preview) return;
    setLoading(true); setError(null); setImportProgress(0);

    let pct = 0;
    progressRef.current = setInterval(() => {
      pct = pct < 80 ? pct + (80 - pct) * 0.04 : pct + (95 - pct) * 0.01;
      setImportProgress(Math.min(95, Math.round(pct)));
    }, 200);
    const fd = new FormData();
    fd.append('file', file);

    let endpoint: string;
    if (preview.format === 'tall') {
      const finalAnio = anioOverride;
      if (!finalAnio || !/^20\d{2}$/.test(finalAnio)) {
        setError('Ingresa el año de encuesta (ej: 2025) antes de importar.');
        clearInterval(progressRef.current);
        setLoading(false);
        return;
      }
      endpoint = '/api/empleabilidad/importar-tall';
      fd.append('fuente', `EXCEL_TALL_${finalAnio}`);
      fd.append('anioEncuesta', finalAnio);
      fd.append('trimestre',    preview.trimestre ?? 'ANUAL');
      if (preview.tallCols) fd.append('tallCols', JSON.stringify(preview.tallCols));
    } else {
      endpoint = '/api/empleabilidad/importar';

      const activeYears = selYears.length > 0 ? selYears : (preview.years ?? []);
      const filteredYearCols = preview.yearCols
        ? Object.fromEntries(Object.entries(preview.yearCols).filter(([yr]) => activeYears.includes(Number(yr))))
        : null;
      fd.append('fuente', `EXCEL_${activeYears.join('_')}`);
      if (filteredYearCols) fd.append('yearCols',  JSON.stringify(filteredYearCols));
      if (preview.fixedCols) fd.append('fixedCols', JSON.stringify(preview.fixedCols));
    }

    try {
      const r = await fetch(endpoint, {
        method: 'POST', body: fd,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error al importar');
      clearInterval(progressRef.current);
      setImportProgress(100);
      setResult(data);
    } catch (e: any) {
      clearInterval(progressRef.current);
      setImportProgress(0);
      setError(e.message);
    }
    finally { setLoading(false); }
  };

  const inputStyle: React.CSSProperties = {
    fontSize: 11, padding: '5px 8px', borderRadius: 6,
    border: `1px solid ${border}`, background: card, color: text,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: card, borderRadius: 16, padding: 28, width: 560, maxWidth: '95vw',
        border: `1px solid ${border}`, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>


        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: accent }}>Importar Excel de Empleabilidad</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: text, opacity: 0.6 }}>
              Formato ancho (multi-año): DNI · Q_2022.Ac Empl · Q_2023 · …  |  Formato vertical: DNI · Carrera · Ac Empl · EMPRENDEDOR
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, color: text, opacity: 0.5, lineHeight: 1 }}>✕</button>
        </div>


        {!result && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '1px', color: text, opacity: 0.5, display: 'block', marginBottom: 6 }}>
                Archivo Excel (.xlsx)
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input ref={fileRef} type="file" accept=".xlsx,.xls"
                  onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); setError(null); setAnioOverride(''); setSelYears([]); }}
                  style={{ display: 'none' }} />
                <button onClick={() => fileRef.current?.click()}
                  style={{ ...inputStyle, cursor: 'pointer', padding: '7px 14px', fontWeight: 600 }}>
                  Seleccionar archivo
                </button>
                {file && <span style={{ fontSize: 11, color: text, opacity: 0.7 }}>{file.name}</span>}
              </div>
            </div>

            {file && !preview && (
              <button onClick={handlePreview} disabled={loading}
                style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none',
                  background: accent, color: '#fff', fontWeight: 700, fontSize: 12,
                  cursor: loading ? 'wait' : 'pointer', marginBottom: 12 }}>
                {loading ? 'Analizando...' : 'Previsualizar archivo'}
              </button>
            )}
          </>
        )}


        {error && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8,
            padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#991B1B' }}>
            {error}
          </div>
        )}


        {preview && !result && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ background: accent + '20', borderRadius: 8, padding: '10px 16px', flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: accent }}>{preview.totalRows}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: text, opacity: 0.6 }}>EGRESADOS</div>
              </div>
              {preview.format === 'tall' ? (
                <>
                  <div style={{ background: '#10B98120', borderRadius: 8, padding: '10px 16px', flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', marginBottom: 4 }}>
                      AÑO DE ENCUESTA <span style={{ color: '#dc2626' }}>*</span>
                    </div>
                    <input
                      type="number" min="2020" max="2030" placeholder="ej: 2025"
                      value={anioOverride}
                      onChange={e => setAnioOverride(e.target.value)}
                      style={{ width: '100%', padding: '4px 6px', borderRadius: 4,
                        border: `1.5px solid ${anioOverride && /^20\d{2}$/.test(anioOverride) ? '#059669' : '#dc2626'}`,
                        background: card, color: text, fontSize: 16, fontWeight: 900 }}
                    />
                  </div>
                  <div style={{ background: '#0891b220', borderRadius: 8, padding: '10px 16px', flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#0891b2' }}>{preview.trimestre}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: text, opacity: 0.6 }}>TRIMESTRE</div>
                  </div>
                  <div style={{ background: '#7c3aed20', borderRadius: 8, padding: '10px 16px', flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: 16 }}>📋</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', textAlign: 'center' }}>Formato Vertical</div>
                  </div>
                </>
              ) : (
                <>

                  <div style={{ background: '#10B98112', borderRadius: 8, padding: '10px 14px', flex: 2, minWidth: 180 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px',
                      color: '#059669', marginBottom: 8 }}>
                      Selecciona los años a importar
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(preview.years ?? []).map(yr => {
                        const active = selYears.includes(yr);
                        return (
                          <button key={yr} onClick={() =>
                            setSelYears(active ? selYears.filter(y => y !== yr) : [...selYears, yr])
                          }
                            style={{ padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 800,
                              fontSize: 13, border: `2px solid ${active ? '#059669' : '#d1d5db'}`,
                              background: active ? '#059669' : 'transparent',
                              color: active ? '#fff' : text, transition: 'all .15s' }}>
                            {yr}
                          </button>
                        );
                      })}
                    </div>
                    {selYears.length === 0 && (
                      <div style={{ fontSize: 10, color: '#dc2626', marginTop: 5, fontWeight: 600 }}>
                        Selecciona al menos un año
                      </div>
                    )}
                  </div>
                  <div style={{ background: preview.aiUsed ? '#6366f120' : '#f0f0f0', borderRadius: 8, padding: '10px 16px', flex: 1, minWidth: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: 16 }}>{preview.aiUsed ? '🤖' : '🔍'}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: preview.aiUsed ? '#4f46e5' : '#888', textAlign: 'center' }}>
                      {preview.aiUsed ? 'Mapeado con IA' : 'Detección por palabras clave'}
                    </div>
                  </div>
                </>
              )}
            </div>


            {preview.format === 'tall' && (preview.colsDetected ?? []).length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <button onClick={() => setShowMapeo(m => !m)}
                  style={{ background: 'none', border: `1px solid ${border}`, borderRadius: 6, padding: '5px 12px',
                    fontSize: 11, fontWeight: 600, color: text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13 }}>{showMapeo ? '▾' : '▸'}</span>
                  Ver columnas detectadas ({(preview.colsDetected ?? []).length} mapeadas)
                </button>
                {showMapeo && (
                  <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto', borderRadius: 8, border: `1px solid ${border}` }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                      <thead>
                        <tr style={{ background: accent + '12', position: 'sticky', top: 0 }}>
                          {['Campo BD', 'Columna Excel'].map(h => (
                            <th key={h} style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 700, color: text, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(preview.colsDetected ?? []).map((r, i) => (
                          <tr key={i} style={{ borderTop: `1px solid ${border}` }}>
                            <td style={{ padding: '4px 10px', color: accent, fontWeight: 600 }}>{r.key}</td>
                            <td style={{ padding: '4px 10px', color: text }}>{r.columna}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {preview.format === 'wide' && (preview.mapeoResumen ?? []).length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <button onClick={() => setShowMapeo(m => !m)}
                  style={{ background: 'none', border: `1px solid ${border}`, borderRadius: 6, padding: '5px 12px',
                    fontSize: 11, fontWeight: 600, color: text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13 }}>{showMapeo ? '▾' : '▸'}</span>
                  Ver columnas detectadas ({(preview.mapeoResumen ?? []).filter(r => r.tipo !== 'ignorar').length} mapeadas
                  {(preview.mapeoResumen ?? []).filter(r => r.tipo === 'ignorar').length > 0
                    ? `, ${(preview.mapeoResumen ?? []).filter(r => r.tipo === 'ignorar').length} ignoradas` : ''})
                </button>
                {showMapeo && (
                  <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto', borderRadius: 8, border: `1px solid ${border}` }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                      <thead>
                        <tr style={{ background: accent + '12', position: 'sticky', top: 0 }}>
                          {['Columna Excel', 'Campo BD', 'Tipo'].map(h => (
                            <th key={h} style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 700,
                              color: text, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(preview.mapeoResumen ?? []).map((r, i) => (
                          <tr key={i} style={{ borderTop: `1px solid ${border}`,
                            opacity: r.tipo === 'ignorar' ? 0.45 : 1 }}>
                            <td style={{ padding: '4px 10px', color: text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={r.columna}>{r.columna}</td>
                            <td style={{ padding: '4px 10px', color: r.tipo === 'ignorar' ? '#888' : accent, fontWeight: 600 }}>{r.campo}</td>
                            <td style={{ padding: '4px 10px' }}>
                              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, fontWeight: 700,
                                background: r.tipo === 'fijo' ? '#dbeafe' : r.tipo === 'ignorar' ? '#f3f4f6' : '#d1fae5',
                                color: r.tipo === 'fijo' ? '#1d4ed8' : r.tipo === 'ignorar' ? '#9ca3af' : '#065f46' }}>
                                {r.tipo}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}


            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '1px', color: text, opacity: 0.5, marginBottom: 8 }}>
              Primeras 5 filas
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${border}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: accent + '15' }}>
                    {['DNI','Apellidos y Nombres','Carrera','Facultad','Programa'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700,
                        color: text, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${border}` }}>
                      <td style={{ padding: '5px 10px', color: text }}>{r.doc}</td>
                      <td style={{ padding: '5px 10px', color: text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</td>
                      <td style={{ padding: '5px 10px', color: text, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.carrera}</td>
                      <td style={{ padding: '5px 10px', color: text }}>{r.facultad}</td>
                      <td style={{ padding: '5px 10px', color: text }}>{normalizeProg(r.programa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>


            {loading && (
              <div style={{ marginTop: 14, marginBottom: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: text, opacity: 0.7 }}>
                    Procesando {preview.totalRows.toLocaleString()} registros…
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: accent }}>{importProgress}%</span>
                </div>
                <div style={{ background: 'rgba(128,128,128,0.15)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${importProgress}%`, height: '100%', borderRadius: 6,
                    background: importProgress === 100 ? '#22c55e' : accent,
                    transition: 'width 0.3s ease, background 0.5s ease' }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => { setPreview(null); setFile(null); }}
                style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${border}`,
                  background: 'transparent', color: text, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                Cancelar
              </button>
              {(() => {
                const needsAnio  = preview.format === 'tall' && !preview.anioEncuesta && !anioOverride;
                const noYears    = preview.format === 'wide' && selYears.length === 0;
                const disabled   = loading || needsAnio || noYears;
                const finalAnio  = anioOverride || preview.anioEncuesta;
                const label = loading ? 'Importando…'
                  : preview.format === 'tall'
                    ? `Confirmar importación (${preview.totalRows} egresados · ${finalAnio} ${preview.trimestre ?? ''})`
                    : `Confirmar importación — Años: ${selYears.sort().join(', ')} (${preview.totalRows} egresados)`;
                return (
                  <button onClick={handleImport} disabled={disabled}
                    title={needsAnio ? 'Ingresa el año de encuesta' : noYears ? 'Selecciona al menos un año' : undefined}
                    style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none',
                      background: disabled ? '#9ca3af' : accent, color: '#fff', fontWeight: 700, fontSize: 12,
                      cursor: loading ? 'wait' : disabled ? 'not-allowed' : 'pointer' }}>
                    {label}
                  </button>
                );
              })()}
            </div>
          </div>
        )}


        {result && (() => {
          const SKIP_LABELS: Record<string,{label:string;color:string;bg:string;border:string;icon:string}> = {
            sin_dni:                   { label: 'Sin DNI',                      color:'#92400E', bg:'#FEF3C7', border:'#FDE68A', icon:'⚠️' },
            sin_egresado:              { label: 'Egresado no resuelto',          color:'#991B1B', bg:'#FEE2E2', border:'#FCA5A5', icon:'❌' },
            sin_datos_encuesta:        { label: 'Sin datos de encuesta',         color:'#6B21A8', bg:'#F3E8FF', border:'#D8B4FE', icon:'📋' },
            sin_carrera_asignado_otro: { label: 'Sin carrera → asignado "OTRO"', color:'#1E40AF', bg:'#DBEAFE', border:'#93C5FD', icon:'ℹ️' },
          };
          const hasSkipDetails = result.skipDetails && Object.keys(result.skipDetails).length > 0;
          return (
            <div>

              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 36, marginBottom: 6 }}>{result.errors.length > 0 ? '⚠️' : '✅'}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: result.errors.length > 0 ? '#D97706' : '#059669' }}>
                  Importación completada
                </div>
              </div>


              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1, background: '#D1FAE5', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#059669' }}>{result.imported}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#065F46' }}>IMPORTADOS</div>
                </div>
                {result.skipped > 0 && (
                  <div style={{ flex: 1, background: '#FEF3C7', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#D97706' }}>{result.skipped}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#92400E' }}>OMITIDOS</div>
                  </div>
                )}
                {result.errors.length > 0 && (
                  <div style={{ flex: 1, background: '#FEE2E2', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#DC2626' }}>{result.errors.length}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#991B1B' }}>ERRORES</div>
                  </div>
                )}
              </div>


              {hasSkipDetails && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px',
                    color: text, opacity: 0.5, marginBottom: 8 }}>Detalle de registros omitidos / avisos</div>
                  {Object.entries(result.skipDetails!).map(([razon, detail]) => {
                    const cfg = SKIP_LABELS[razon] || { label: razon, color: '#374151', bg: '#F9FAFB', border: '#E5E7EB', icon: '📌' };
                    const isOpen = expandedSkip === razon;
                    return (
                      <div key={razon} style={{ marginBottom: 8, borderRadius: 8, border: `1px solid ${cfg.border}`,
                        background: cfg.bg, overflow: 'hidden' }}>

                        <button onClick={() => setExpandedSkip(isOpen ? null : razon)}
                          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                            padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
                          <span style={{ fontSize: 14 }}>{cfg.icon}</span>
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 900, color: cfg.color,
                            background: cfg.border, borderRadius: 12, padding: '1px 9px' }}>{detail.count}</span>
                          <span style={{ fontSize: 12, color: cfg.color, opacity: 0.6 }}>{isOpen ? '▲' : '▼'}</span>
                        </button>

                        {isOpen && detail.registros.length > 0 && (
                          <div style={{ borderTop: `1px solid ${cfg.border}`, maxHeight: 180, overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                              <thead>
                                <tr style={{ background: cfg.border + '80' }}>
                                  <th style={{ padding: '4px 10px', textAlign: 'left', fontWeight: 700, color: cfg.color, fontSize: 10 }}>DNI</th>
                                  <th style={{ padding: '4px 10px', textAlign: 'left', fontWeight: 700, color: cfg.color, fontSize: 10 }}>Nombre</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.registros.map((r, idx) => (
                                  <tr key={idx} style={{ borderTop: `1px solid ${cfg.border}` }}>
                                    <td style={{ padding: '4px 10px', color: cfg.color, fontFamily: 'monospace' }}>{r.dni}</td>
                                    <td style={{ padding: '4px 10px', color: cfg.color }}>{r.nombre}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {detail.count > detail.registros.length && (
                              <div style={{ padding: '4px 10px', fontSize: 10, color: cfg.color, opacity: 0.7 }}>
                                … y {detail.count - detail.registros.length} más
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}


              {result.errors.length > 0 && (
                <div style={{ borderRadius: 8, border: '1px solid #FCA5A5', marginBottom: 12, overflow: 'hidden' }}>
                  <div style={{ background: '#FEE2E2', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14 }}>❌</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#991B1B', flex: 1 }}>
                      Errores técnicos en {result.errors.length} fila{result.errors.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ maxHeight: 180, overflowY: 'auto', background: '#FFF5F5' }}>
                    {result.errors.map((e, i) => (
                      <div key={i} style={{ padding: '6px 12px', borderTop: i > 0 ? '1px solid #FEE2E2' : undefined,
                        display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#DC2626', background: '#FEE2E2',
                          borderRadius: 4, padding: '1px 6px', flexShrink: 0, marginTop: 1 }}>Fila {e.fila}</span>
                        <span style={{ fontSize: 11, color: '#991B1B', lineHeight: 1.4 }}>{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={onClose}
                style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none',
                  background: accent, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Cerrar
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}


const SALARY_COLORS = ['#1E3A8A','#1D4ED8','#2563EB','#3B82F6','#60A5FA','#93C5FD','#BFDBFE'];

const ACCENT  = '#1E3A8A';
const ACCENT2 = '#2563EB';

function getNivelColor(nivel: string): string {
  const l = nivel.toLowerCase();
  if (l.includes('alto') || l.includes('directivo') || l.includes('gerenci') || l.includes('ejecutivo')) return '#1E3A8A';
  if (l.includes('medio') || l.includes('jefe') || l.includes('supervis') || l.includes('coordin') || l.includes('mando')) return '#2563EB';
  return '#60A5FA';
}

function getSatisfColor(nivel: string): string {
  const l = nivel.toLowerCase();
  if (l.includes('muy') && l.includes('satisf')) return '#1E3A8A';
  if (l.includes('satisf') && !l.includes('in'))  return '#2563EB';
  if (l.includes('muy') && l.includes('insatisf')) return '#93C5FD';
  if (l.includes('insatisf'))                      return '#BAE6FD';
  return '#9ca3af';
}


function pToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

interface DSeg { pct: number; color: string; }

function DonutChart({ segments, size = 120, stroke = 22, centerText, centerColor, showExtLabel, extLabelAll }: {
  segments: DSeg[]; size?: number; stroke?: number; centerText?: string; centerColor?: string; showExtLabel?: boolean; extLabelAll?: boolean;
}) {

  const pad   = showExtLabel || extLabelAll ? 24 : 0;
  const cx    = size / 2 + pad;
  const cy    = size / 2 + pad;
  const r     = (size - stroke) / 2 - 2;
  const rLbl  = r + stroke / 2 + 10;
  let cur = 0;
  const GAP = segments.length > 2 ? 2 : 0;
  const elems: React.ReactNode[] = [];
  segments.forEach((s, i) => {

    const segDeg   = (s.pct / 100) * 360;
    const halfGap  = Math.min(GAP / 2, segDeg / 4);
    const sa  = (cur / 100) * 360 + halfGap;
    const mid = ((cur + s.pct / 2) / 100) * 360;
    cur += s.pct;
    const ea  = (cur / 100) * 360 - halfGap;
    const a   = pToXY(cx, cy, r, sa);
    const b   = pToXY(cx, cy, r, ea);
    const large = ea - sa > 180 ? 1 : 0;
    elems.push(
      <path key={`a${i}`} d={`M${a.x} ${a.y} A${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`}
        fill="none" stroke={s.color} strokeWidth={stroke} strokeLinecap="butt" />
    );
    if ((showExtLabel && s.pct > 0 && s.pct < 35) || (extLabelAll && s.pct > 2)) {
      const lp = pToXY(cx, cy, rLbl, mid);
      const anchor = lp.x > cx + 4 ? 'start' : lp.x < cx - 4 ? 'end' : 'middle';

      const lblColor = s.color === '#e5e7eb' || s.color === '#f3f4f6' ? '#6b7280' : s.color;
      elems.push(
        <text key={`l${i}`} x={lp.x} y={lp.y} textAnchor={anchor} dominantBaseline="middle"
          fontSize={size * 0.1} fontWeight="800" fill={lblColor}>{s.pct}%</text>
      );
    }
  });
  const vb = size + pad * 2;
  return (
    <svg width={vb} height={vb} viewBox={`0 0 ${vb} ${vb}`}
      style={extLabelAll ? { overflow: 'visible' } : undefined}>
      {elems}
      {centerText && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fontSize={size * 0.14} fontWeight="800" fill={centerColor || ACCENT}>{centerText}</text>
      )}
    </svg>
  );
}


function HBar({ label, pct, color, textColor }: { label: string; pct: number; color: string; textColor: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: textColor }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color }}>{pct} %</span>
      </div>
      <div style={{ background: 'rgba(128,128,128,0.15)', borderRadius: 4, height: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 4,
          transition: 'width .8s ease' }} />
      </div>
    </div>
  );
}


const normalizeProg = (p: string): string =>
  /cpel/i.test(p) ? 'Pregrado Ejecutivo' : p;


function TopBar({ label, pct, total, color, textColor }: {
  label: string; pct: number; total: number; color: string; textColor: string;
}) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3, gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: textColor, lineHeight: 1.25, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }} title={label}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 800, color, whiteSpace: 'nowrap' }}>{total.toLocaleString()} · {pct}%</span>
      </div>
      <div style={{ background: 'rgba(128,128,128,0.12)', borderRadius: 4, height: 7, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(pct, 2)}%`, background: color, height: '100%', borderRadius: 4,
          transition: 'width .8s ease' }} />
      </div>
    </div>
  );
}


interface StatItem { label: string; total: number; pct: number; }
interface TabStats {
  total: number; tasaAfinidad: number;
  nivelPuesto: StatItem[]; satisfaccion: StatItem[]; rangos: StatItem[];
  topRubros: StatItem[]; topEmpresas: StatItem[]; topAreas: StatItem[];
  topCarreras: StatItem[]; topFacultades: StatItem[];
}
const EMPTY_STATS: TabStats = {
  total: 0, tasaAfinidad: 0,
  nivelPuesto: [], satisfaccion: [], rangos: [],
  topRubros: [], topEmpresas: [], topAreas: [],
  topCarreras: [], topFacultades: [],
};


interface Resumen {
  totalEncuestados: number; egresadosColocados: number; alumniAfinCarrera: number;
  totalEmprendedores: number; tasaEmpleabilidad: number; tasaEmprendimiento: number; tasaAfinidad: number;
}
interface RangoItem  { rango: string; total: number; pct: number; }
interface NivelItem  { nivel: string; total: number; pct: number; }
interface SatisfItem { nivel: string; total: number; pct: number; }
interface Filtros {
  años: number[]; facultades: string[]; carreras: string[];
  programas: string[]; ciclos: { codigo: string; label?: string; anio: number; codigos?: string[] }[];
}

interface InformeEmplEntry { año: number; unidad: string; facultad: string; link: string; }
const FACULTAD_ALL_VALUE = '__all__';
const FACULTAD_CONSOLIDADO_VALUE = '__consolidado__';
const CONSOLIDATED_FACULTIES = new Set(['todas', 'global', 'consolidado', 'consolidada', 'general']);
const isConsolidatedFaculty = (facultad: string) => CONSOLIDATED_FACULTIES.has(String(facultad || '').trim().toLowerCase());
const INFORMES_EMPL: InformeEmplEntry[] = [

  { año: 2023, unidad: 'Pregrado Regular',          facultad: 'Arquitectura',          link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQBFhtdqSfZOT4qkWvtcuk3CAXUvWSPenII77LVFsPVC0rk?e=zigQcc' },
  { año: 2023, unidad: 'Pregrado Regular',          facultad: 'Artes y Humanidades',   link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQC2ZC09UGnOQKJetH0qMI6WAUaSfGcUydqzVJQrGatblJw?e=UQkcGl' },
  { año: 2023, unidad: 'Pregrado Regular',          facultad: 'Ciencias de la Salud',  link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQALqw814DlKR7kUtZNW0ezhAXJIiUiGiNkY8kgrhbWo_d0?e=MXuYbk' },
  { año: 2023, unidad: 'Pregrado Regular',          facultad: 'Ciencias Empresariales',link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQAXYpg06DNVTZcVRIRtktYSAejpuzi-sAYZQ8La6GFFsHk?e=3Ldl4n' },
  { año: 2023, unidad: 'Pregrado Regular',          facultad: 'Comunicación',          link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQAJr9UZ6Mi1S7aG7TCncSE-AWV_M51JA3w4UwhGvrgBVE4?e=DYRJx5' },
  { año: 2023, unidad: 'Pregrado Regular',          facultad: 'Derecho',               link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQDpUaUtIdLWQLQv7GC37js8AduIUVkG3qkBx4K9kyHbb0E?e=QLQ9Dw' },
  { año: 2023, unidad: 'Pregrado Regular',          facultad: 'Educación',             link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQAAUuByzbeOQKOJsms97RFaAXt3NCsval6AQ70xdcg7130?e=M0g6SO' },
  { año: 2023, unidad: 'Pregrado Regular',          facultad: 'HTG',                   link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQBWPfbKRL7-Q692Mk-qS6T4AZPNkbsCKnOFUujGPCeFZbs?e=Znzau7' },
  { año: 2023, unidad: 'Pregrado Regular',          facultad: 'Ingeniería',            link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQAKwjPUQRhER6yD-gw4j87hAeP3u0_7nVBKLKvrdolhGFo?e=pUjJfZ' },
  { año: 2023, unidad: 'Pregrado Ejecutivo',        facultad: 'General',               link: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQB0eWnKw0KlQYbk_ef_b-_FAXAaudNbTTXJF9KciSYw7bQ?e=4fnRBG' },
  { año: 2023, unidad: 'Doble Grado',               facultad: 'General',               link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQAI2y7tXO7cQpWZghJbyswDATMuq3QLrHzko6WX68UKL80?e=Y1HIvh' },
  { año: 2023, unidad: 'Escuela de Postgrado',      facultad: 'General',               link: 'https://usiloffice365.sharepoint.com/:b:/s/ALUMNI475/IQD4wVbnTpv1TbTCFO8gUmmGAR7K42e6tqoEnxjysLQUy2A?e=ZEVQBn' },
  { año: 2023, unidad: 'Instituto de Emprendedores',facultad: 'General',               link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQAzmHJfCur4QYwFShn3hb3JAT7xpwL9rIIASuRQev6oJf8?e=DyiQuL' },

  { año: 2024, unidad: 'Pregrado Regular',          facultad: 'Arquitectura',          link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQBAfOnLT025T4Jwf3FyDUqcAbSj8NyscXbLv3Rj9n5DNMo?e=70jMi0' },
  { año: 2024, unidad: 'Pregrado Regular',          facultad: 'Artes y Humanidades',   link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQAHOdapeFGlRqaRYZ1ZrMO2AcHHFPyg1AGPAvFudjboMtM?e=Pezvha' },
  { año: 2024, unidad: 'Pregrado Regular',          facultad: 'Ciencias de la Salud',  link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQAK01_2fyDSR4up1e54t-jfATtruv__LdbJgEdys-bWyx8?e=YoIRgE' },
  { año: 2024, unidad: 'Pregrado Regular',          facultad: 'Ciencias Empresariales',link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQBKAPuQEnu7RqDjBmj44iiYATg8FmeIuIW-LCb0pkfiAio?e=clMRNA' },
  { año: 2024, unidad: 'Pregrado Regular',          facultad: 'Comunicación',          link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQAXoyDq860sQL3Mss375fugAeo92lv4zc8Zt1_Sl-HYQjY?e=HraWCQ' },
  { año: 2024, unidad: 'Pregrado Regular',          facultad: 'Derecho',               link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQDeWMkwlyk8T75dTU5CusD2AZM0pGPc_zISw6bopJoZuCE?e=SUIpXW' },
  { año: 2024, unidad: 'Pregrado Regular',          facultad: 'Educación',             link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQCiD43OOcwKSo6MtaQCI4ejARG_3ppiL3CImYZ2WB_ojlQ?e=WG9gWp' },
  { año: 2024, unidad: 'Pregrado Regular',          facultad: 'HTG',                   link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQD7a-aWHLgcTb8dYm0s1FyJAVmOjpkWQchLMF7Df5DclNI?e=npU0Qv' },
  { año: 2024, unidad: 'Pregrado Regular',          facultad: 'Ingeniería',            link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQBOUNfvnrmORLGpx5yKCLmAAREbS6XrtpqpvqNzEl6mbkA?e=PHpZEs' },
  { año: 2024, unidad: 'Pregrado Regular',          facultad: 'Todas',                 link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQDc6R_jA1M3QKYRXFmeyrq3AXkh2Vp4zl2SdhaJK9Qqx0o?e=NoY76l' },
  { año: 2024, unidad: 'Pregrado Ejecutivo',        facultad: 'Ciencias Empresariales',link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQCFsN627KwQSLPrbNRrVc26Acj6mZPnpvEaZ2uZPZJ5Q9w?e=EkMbVg' },
  { año: 2024, unidad: 'Pregrado Ejecutivo',        facultad: 'Comunicación',          link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQDR-yVN2r3gT6cX3Uv_w-4RAT_tGMwobOkPu7QDogwcgS8?e=tsQshA' },
  { año: 2024, unidad: 'Pregrado Ejecutivo',        facultad: 'Ingeniería',            link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQB0HetECZ94RrPSAefsCx44AZt0qAmhslNQmfRocJFo8Ms?e=j9fYHS' },
  { año: 2024, unidad: 'Pregrado Ejecutivo',        facultad: 'Todas',                 link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQAyT4oO-8UATqC_LR1pGvoaATcC3SKKIHAWzMv-id4zm_0?e=OHPqjC' },
  { año: 2024, unidad: 'Doble Grado',               facultad: 'General',               link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQCDvacZfL62SY3BVmUlJNTxASTGdn8tl249E3fuWF6o5Q4?e=UbCly3' },
  { año: 2024, unidad: 'Escuela de Postgrado',      facultad: 'General',               link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQAu2lW1o_esTIsqfEHAFRbsAWVL_Ztdo-NEF__9OUKVIgc?e=xaLbq0' },
  { año: 2024, unidad: 'Instituto de Emprendedores',facultad: 'General',               link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQBXxAx8KdkARKtqbrdWTYlmAcUWd4WT4o4voaJpa5zfiaY?e=x8SEAn' },
  { año: 2024, unidad: 'Global',                    facultad: 'General',               link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQDMfuZsF7PKT7pJBoCiJu9YAaRQQHHwkALoSLiapGwurv0?e=hbeUcY' },

  { año: 2025, unidad: 'Pregrado Regular',          facultad: 'Arquitectura',          link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQCzTXwLcnckS6RKO7kGEeAXAXZgheK9jo76GWqPbYE8K4Y?e=MpSYqc' },
  { año: 2025, unidad: 'Pregrado Regular',          facultad: 'Artes y Humanidades',   link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQC7J9IC1_K9T5rpYBPl5_L3AYWZgQLO-CRIIfWR_NO4q7I?e=jQuWZe' },
  { año: 2025, unidad: 'Pregrado Regular',          facultad: 'Ciencias de la Salud',  link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQC5MYDjkr68Q4IaDaUja0IRAfx6O8D3qXf-cUk6I57yQtw?e=PpX0F1' },
  { año: 2025, unidad: 'Pregrado Regular',          facultad: 'Ciencias Empresariales',link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQC1tpqzDFstQLLkP-iXedB_Ad8xqburEbyN6jYqBGD4hsw?e=TMYmRZ' },
  { año: 2025, unidad: 'Pregrado Regular',          facultad: 'Comunicación',          link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQAV0b5Qi2CdS41VZGD373CtATEu3zbWvujpRcVBh5mE4Ww?e=mWtUdY' },
  { año: 2025, unidad: 'Pregrado Regular',          facultad: 'Derecho',               link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQDSuVlo5HuxTIzNLCAaXCQRASdy0fmoG5MIjBMzAGEODcA?e=NpR69S' },
  { año: 2025, unidad: 'Pregrado Regular',          facultad: 'Educación',             link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQCLsTECmlxpQphVVRuw6rxMAUi-l4ZIWWo3sPEL9ntoI7c?e=36diOu' },
  { año: 2025, unidad: 'Pregrado Regular',          facultad: 'HTG',                   link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQDGjlzWacoAS4R5SCC1_9d4AaMNNJAdG8jQ3JdiA99cxHg?e=Jm716P' },
  { año: 2025, unidad: 'Pregrado Regular',          facultad: 'Ingeniería',            link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQCVHPJfpFtESqyGbsUaJKnXAee2iFdeVvWBVDWVQ3NV1Ao?e=9ogbu1' },
  { año: 2025, unidad: 'Pregrado Regular',          facultad: 'Todas',                 link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQD4f0m_O98hSqJ0tG8CNkizARsOvdF8Flwaq39vHf3Rlas?e=CjYLEY' },
  { año: 2025, unidad: 'Pregrado Ejecutivo',        facultad: 'Ciencias Empresariales',link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQBd56Wqat-QQoQ3rEyXtnBuAdHD21_cE3S94gdE1Bp1L30?e=nS4I7D' },
  { año: 2025, unidad: 'Pregrado Ejecutivo',        facultad: 'Comunicación',          link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQBRdfzzgDRjTbigY3OcoI3nAdWEyfqRSRVqGPSIIfPopOs?e=RxWFJs' },
  { año: 2025, unidad: 'Pregrado Ejecutivo',        facultad: 'Ingeniería',            link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQB4x9fLphV4TZ7h76kp0xNIAYBhTvEJ2T9SVS6RC2QuFG8?e=znD6zD' },
  { año: 2025, unidad: 'Pregrado Ejecutivo',        facultad: 'Todas',                 link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQACqnuShysHRpLSQjoe6Vw0Afh-x5Zn5zMCAfxZf5oTdlo?e=vxypR3' },
  { año: 2025, unidad: 'Doble Grado',               facultad: 'General',               link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQC2ac1YCyNASqDtr-5AdT22ASnNkALw-DstJKf3edZYU1I?e=idkbZg' },
  { año: 2025, unidad: 'Escuela de Postgrado',      facultad: 'General',               link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQCAY8GTfzcJRpzaLxC-z0mSAYCxud5YKjq_9XjgfiAdwhw?e=KwgIJo' },
  { año: 2025, unidad: 'Instituto de Emprendedores',facultad: 'General',               link: 'https://usiloffice365.sharepoint.com/:p:/s/ALUMNI475/IQBKQd2BGu5eQZZAtBmhtG4YAZN7wOhTPT91wiZ1YDBXtjo?e=712pup' },
];

function DescargaInformes({ card, text, muted, border, isDark }: {
  card: string; text: string; muted: string; border: string; isDark: boolean;
}) {
  const DL = '#0F766E';
  const [dlAnio,     setDlAnio]     = useState('Todos');
  const [dlUnidad,   setDlUnidad]   = useState('Todas');
  const [dlFacultad, setDlFacultad] = useState(FACULTAD_ALL_VALUE);

  const dl_años     = ['Todos', ...[...new Set(INFORMES_EMPL.map(r => String(r.año)))].sort()];
  const dl_unidades = ['Todas', ...[...new Set(INFORMES_EMPL.map(r => r.unidad))].sort()];

  const preFiltered = INFORMES_EMPL
    .filter(r => dlAnio   === 'Todos' || r.año    === Number(dlAnio))
    .filter(r => dlUnidad === 'Todas' || r.unidad === dlUnidad);

  const hasConsolidated = preFiltered.some(r => isConsolidatedFaculty(r.facultad));
  const dl_facultades = [
    { value: FACULTAD_ALL_VALUE, label: 'Todas las facultades' },
    ...(hasConsolidated ? [{ value: FACULTAD_CONSOLIDADO_VALUE, label: 'Estudios consolidados' }] : []),
    ...[...new Set(preFiltered.map(r => r.facultad).filter(f => !isConsolidatedFaculty(f)))]
      .sort()
      .map(f => ({ value: f, label: f })),
  ];

  const results = preFiltered
    .filter(r => dlFacultad === FACULTAD_ALL_VALUE
      || (dlFacultad === FACULTAD_CONSOLIDADO_VALUE ? isConsolidatedFaculty(r.facultad) : r.facultad === dlFacultad));

  const getName = (r: InformeEmplEntry) => {
    const fac = isConsolidatedFaculty(r.facultad) ? ' Estudios consolidados' : ` ${r.facultad}`;
    return `Estudio de Empleabilidad ${r.unidad}${fac} ${r.año}`;
  };

  const selStyle: React.CSSProperties = {
    fontSize: 12, padding: '6px 10px', borderRadius: 6, fontWeight: 600,
    border: `1.5px solid ${border}`, background: card, color: text, cursor: 'pointer',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px',
    color: muted, display: 'block', marginBottom: 4,
  };
  const cardBase: React.CSSProperties = {
    background: card, borderRadius: 12, border: `1px solid ${border}`,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>


      <div style={{ ...cardBase, padding: '14px 18px' }}>
        <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: DL, marginBottom: 14 }}>
          Filtros
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>

          <div>
            <span style={labelStyle}>Año</span>
            <select value={dlAnio}
              onChange={e => { setDlAnio(e.target.value); setDlFacultad(FACULTAD_ALL_VALUE); }}
              style={{ ...selStyle, minWidth: 130 }}>
              {dl_años.map(a => <option key={a} value={a}>{a === 'Todos' ? 'Todos' : a}</option>)}
            </select>
          </div>

          <div>
            <span style={labelStyle}>Unidad</span>
            <select value={dlUnidad}
              onChange={e => { setDlUnidad(e.target.value); setDlFacultad(FACULTAD_ALL_VALUE); }}
              style={{ ...selStyle, minWidth: 200 }}>
              {dl_unidades.map(u => <option key={u} value={u}>{u === 'Todas' ? 'Todas' : u}</option>)}
            </select>
          </div>

          {dl_facultades.length > 1 && (
            <div>
              <span style={labelStyle}>Facultad</span>
              <select value={dlFacultad} onChange={e => setDlFacultad(e.target.value)}
                style={{ ...selStyle, minWidth: 200 }}>
                {dl_facultades.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          )}

          <button onClick={() => { setDlAnio('Todos'); setDlUnidad('Todas'); setDlFacultad(FACULTAD_ALL_VALUE); }}
            style={{ padding: '6px 14px', borderRadius: 6, border: `1.5px solid ${border}`,
              background: 'transparent', color: muted, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>filter_alt_off</span>
            Limpiar filtros
          </button>
        </div>
      </div>


      <div style={{ ...cardBase, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${border}` }}>
          <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: muted }}>
            Informes disponibles
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: muted }}>
            Informes encontrados:&nbsp;
            <span style={{ fontWeight: 900, color: DL, fontSize: 14 }}>{results.length}</span>
          </span>
        </div>

        {results.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: muted, fontSize: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, display: 'block', marginBottom: 8, opacity: 0.4 }}>folder_off</span>
            No hay informes con los filtros seleccionados.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc' }}>
                {['Estudio de empleabilidad', 'Año', 'Unidad', 'Facultad', 'Acción'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 9, fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '0.8px', color: muted,
                    borderBottom: `1px solid ${border}` }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}
                  style={{ borderBottom: i < results.length - 1 ? `1px solid ${border}` : 'none', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '11px 14px', fontSize: 12, fontWeight: 600, color: text }}>{getName(r)}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, fontWeight: 800, color: DL, whiteSpace: 'nowrap' }}>{r.año}</td>
                  <td style={{ padding: '11px 14px', fontSize: 11, color: text, whiteSpace: 'nowrap' }}>{r.unidad}</td>
                  <td style={{ padding: '11px 14px', fontSize: 11, color: muted, whiteSpace: 'nowrap' }}>
                    {isConsolidatedFaculty(r.facultad) ? 'Estudios consolidados' : r.facultad}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <a href={r.link.trim()} target="_blank" rel="noopener noreferrer"
                      onClick={() => logActividad('descargar_informe', {
                        modulo: 'empleabilidad',
                        vista: 'descarga_informes',
                        elementoTipo: 'informe',
                        elementoTitulo: getName(r),
                        detalle: `Modulo Empleo | Vista Descarga de informes | Informe: ${getName(r)}`,
                        metadata: { vista: 'descarga_informes', anio: r['aÃ±o'], unidad: r.unidad, facultad: r.facultad, url: r.link.trim() },
                      })}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 14px',
                        borderRadius: 7, background: DL, color: '#fff', fontSize: 11, fontWeight: 700,
                        textDecoration: 'none', transition: 'opacity .15s' }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
                      Abrir informe
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

type TabEmpl = 'resumen' | 'laboral' | 'emprendedor' | 'busqueda' | 'descarga';
const TABS: { key: TabEmpl; label: string; icon: string; color: string }[] = [
  { key: 'resumen',     label: 'Información General',            icon: 'bar_chart',     color: '#1E3A8A' },
  { key: 'laboral',     label: 'Egresados en Actividad Laboral', icon: 'work',          color: '#1D4ED8' },
  { key: 'emprendedor', label: 'Egresados Emprendedores',        icon: 'rocket_launch', color: '#0284C7' },
  { key: 'busqueda',    label: 'Egresados en Búsqueda Laboral',  icon: 'manage_search', color: '#0891B2' },
  { key: 'descarga',    label: 'Descarga de informes',           icon: 'download',      color: '#0F766E' },
];

const EMPTY_RESUMEN: Resumen = {
  totalEncuestados: 0, egresadosColocados: 0, alumniAfinCarrera: 0,
  totalEmprendedores: 0, tasaEmpleabilidad: 0, tasaEmprendimiento: 0, tasaAfinidad: 0,
};

const EmpleabilidadView: React.FC<EmpleabilidadViewProps> = ({ themeColors: C, userRole }) => {
  const [showImport, setShowImport] = useState(false);
  const [activeTab,  setActiveTab]  = useState<TabEmpl>('resumen');
  const canImport = userRole === 'admin' || userRole === 'analista' || userRole === 'editor';


  const [selProgramas, setSelProgramas] = useState<string[]>([]);
  const [selAños,      setSelAños]      = useState<string[]>([]);
  const [selCiclos,    setSelCiclos]    = useState<string[]>([]);
  const [selFacultad,  setSelFacultad]  = useState('Todas');
  const [selCarrera,   setSelCarrera]   = useState('Todas');


  const [filtros, setFiltros] = useState<Filtros>({ años: [], facultades: [], carreras: [], programas: [], ciclos: [] });


  const [resumen, setResumen] = useState<Resumen>(EMPTY_RESUMEN);
  const [rangos,  setRangos]  = useState<RangoItem[]>([]);
  const [niveles, setNiveles] = useState<NivelItem[]>([]);
  const [satisf,  setSatisf]  = useState<SatisfItem[]>([]);
  const [loading, setLoading] = useState(false);


  const [tabStats,      setTabStats]      = useState<TabStats>(EMPTY_STATS);
  const [tabStatsLoading, setTabStatsLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (selAños.length === 1)      p.set('anio',     selAños[0]);
    else if (selAños.length > 1)   p.set('anios',    selAños.join(','));
    if (selFacultad !== 'Todas')   p.set('facultad', selFacultad);
    if (selCarrera  !== 'Todas')   p.set('carrera',  selCarrera);
    if (selProgramas.length === 1) p.set('programa', selProgramas[0]);
    if (selCiclos.length === 1)    p.set('ciclo',    selCiclos[0]);
    return p.toString() ? '?' + p.toString() : '';
  }, [selAños, selFacultad, selCarrera, selProgramas, selCiclos]);

  const fetchData = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const qs = buildParams();
      const headers = {};
      try {
        const [r1, r2, r3, r4] = await Promise.all([
          fetch(`/api/empleabilidad/resumen${qs}`,      { headers }).then(r => r.json()),
          fetch(`/api/empleabilidad/rangos${qs}`,        { headers }).then(r => r.json()),
          fetch(`/api/empleabilidad/nivel-puesto${qs}`,  { headers }).then(r => r.json()),
          fetch(`/api/empleabilidad/satisfaccion${qs}`,  { headers }).then(r => r.json()),
        ]);
        setResumen(r1.error ? EMPTY_RESUMEN : r1);
        setRangos(Array.isArray(r2)  ? r2  : []);
        setNiveles(Array.isArray(r3) ? r3  : []);
        setSatisf(Array.isArray(r4)  ? r4  : []);
      } catch {}
      setLoading(false);
    }, 300);
  }, [buildParams]);


  useEffect(() => {
    fetch('/api/empleabilidad/filtros')
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setFiltros(d);
          setSelProgramas(d.programas || []);
          setSelAños((d.años || []).map(String));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (selAños.length === 1) p.set('anio', selAños[0]);
    if (selProgramas.length === 1) p.set('programa', selProgramas[0]);
    if (selFacultad !== 'Todas') p.set('facultad', selFacultad);
    if (selCarrera !== 'Todas') p.set('carrera', selCarrera);
    fetch(`/api/empleabilidad/filtros${p.toString() ? '?' + p.toString() : ''}`)
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setFiltros(d);
          const validCiclos = new Set((d.ciclos || []).map((c: { codigo: string }) => c.codigo));
          setSelCiclos(prev => prev.filter(c => validCiclos.has(c)));
        }
      })
      .catch(() => {});
  }, [selAños, selProgramas, selFacultad, selCarrera]);


  const fetchTabStats = useCallback(async (tipo: string) => {
    setTabStatsLoading(true);
    const p = new URLSearchParams({ tipo });
    if (selAños.length === 1)      p.set('anio',     selAños[0]);
    else if (selAños.length > 1)   p.set('anios',    selAños.join(','));
    if (selFacultad !== 'Todas')   p.set('facultad', selFacultad);
    if (selCarrera  !== 'Todas')   p.set('carrera',  selCarrera);
    if (selProgramas.length === 1) p.set('programa', selProgramas[0]);
    if (selCiclos.length === 1)    p.set('ciclo',    selCiclos[0]);
    try {
      const r = await fetch(`/api/empleabilidad/stats-tab?${p}`);
      const d = await r.json();
      setTabStats(d.error ? EMPTY_STATS : d);
    } catch { setTabStats(EMPTY_STATS); }
    setTabStatsLoading(false);
  }, [selAños, selFacultad, selCarrera, selProgramas, selCiclos]);


  useEffect(() => { fetchData(); }, [fetchData]);


  useEffect(() => {
    if (activeTab !== 'resumen' && activeTab !== 'descarga') {
      fetchTabStats(activeTab);
    }
  }, [activeTab, fetchTabStats]);


  const handleImportClose = () => {
    setShowImport(false);
    fetch('/api/empleabilidad/filtros')
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setFiltros(d);
          setSelProgramas(d.programas || []);
          setSelAños((d.años || []).map(String));
        }
      })
      .catch(() => {});
  };

  const handleNormalizarSalarios = async () => {
    if (!window.confirm('Normalizar datos de empleabilidad? Esto agrupa rangos salariales y corrige estados laborales ya importados.')) return;
    try {
      const [rSal, rLab] = await Promise.all([
        fetch('/api/empleabilidad/admin/normalizar-salarios', {
          method: 'POST',
        }),
        fetch('/api/empleabilidad/admin/normalizar-laboral', {
          method: 'POST',
        }),
      ]);
      const d = await rSal.json();
      const lab = await rLab.json();
      if (d.ok && lab.ok) {
        const msg = `Normalizacion completada.\nRangos insertados: ${d.upserted}  |  Rangos corregidos: ${d.fixed}\nEstados laborales corregidos: ${lab.changedRows ?? lab.affectedRows ?? 0}` +
          (d.sinClasificar?.length ? `\n\nAun sin clasificar (${d.sinClasificar.length}):\n` +
            d.sinClasificar.map((x: any) => `- ${x.descripcion_original} (${x.registros} registros)`).join('\n') : '');
        window.alert(msg);
        fetchData();
      } else {
        window.alert('Error al normalizar: ' + JSON.stringify({ salarios: d, laboral: lab }));
      }
    } catch (e: any) { window.alert('Error: ' + e.message); }
  };

  const toggleArr = (arr: string[], val: string, set: (v: string[]) => void) =>
    set(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);

  const programasList = filtros.programas.length ? filtros.programas : [];
  const selectAll = programasList.length > 0 && selProgramas.length === programasList.length;
  const toggleAll = () => setSelProgramas(selectAll ? [] : [...programasList]);


  const isDark = C.cardBg?.includes('slate-9') ?? false;
  const bg     = isDark ? '#0f172a' : '#f8fafc';
  const card   = isDark ? '#1e293b' : '#ffffff';
  const text   = isDark ? '#f1f5f9' : '#1e293b';
  const muted  = isDark ? '#94a3b8' : '#64748b';
  const border = isDark ? 'rgba(148,163,184,0.15)' : '#e2e8f0';

  const cardStyle: React.CSSProperties = {
    background: card, borderRadius: 12, border: `1px solid ${border}`,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: 16,
    minWidth: 0, boxSizing: 'border-box', overflow: 'hidden',
  };

  const noTrabaja   = Math.round(Math.max(0, 100 - resumen.tasaEmpleabilidad) * 100) / 100;
  const noAfinidad  = Math.round(Math.max(0, 100 - resumen.tasaAfinidad)      * 100) / 100;

  const rangosVis   = rangos.filter(r => r.rango && r.rango.trim() !== '-');
  const rangoSegs   = rangosVis.map((r, i) => ({ pct: r.pct, color: SALARY_COLORS[i] || '#ccc' }));

  const solo2022    = selAños.length === 1 && selAños[0] === '2022';

  return (
    <div style={{ padding: '14px 20px', background: bg, minHeight: '100%', color: text, overflowX: 'hidden' }}>


      {showImport && (
        <ImportModal onClose={handleImportClose} accent={ACCENT} card={card} text={text} border={border} />
      )}


      <div style={{ position: 'relative', textAlign: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '1px', color: ACCENT, margin: 0,
          textTransform: 'uppercase' }}>
          ESTUDIO DE EMPLEABILIDAD
          {selAños.length === 1 && (
            <span style={{ marginLeft: 10, fontSize: 20, fontWeight: 700, color: ACCENT, opacity: 0.75 }}>
              {selAños[0]}
            </span>
          )}
        </h2>
        <span style={{ fontSize: 11, color: muted, display: 'block', marginTop: 2,
          visibility: (loading || tabStatsLoading) ? 'visible' : 'hidden' }}>cargando…</span>
      </div>


      <div style={{ display: 'flex', gap: 4, marginBottom: 10, borderBottom: `2px solid ${border}`, paddingBottom: 0 }}>
        {TABS.map(t => {
          const active = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', border: 'none', cursor: 'pointer',
                borderRadius: '8px 8px 0 0', fontSize: 12, fontWeight: 700,
                background: active ? t.color : 'transparent',
                color: active ? '#fff' : muted,
                borderBottom: active ? `2px solid ${t.color}` : '2px solid transparent',
                marginBottom: -2, transition: 'all .15s',
              }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>


      {activeTab !== 'descarga' && <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {programasList.length > 0 && (
          <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '7px 12px', background: card }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 5 }}>Programa</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 10, fontWeight: 600, marginBottom: 3 }}>
              <input type="checkbox" checked={selectAll} onChange={toggleAll} style={{ accentColor: ACCENT }} />
              Seleccionar todo
            </label>
            {programasList.map(p => (
              <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 10, fontWeight: 600, marginBottom: 2 }}>
                <input type="checkbox" checked={selProgramas.includes(p)}
                  onChange={() => toggleArr(selProgramas, p, setSelProgramas)}
                  style={{ accentColor: ACCENT }} />
                {normalizeProg(p)}
              </label>
            ))}
          </div>
        )}

        {filtros.años.length > 0 && (
          <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '7px 12px', background: card }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 5 }}>Año Encuesta</div>
            {filtros.años.map(a => (
              <label key={a} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 10, fontWeight: 600, marginBottom: 2 }}>
                <input type="checkbox" checked={selAños.includes(String(a))}
                  onChange={() => toggleArr(selAños, String(a), setSelAños)}
                  style={{ accentColor: ACCENT }} />
                {a}
              </label>
            ))}
          </div>
        )}

        {filtros.ciclos.length > 0 && (
          <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '7px 12px', background: card, flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 5 }}>Ciclo Egreso</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {filtros.ciclos.map(c => {
                const active = selCiclos.includes(c.codigo);
                return (
                  <button key={c.codigo} onClick={() => toggleArr(selCiclos, c.codigo, setSelCiclos)}
                    style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                      border: `1.5px solid ${active ? ACCENT : '#d1d5db'}`,
                      background: active ? ACCENT : 'transparent',
                      color: active ? '#fff' : text, transition: 'all .15s' }}>
                    {c.label || c.codigo}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '7px 12px', background: card, minWidth: 160 }}>
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 5 }}>Facultad</div>
          <select value={selFacultad} onChange={e => setSelFacultad(e.target.value)}
            style={{ fontSize: 10, fontWeight: 600, padding: '3px 6px', borderRadius: 5, width: '100%',
              border: `1px solid ${border}`, background: card, color: text, cursor: 'pointer', marginBottom: 8 }}>
            <option>Todas</option>
            {filtros.facultades.map(f => <option key={f}>{f}</option>)}
          </select>
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 5 }}>Carrera</div>
          <select value={selCarrera} onChange={e => setSelCarrera(e.target.value)}
            style={{ fontSize: 10, fontWeight: 600, padding: '3px 6px', borderRadius: 5, width: '100%',
              border: `1px solid ${border}`, background: card, color: text, cursor: 'pointer' }}>
            <option>Todas</option>
            {filtros.carreras.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>}


      {activeTab === 'resumen' && (
        <div style={{ display: 'flex', gap: 10 }}>


          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>


            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: ACCENT, borderRadius: 10, color: '#fff', padding: '12px 16px' }}>
                <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', opacity: 0.85, marginBottom: 4, lineHeight: 1.3 }}>
                  Egresados Colocados Laboralmente
                </div>
                <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1 }}>
                  {resumen.egresadosColocados.toLocaleString()}
                </div>
              </div>
              <div style={{ background: '#1D4ED8', borderRadius: 10, color: '#fff', padding: '12px 16px' }}>
                <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', opacity: 0.85, marginBottom: 4, lineHeight: 1.3 }}>
                  Alumni con Empleo Afín a su Carrera
                </div>
                <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1 }}>
                  {resumen.alumniAfinCarrera.toLocaleString()}
                </div>
              </div>
            </div>


            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>


              <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px' }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: muted, textAlign: 'center' }}>
                  Tasa de Empleabilidad
                </div>
                <DonutChart
                  segments={[
                    { pct: resumen.tasaEmpleabilidad, color: ACCENT    },
                    { pct: noTrabaja,                 color: '#e5e7eb' },
                  ]}
                  size={130} stroke={26}
                  centerText={`${resumen.tasaEmpleabilidad}%`}
                  showExtLabel
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: text }}>TRABAJA {resumen.tasaEmpleabilidad}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e5e7eb', flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: muted }}>NO TRABAJA {noTrabaja}%</span>
                  </div>
                </div>
              </div>


              <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px' }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: muted, textAlign: 'center' }}>
                  Afinidad Laboral
                </div>
                <DonutChart
                  segments={[
                    { pct: resumen.tasaAfinidad, color: ACCENT2   },
                    { pct: noAfinidad,           color: '#e5e7eb' },
                  ]}
                  size={130} stroke={26}
                  centerText={`${resumen.tasaAfinidad}%`}
                  showExtLabel
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT2, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: text }}>SÍ {resumen.tasaAfinidad}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e5e7eb', flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: muted }}>NO {noAfinidad}%</span>
                  </div>
                </div>
              </div>

            </div>
          </div>


          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>


            <div style={{ ...cardStyle, padding: '14px 16px' }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 10 }}>
                Rango Salarial Promedio
              </div>
              {rangosVis.length === 0 ? (
                <div style={{ color: muted, fontSize: 12, textAlign: 'center', padding: 16 }}>Sin datos</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 28, minWidth: 0 }}>

                  <div style={{ flex: '1 1 220px', minWidth: 220 }}>
                    {rangosVis.map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 7 }}>
                        <div style={{ width: 11, height: 11, borderRadius: 3, background: SALARY_COLORS[i % SALARY_COLORS.length], flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: text, lineHeight: 1.25, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{r.rango}</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: SALARY_COLORS[i % SALARY_COLORS.length], flexShrink: 0 }}>{r.pct}%</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ flexShrink: 0, marginLeft: 8 }}>
                    <DonutChart segments={rangoSegs} size={132} stroke={28} extLabelAll />
                  </div>
                </div>
              )}
            </div>


            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>


              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ ...cardStyle, padding: '10px 14px' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 8 }}>
                    Nivel de Puesto
                  </div>
                  {niveles.length === 0
                    ? <div style={{ color: muted, fontSize: 12 }}>Sin datos</div>
                    : niveles.map((n, i) => <HBar key={i} label={n.nivel} pct={n.pct} color={getNivelColor(n.nivel)} textColor={text} />)
                  }
                </div>
                {!solo2022 && (
                  <div style={{ background: ACCENT, borderRadius: 10, color: '#fff',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '18px 16px', textAlign: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', opacity: 0.9 }}>
                      Emprendedores
                    </span>
                    <span style={{ fontSize: 32, fontWeight: 900, lineHeight: 1.2 }}>{resumen.tasaEmprendimiento}%</span>
                  </div>
                )}
              </div>


              <div style={{ ...cardStyle, padding: '10px 14px' }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 8 }}>
                  Satisfacción USIL
                </div>
                {satisf.length === 0
                  ? <div style={{ color: muted, fontSize: 12 }}>Sin datos</div>
                  : satisf.map((s, i) => (
                      <HBar key={i} label={s.nivel} pct={s.pct}
                        color={getSatisfColor(s.nivel)} textColor={text} />
                    ))
                }
                {satisf.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 9, color: muted, textAlign: 'right' }}>
                    %TG Recuento de Satisfacción USIL
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>
      )}


      {activeTab === 'descarga' && <DescargaInformes card={card} text={text} muted={muted} border={border} isDark={isDark} />}


      {activeTab !== 'resumen' && activeTab !== 'descarga' && (() => {
        const cfg = TABS.find(t => t.key === activeTab)!;
        const C1 = cfg.color;

        const C2 = activeTab === 'laboral'     ? '#2563EB'
                 : activeTab === 'emprendedor' ? '#0369A1'
                 :                              '#0E7490';
        const S = tabStats;

        if (tabStatsLoading) return (
          <div className="flex items-center justify-center py-20">
            <span className="material-symbols-outlined animate-spin" style={{ fontSize: 28, color: C1 }}>progress_activity</span>
            <span style={{ marginLeft: 12, fontSize: 13, color: muted }}>Cargando estadísticas…</span>
          </div>
        );


        const KpiCard = ({ label, value, sub, wide }: { label: string; value: string | number; sub?: string; wide?: boolean }) => (
          <div style={{ background: `linear-gradient(135deg, ${C1} 0%, ${C2} 100%)`,
            borderRadius: 12, color: '#fff', padding: '14px 18px', gridColumn: wide ? 'span 2' : undefined }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', opacity: 0.85, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 38, fontWeight: 900, lineHeight: 1 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
            {sub && <div style={{ fontSize: 10, opacity: 0.8, marginTop: 3 }}>{sub}</div>}
          </div>
        );

        const ChartCard = ({ title, children, span }: { title: string; children: React.ReactNode; span?: number }) => (
          <div style={{ ...cardStyle, padding: '12px 16px', gridColumn: span ? `span ${span}` : undefined }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: C1, marginBottom: 10 }}>{title}</div>
            {children}
          </div>
        );

        const EmptyState = () => (
          <div style={{ color: muted, fontSize: 11, textAlign: 'center', padding: '16px 0' }}>Sin datos</div>
        );


        const MiniDonut = ({ items }: { items: StatItem[] }) => {
          const segs = items.map((it, i) => ({ pct: it.pct, color: SALARY_COLORS[i] || '#94a3b8' }));
          return (
            <div style={{ display: 'flex', gap: 28, alignItems: 'center', minWidth: 0 }}>
              <div style={{ flexShrink: 0, marginRight: 8 }}>
                <DonutChart segments={segs} size={84} stroke={18} centerColor={C1} extLabelAll />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: SALARY_COLORS[i] || '#94a3b8', flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: text, flex: 1, minWidth: 0, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{it.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: SALARY_COLORS[i] || '#94a3b8', whiteSpace: 'nowrap' }}>{it.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          );
        };


        if (activeTab === 'laboral') return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
              <KpiCard label="Egresados en Actividad Laboral" value={S.total} />
              <KpiCard label="Afinidad con su Carrera" value={`${S.tasaAfinidad}%`}
                sub={`${S.topCarreras[0]?.label || '—'} · carrera principal`} />
              <ChartCard title="Rango Salarial" span={2}>
                {S.rangos.length === 0 ? <EmptyState /> : <MiniDonut items={S.rangos} />}
              </ChartCard>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
              <ChartCard title="Nivel de Puesto">
                {S.nivelPuesto.length === 0 ? <EmptyState /> : <MiniDonut items={S.nivelPuesto} />}
              </ChartCard>
              <ChartCard title="Top Rubros Laborales">
                {S.topRubros.length === 0 ? <EmptyState />
                  : S.topRubros.map((it, i) => <TopBar key={i} label={it.label} pct={it.pct} total={it.total} color={SALARY_COLORS[i] || C1} textColor={text} />)
                }
              </ChartCard>
              <ChartCard title="Top Empresas / Centros Laborales">
                {S.topEmpresas.length === 0 ? <EmptyState />
                  : S.topEmpresas.map((it, i) => <TopBar key={i} label={it.label} pct={it.pct} total={it.total} color={SALARY_COLORS[i] || C1} textColor={text} />)
                }
              </ChartCard>
              <ChartCard title="Top Áreas de Trabajo">
                {S.topAreas.length === 0 ? <EmptyState />
                  : S.topAreas.map((it, i) => <TopBar key={i} label={it.label} pct={it.pct} total={it.total} color={SALARY_COLORS[i] || C1} textColor={text} />)
                }
              </ChartCard>
            </div>
          </div>
        );


        if (activeTab === 'emprendedor') return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <KpiCard label="Egresados Emprendedores" value={S.total} />
                <div style={{ background: `linear-gradient(135deg, ${C1}22 0%, ${C2}22 100%)`,
                  borderRadius: 12, border: `1.5px solid ${C1}33`, padding: '12px 16px' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: C1, marginBottom: 4 }}>
                    Carrera con más emprendedores
                  </div>
                  {S.topCarreras[0] ? (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 800, color: text, lineHeight: 1.4 }}>{S.topCarreras[0].label}</div>
                      <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{S.topCarreras[0].total} emprendedores · {S.topCarreras[0].pct}%</div>
                    </>
                  ) : <div style={{ color: muted, fontSize: 11 }}>Sin datos</div>}
                </div>
              </div>
              <ChartCard title="Satisfacción USIL de Emprendedores">
                {S.satisfaccion.length === 0 ? <EmptyState /> : (
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{ flexShrink: 0, padding: '0 24px' }}>
                      <DonutChart
                        segments={S.satisfaccion.map((it) => ({ pct: it.pct, color: getSatisfColor(it.label) }))}
                        size={130} stroke={26} centerColor={C1} showExtLabel />
                    </div>
                    <div style={{ flex: 1 }}>
                      {S.satisfaccion.map((it, i) => (
                        <HBar key={i} label={it.label} pct={it.pct} color={getSatisfColor(it.label)} textColor={text} />
                      ))}
                    </div>
                  </div>
                )}
              </ChartCard>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <ChartCard title="Top Carreras de Emprendedores">
                {S.topCarreras.length === 0 ? <EmptyState />
                  : S.topCarreras.map((it, i) => <TopBar key={i} label={it.label} pct={it.pct} total={it.total} color={SALARY_COLORS[i] || C1} textColor={text} />)
                }
              </ChartCard>
              <ChartCard title="Top Facultades">
                {S.topFacultades.length === 0 ? <EmptyState />
                  : S.topFacultades.map((it, i) => <TopBar key={i} label={it.label} pct={it.pct} total={it.total} color={SALARY_COLORS[i] || C1} textColor={text} />)
                }
              </ChartCard>
              <ChartCard title="Nivel de Puesto / Actividad">
                {S.nivelPuesto.length === 0 ? <EmptyState />
                  : S.nivelPuesto.map((it, i) => <TopBar key={i} label={it.label} pct={it.pct} total={it.total} color={getNivelColor(it.label)} textColor={text} />)
                }
              </ChartCard>
            </div>
          </div>
        );


        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <KpiCard label="Egresados en Búsqueda Laboral" value={S.total} />
                <div style={{ background: `linear-gradient(135deg, ${C1}22 0%, ${C2}22 100%)`,
                  borderRadius: 12, border: `1.5px solid ${C1}33`, padding: '12px 16px' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: C1, marginBottom: 4 }}>
                    Carrera con mayor búsqueda
                  </div>
                  {S.topCarreras[0] ? (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 800, color: text, lineHeight: 1.4 }}>{S.topCarreras[0].label}</div>
                      <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{S.topCarreras[0].total} egresados · {S.topCarreras[0].pct}%</div>
                    </>
                  ) : <div style={{ color: muted, fontSize: 11 }}>Sin datos</div>}
                </div>
              </div>
              <ChartCard title="Satisfacción USIL de Egresados en Búsqueda">
                {S.satisfaccion.length === 0 ? <EmptyState /> : (
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{ flexShrink: 0, padding: '0 24px' }}>
                      <DonutChart
                        segments={S.satisfaccion.map((it) => ({ pct: it.pct, color: getSatisfColor(it.label) }))}
                        size={130} stroke={26} centerColor={C1} showExtLabel />
                    </div>
                    <div style={{ flex: 1 }}>
                      {S.satisfaccion.map((it, i) => (
                        <HBar key={i} label={it.label} pct={it.pct} color={getSatisfColor(it.label)} textColor={text} />
                      ))}
                    </div>
                  </div>
                )}
              </ChartCard>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <ChartCard title="Top Carreras en Búsqueda Laboral">
                {S.topCarreras.length === 0 ? <EmptyState />
                  : S.topCarreras.map((it, i) => <TopBar key={i} label={it.label} pct={it.pct} total={it.total} color={SALARY_COLORS[i] || C1} textColor={text} />)
                }
              </ChartCard>
              <ChartCard title="Top Facultades en Búsqueda Laboral">
                {S.topFacultades.length === 0 ? <EmptyState />
                  : S.topFacultades.map((it, i) => <TopBar key={i} label={it.label} pct={it.pct} total={it.total} color={SALARY_COLORS[i] || C1} textColor={text} />)
                }
              </ChartCard>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

export default EmpleabilidadView;
