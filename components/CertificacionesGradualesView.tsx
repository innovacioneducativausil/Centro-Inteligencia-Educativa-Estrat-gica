import React, { useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, FileSpreadsheet, Lightbulb, RotateCcw, Search, Sparkles, X } from 'lucide-react';
import { ThemeColors } from '../types';
import { CERTIFICACIONES_PROGRAMAS, CertificacionesCurso } from './certificacionesData';

interface CertificacionesGradualesViewProps {
  themeColors: ThemeColors;
  userRole?: string;
}

type CertSlot = {
  nombre: string;
  descripcion: string;
  cursoIds: string[];
};

const ACCENT = '#006b5e';
const NAVY = '#002060';

function cycleName(ciclo: number) {
  return `Ciclo ${ciclo}`;
}

function initialSlots(): CertSlot[] {
  return [1, 2, 3].map(n => ({
    nombre: `Certificacion gradual ${n}`,
    descripcion: '',
    cursoIds: [],
  }));
}

function scoreCurso(curso: CertificacionesCurso) {
  const name = curso.nombre.toLowerCase();
  let score = 55;
  if (curso.ciclo >= 4 && curso.ciclo <= 8) score += 20;
  if (/proyecto|integrador|software|english|investigaci|programaci|evaluaci|did[aá]ct|teaching|curricular/i.test(curso.nombre)) score += 18;
  if (curso.condicion?.toLowerCase() === 'obligatorio') score += 5;
  if (name.includes('electivo')) score -= 12;
  return Math.max(35, Math.min(98, score));
}

const CertificacionesGradualesView: React.FC<CertificacionesGradualesViewProps> = ({ themeColors: C, userRole }) => {
  const isDark = C.cardBg?.includes('slate-9') ?? false;
  const bg = isDark ? '#0f172a' : '#f8fafc';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#1e293b';
  const muted = isDark ? '#94a3b8' : '#64748b';
  const border = isDark ? 'rgba(148,163,184,0.18)' : '#e2e8f0';

  const [programCode, setProgramCode] = useState(CERTIFICACIONES_PROGRAMAS[0].code);
  const [query, setQuery] = useState('');
  const [cycleFilter, setCycleFilter] = useState('todos');
  const [slots, setSlots] = useState<CertSlot[]>(initialSlots);

  const programa = CERTIFICACIONES_PROGRAMAS.find(p => p.code === programCode) ?? CERTIFICACIONES_PROGRAMAS[0];
  const cursos = [...programa.cursos];
  const selectedIds = new Set(slots.flatMap(slot => slot.cursoIds));
  const allComplete = slots.every(slot => slot.cursoIds.length >= 4 && slot.nombre.trim());
  const assignedCount = slots.reduce((total, slot) => total + slot.cursoIds.length, 0);
  const canEdit = ['admin', 'analista', 'editor', 'usuario'].includes(userRole || 'usuario');

  const cursosFiltrados = useMemo(() => {
    const term = query.trim().toLowerCase();
    return cursos
      .filter(curso => cycleFilter === 'todos' || String(curso.ciclo) === cycleFilter)
      .filter(curso => !term || `${curso.nombre} ${curso.codigoOficial} ${curso.tipoEstudios} ${curso.coordinacion}`.toLowerCase().includes(term))
      .sort((a, b) => scoreCurso(b) - scoreCurso(a) || a.ciclo - b.ciclo || a.nombre.localeCompare(b.nombre));
  }, [cursos, cycleFilter, query]);

  const cursoById = useMemo(() => new Map(cursos.map(curso => [curso.id, curso])), [cursos]);
  const ciclos = [...new Set(cursos.map(curso => curso.ciclo))].sort((a, b) => a - b);
  const mencionesVisibles = [...programa.menciones].slice(0, 6);

  const addCurso = (cursoId: string, slotIndex?: number) => {
    if (!canEdit || selectedIds.has(cursoId)) return;
    setSlots(prev => {
      const next = prev.map(slot => ({ ...slot, cursoIds: [...slot.cursoIds] }));
      const targetIndex = slotIndex ?? next.findIndex(slot => slot.cursoIds.length < 4);
      if (targetIndex < 0 || next[targetIndex].cursoIds.length >= 4) return prev;
      next[targetIndex].cursoIds.push(cursoId);
      return next;
    });
  };

  const removeCurso = (slotIndex: number, cursoId: string) => {
    if (!canEdit) return;
    setSlots(prev => prev.map((slot, idx) => idx === slotIndex
      ? { ...slot, cursoIds: slot.cursoIds.filter(id => id !== cursoId) }
      : slot
    ));
  };

  const updateSlot = (idx: number, patch: Partial<CertSlot>) => {
    if (!canEdit) return;
    setSlots(prev => prev.map((slot, i) => i === idx ? { ...slot, ...patch } : slot));
  };

  const reset = () => {
    setSlots(initialSlots());
    setQuery('');
    setCycleFilter('todos');
  };

  const applySuggestion = () => {
    const sugeridos = cursos
      .filter(curso => curso.ciclo >= 4 && curso.ciclo <= 8 && !/^ELECTIVO/i.test(curso.nombre))
      .sort((a, b) => scoreCurso(b) - scoreCurso(a))
      .slice(0, 12);

    setSlots([
      {
        nombre: programa.code === 'P25' ? 'Certificacion en ensenanza del ingles' : 'Certificacion en desarrollo y acompanamiento infantil',
        descripcion: 'Agrupa cursos intermedios con evidencia aplicable y progresion por competencias.',
        cursoIds: sugeridos.slice(0, 4).map(c => c.id),
      },
      {
        nombre: 'Certificacion en diseno curricular y evaluacion',
        descripcion: 'Integra cursos de programacion, evaluacion, investigacion y proyecto.',
        cursoIds: sugeridos.slice(4, 8).map(c => c.id),
      },
      {
        nombre: 'Certificacion en proyecto educativo aplicado',
        descripcion: 'Cierra la ruta con cursos avanzados y productos acreditables.',
        cursoIds: sugeridos.slice(8, 12).map(c => c.id),
      },
    ]);
  };

  const chipStyle = (active = false): React.CSSProperties => ({
    border: `1px solid ${active ? ACCENT : border}`,
    background: active ? 'rgba(0,107,94,0.12)' : (isDark ? '#0f172a' : '#f8fafc'),
    color: active ? ACCENT : text,
    borderRadius: 8,
    padding: '7px 10px',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
  });

  return (
    <div style={{ minHeight: '100%', background: bg, color: text, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Sparkles size={18} color={ACCENT} />
            <span style={{ fontSize: 10, fontWeight: 900, color: ACCENT, textTransform: 'uppercase', letterSpacing: 1 }}>
              Constructor academico
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: isDark ? '#dbeafe' : NAVY }}>
            Certificaciones graduales
          </h1>
          <p style={{ margin: '4px 0 0', color: muted, fontSize: 13 }}>
            Datos cargados desde XLSM: {programa.sourceFile}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={programCode}
            onChange={e => { setProgramCode(e.target.value); reset(); }}
            style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '9px 12px', background: card, color: text, fontWeight: 800, fontSize: 12 }}
          >
            {CERTIFICACIONES_PROGRAMAS.map(p => <option key={p.code} value={p.code}>{p.code} - {p.program}</option>)}
          </select>
          <button onClick={reset} style={chipStyle()}>
            <RotateCcw size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Reiniciar
          </button>
          <button onClick={applySuggestion} style={{ ...chipStyle(true), background: ACCENT, color: '#fff' }}>
            <Sparkles size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Sugerir estructura
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {[
          ['Programa', programa.program],
          ['Cursos en malla', programa.totalCursos],
          ['Creditos totales', programa.totalCreditos],
          ['Avance', `${assignedCount}/12 cursos`],
        ].map(([label, value]) => (
          <div key={label} style={{ background: card, border: `1px solid ${border}`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.8, color: muted }}>{label}</div>
            <div style={{ marginTop: 4, fontSize: 18, fontWeight: 900, color: label === 'Avance' ? ACCENT : text, lineHeight: 1.2 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr) 300px', gap: 12, alignItems: 'stretch' }}>
        <section style={{ background: card, border: `1px solid ${border}`, borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 620 }}>
          <div style={{ padding: 14, borderBottom: `1px solid ${border}` }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: isDark ? '#dbeafe' : NAVY }}>Cursos disponibles</h2>
            <div style={{ position: 'relative', marginTop: 10 }}>
              <Search size={15} color={muted} style={{ position: 'absolute', left: 10, top: 10 }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar curso..."
                style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${border}`, borderRadius: 8, padding: '9px 10px 9px 32px', background: isDark ? '#0f172a' : '#f8fafc', color: text, fontSize: 12 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              <button onClick={() => setCycleFilter('todos')} style={chipStyle(cycleFilter === 'todos')}>Todos</button>
              {ciclos.map(ciclo => (
                <button key={ciclo} onClick={() => setCycleFilter(String(ciclo))} style={chipStyle(cycleFilter === String(ciclo))}>{ciclo}</button>
              ))}
            </div>
          </div>
          <div style={{ padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cursosFiltrados.map(curso => {
              const selected = selectedIds.has(curso.id);
              return (
                <button
                  key={curso.id}
                  disabled={selected || !canEdit}
                  onClick={() => addCurso(curso.id)}
                  style={{
                    textAlign: 'left',
                    border: `1px solid ${selected ? 'rgba(0,107,94,0.35)' : border}`,
                    background: selected ? 'rgba(0,107,94,0.08)' : (isDark ? '#0f172a' : '#ffffff'),
                    color: text,
                    borderRadius: 8,
                    padding: 10,
                    cursor: selected ? 'default' : 'pointer',
                    opacity: selected ? 0.58 : 1,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: ACCENT }}>{curso.codigoOficial || curso.codigoCurso || 'ELEC'}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: muted }}>{cycleName(curso.ciclo)}</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, lineHeight: 1.25 }}>{curso.nombre}</div>
                  <div style={{ marginTop: 7, display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10, color: muted }}>
                    <span>{curso.creditos} cr. · {curso.condicion}</span>
                    <span style={{ color: scoreCurso(curso) >= 80 ? ACCENT : muted, fontWeight: 800 }}>{scoreCurso(curso)}% afinidad</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {slots.map((slot, idx) => {
            const pct = Math.min(100, Math.round(slot.cursoIds.length / 4 * 100));
            const selectedCursos = slot.cursoIds.map(id => cursoById.get(id)).filter(Boolean) as CertificacionesCurso[];
            const maxCycle = selectedCursos.length ? Math.max(...selectedCursos.map(c => c.ciclo)) : null;
            return (
              <div key={idx} style={{ background: card, border: `1px solid ${border}`, borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', minHeight: 620 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: idx === 0 ? ACCENT : NAVY, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{idx + 1}</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color: pct === 100 ? ACCENT : muted }}>{slot.cursoIds.length}/4 cursos</span>
                </div>
                <input
                  value={slot.nombre}
                  onChange={e => updateSlot(idx, { nombre: e.target.value })}
                  style={{ border: 'none', borderBottom: `1px dashed ${border}`, background: 'transparent', color: text, fontSize: 15, fontWeight: 900, padding: '0 0 8px', outline: 'none' }}
                />
                <textarea
                  value={slot.descripcion}
                  onChange={e => updateSlot(idx, { descripcion: e.target.value })}
                  placeholder="Descripcion de competencia laboral..."
                  style={{ marginTop: 8, height: 58, resize: 'none', border: `1px solid ${border}`, borderRadius: 8, background: isDark ? '#0f172a' : '#f8fafc', color: text, padding: 9, fontSize: 11, lineHeight: 1.4 }}
                />
                <div style={{ height: 6, borderRadius: 999, background: isDark ? '#334155' : '#e2e8f0', margin: '12px 0', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? ACCENT : '#38bdf8', transition: 'width .2s' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  {[0, 1, 2, 3].map(slotPos => {
                    const curso = selectedCursos[slotPos];
                    return curso ? (
                      <div key={curso.id} style={{ border: `1px solid ${border}`, borderRadius: 8, padding: 10, background: isDark ? '#0f172a' : '#f8fafc' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 10, color: ACCENT, fontWeight: 900 }}>{curso.codigoOficial || curso.codigoCurso}</span>
                          <button onClick={() => removeCurso(idx, curso.id)} title="Quitar curso" style={{ border: 'none', background: 'transparent', color: muted, cursor: 'pointer', padding: 0 }}>
                            <X size={14} />
                          </button>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.25 }}>{curso.nombre}</div>
                        <div style={{ marginTop: 6, fontSize: 10, color: muted }}>{cycleName(curso.ciclo)} · {curso.creditos} cr.</div>
                      </div>
                    ) : (
                      <div key={slotPos} style={{ border: `1.5px dashed ${border}`, borderRadius: 8, minHeight: 68, display: 'grid', placeItems: 'center', color: muted, fontSize: 11, fontWeight: 800 }}>
                        Curso {slotPos + 1}
                      </div>
                    );
                  })}
                </div>
                <div style={{ borderTop: `1px solid ${border}`, marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: muted }}>
                  <span>Obtencion est.</span>
                  <strong style={{ color: text }}>{maxCycle ? cycleName(maxCycle) : '--'}</strong>
                </div>
              </div>
            );
          })}
        </section>

        <aside style={{ background: NAVY, color: '#fff', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 620 }}>
          <div style={{ padding: 16, borderBottom: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lightbulb size={18} color="#7af7e1" />
            <strong style={{ fontSize: 15 }}>Analisis del XLSM</strong>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
            <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#7af7e1', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.7 }}>
                <FileSpreadsheet size={14} /> Fuente
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.45, color: 'rgba(255,255,255,0.78)' }}>
                La hoja 15 de certificaciones laborales esta como plantilla sin cursos definidos. La construccion se alimenta con el plan de estudios y las menciones del mismo archivo.
              </p>
            </div>

            <div style={{ background: allComplete ? 'rgba(122,247,225,0.16)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(122,247,225,0.22)', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="#7af7e1" />
                <strong style={{ fontSize: 13 }}>{allComplete ? 'Propuesta completa' : 'Propuesta en progreso'}</strong>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.76)', lineHeight: 1.45 }}>
                Completa 4 cursos por certificacion para cerrar una ruta gradual de 12 cursos.
              </p>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#7af7e1', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 }}>
                Menciones de referencia
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {mencionesVisibles.map(mencion => (
                  <div key={mencion.nombre} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 900 }}>{mencion.nombre}</div>
                    <div style={{ marginTop: 5, color: 'rgba(255,255,255,0.68)', fontSize: 10 }}>{mencion.cursos.length} cursos · ciclos {mencion.cursos[0]?.ciclo ?? '-'}-{mencion.cursos[mencion.cursos.length - 1]?.ciclo ?? '-'}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-start', gap: 8, color: 'rgba(255,255,255,0.72)', fontSize: 11, lineHeight: 1.45 }}>
              <BookOpen size={15} color="#7af7e1" />
              <span>{programa.grado}. {programa.titulo}. Modalidad {programa.modalidad}.</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default CertificacionesGradualesView;
