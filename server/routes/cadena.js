// server/routes/cadena.js — Cadena Causal por tópico
// Devuelve señales, tendencias y escenarios de cada tópico con sus relaciones
import { serverError } from '../middleware/errorHandler.js';
import { Router } from 'express';
import db from '../db.js';
import { adminOrAnalyst } from '../middleware/roles.js';

const router = Router();

/**
 * GET /api/cadena-causal
 * Devuelve todos los tópicos con sus señales, tendencias, escenarios y relaciones.
 */
router.get('/cadena-causal', async (req, res) => {
  try {
    // 1) Todos los tópicos que tienen al menos un elemento publicado
    const [topicos] = await db.query(`
      SELECT DISTINCT tp.id_topico, tp.nombre
      FROM topico tp
      WHERE EXISTS (SELECT 1 FROM senal s     WHERE s.id_topico = tp.id_topico AND s.id_estado = 1)
         OR EXISTS (SELECT 1 FROM tendencia t WHERE t.id_topico = tp.id_topico AND t.id_estado = 1)
         OR EXISTS (SELECT 1 FROM escenario e WHERE e.id_topico = tp.id_topico AND e.id_estado = 1)
      ORDER BY tp.nombre
    `);

    const result = await Promise.all(topicos.map(async (tp) => {
      const id = tp.id_topico;

      // 2) Señales del tópico
      const [senales] = await db.query(`
        SELECT s.id_senal AS uuid, s.titulo_senal AS titulo, s.desc_corta_senal AS descCorta,
               s.url_imagen_senal AS urlImagen, s.fuente_senal AS fuente, s.url_fuente AS urlFuente,
               MIN(p.nombre_pestel) AS pestel, MIN(p.color) AS color
        FROM senal s
        LEFT JOIN senal_pestel sp ON s.id_senal = sp.id_senal
        LEFT JOIN pestel p        ON sp.id_pestel = p.id_pestel AND p.activo = 1
        WHERE s.id_topico = ? AND s.id_estado = 1
        GROUP BY s.id_senal
        ORDER BY s.fecha_publicacion DESC
      `, [id]);

      // 3) Tendencias del tópico
      const [tendencias] = await db.query(`
        SELECT t.id_tendencia AS uuid, t.titulo_tendencia AS titulo, t.desc_corta_tendencia AS descCorta,
               MIN(p.nombre_pestel) AS pestel, MIN(p.color) AS color
        FROM tendencia t
        LEFT JOIN tendencia_pestel tp2 ON t.id_tendencia = tp2.id_tendencia
        LEFT JOIN pestel p             ON tp2.id_pestel = p.id_pestel AND p.activo = 1
        WHERE t.id_topico = ? AND t.id_estado = 1
        GROUP BY t.id_tendencia
        ORDER BY t.fecha_publicacion DESC
      `, [id]);

      // 4) Escenarios del tópico
      const [escenarios] = await db.query(`
        SELECT e.id_escenario AS uuid, e.titulo_escenario AS titulo, e.desc_corta_escenario AS descCorta,
               e.probabilidad,
               MIN(p.nombre_pestel) AS pestel, MIN(p.color) AS color
        FROM escenario e
        LEFT JOIN escenario_pestel ep ON e.id_escenario = ep.id_escenario
        LEFT JOIN pestel p            ON ep.id_pestel = p.id_pestel AND p.activo = 1
        WHERE e.id_topico = ? AND e.id_estado = 1
        GROUP BY e.id_escenario
        ORDER BY e.fecha_publicacion DESC
      `, [id]);

      // 5) Relaciones señal → tendencia
      const [relST] = await db.query(`
        SELECT s.id_senal AS idSenal, t.id_tendencia AS idTendencia
        FROM senal_tendencia st
        JOIN senal s     ON st.id_senal     = s.id_senal     AND s.id_topico  = ? AND s.id_estado = 1
        JOIN tendencia t ON st.id_tendencia = t.id_tendencia AND t.id_topico  = ? AND t.id_estado = 1
      `, [id, id]);

      // 6) Relaciones señal → escenario
      const [relSE] = await db.query(`
        SELECT s.id_senal AS idSenal, e.id_escenario AS idEscenario
        FROM senal_escenario se
        JOIN senal s    ON se.id_senal    = s.id_senal    AND s.id_topico = ? AND s.id_estado = 1
        JOIN escenario e ON se.id_escenario = e.id_escenario AND e.id_topico = ? AND e.id_estado = 1
      `, [id, id]);

      // 7) Relaciones tendencia → escenario
      const [relTE] = await db.query(`
        SELECT t.id_tendencia AS idTendencia, e.id_escenario AS idEscenario
        FROM tendencia_escenario te
        JOIN tendencia t ON te.id_tendencia = t.id_tendencia AND t.id_topico = ? AND t.id_estado = 1
        JOIN escenario e ON te.id_escenario = e.id_escenario AND e.id_topico = ? AND e.id_estado = 1
      `, [id, id]);

      return {
        idTopico:   id,
        nombre:     tp.nombre,
        senales:    senales.map(r => ({ uuid: r.uuid, titulo: r.titulo, descCorta: r.descCorta, urlImagen: r.urlImagen, fuente: r.fuente, urlFuente: r.urlFuente, pestel: r.pestel, color: r.color })),
        tendencias: tendencias.map(r => ({ uuid: r.uuid, titulo: r.titulo, descCorta: r.descCorta, pestel: r.pestel, color: r.color })),
        escenarios: escenarios.map(r => ({ uuid: r.uuid, titulo: r.titulo, descCorta: r.descCorta, probabilidad: r.probabilidad, pestel: r.pestel, color: r.color })),
        relaciones: [
          ...relST.map(r => ({ tipo: 'senal_tendencia',     idA: String(r.idSenal),     idB: String(r.idTendencia)  })),
          ...relSE.map(r => ({ tipo: 'senal_escenario',     idA: String(r.idSenal),     idB: String(r.idEscenario)  })),
          ...relTE.map(r => ({ tipo: 'tendencia_escenario', idA: String(r.idTendencia), idB: String(r.idEscenario)  })),
        ],
      };
    }));

    // Solo devolver tópicos con al menos 1 elemento en cada columna
    const filtered = result.filter(t => t.senales.length > 0 || t.tendencias.length > 0 || t.escenarios.length > 0);
    res.json({ data: filtered });

  } catch (err) {
    console.error('[GET /cadena-causal]', err);
    serverError(res, err);
  }
});

// ── Stopwords para inferencia por keywords (sin IA) ─────────────────────────
const STOPS = new Set([
  'the','a','an','in','of','for','to','and','or','is','are','with','by','as','at','on',
  'that','this','their','they','have','been','will','from','but','not','more','its',
  'la','el','de','en','y','los','las','un','una','del','al','que','se','su','por',
  'con','para','como','más','sin','sobre','entre','hacia','hasta','cuando','donde',
]);
function tokens(text) {
  return (text || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPS.has(w));
}

/**
 * POST /api/cadena-causal/:idTopico/relaciones/inferir
 * Infiere relaciones para un tópico que no las tiene y las guarda en BD.
 * Usa Groq (si GROQ_API_KEY está configurado) o keyword-matching como fallback.
 */
router.post('/cadena-causal/:idTopico/relaciones/inferir', adminOrAnalyst, async (req, res) => {
  const idTopico = parseInt(req.params.idTopico);
  if (!idTopico) return res.status(400).json({ error: 'idTopico inválido' });

  try {
    // 1) Verificar que el tópico existe
    const [[tp]] = await db.query('SELECT id_topico, nombre FROM topico WHERE id_topico = ? LIMIT 1', [idTopico]);
    if (!tp) return res.status(404).json({ error: 'Tópico no encontrado' });

    // 2) Señales, tendencias, escenarios publicados
    const [[senales], [tendencias], [escenarios]] = await Promise.all([
      db.query('SELECT id_senal AS uuid, titulo_senal AS titulo, desc_corta_senal AS descCorta FROM senal WHERE id_topico=? AND id_estado=1', [idTopico]),
      db.query('SELECT id_tendencia AS uuid, titulo_tendencia AS titulo, desc_corta_tendencia AS descCorta FROM tendencia WHERE id_topico=? AND id_estado=1', [idTopico]),
      db.query('SELECT id_escenario AS uuid, titulo_escenario AS titulo, desc_corta_escenario AS descCorta FROM escenario WHERE id_topico=? AND id_estado=1', [idTopico]),
    ]);

    // 3) Si ya hay relaciones, devolverlas sin hacer nada
    const [[cntST], [cntSE], [cntTE]] = await Promise.all([
      db.query(`SELECT COUNT(*) AS n FROM senal_tendencia st
        JOIN senal s ON st.id_senal=s.id_senal WHERE s.id_topico=?`, [idTopico]),
      db.query(`SELECT COUNT(*) AS n FROM senal_escenario se
        JOIN senal s ON se.id_senal=s.id_senal WHERE s.id_topico=?`, [idTopico]),
      db.query(`SELECT COUNT(*) AS n FROM tendencia_escenario te
        JOIN tendencia t ON te.id_tendencia=t.id_tendencia WHERE t.id_topico=?`, [idTopico]),
    ]);
    const existing = (cntST[0]?.n || 0) + (cntSE[0]?.n || 0) + (cntTE[0]?.n || 0);
    if (existing > 0) {
      const [relST] = await db.query(`SELECT s.id_senal AS idA, t.id_tendencia AS idB FROM senal_tendencia st JOIN senal s ON st.id_senal=s.id_senal JOIN tendencia t ON st.id_tendencia=t.id_tendencia WHERE s.id_topico=? AND t.id_topico=?`, [idTopico,idTopico]);
      const [relSE] = await db.query(`SELECT s.id_senal AS idA, e.id_escenario AS idB FROM senal_escenario se JOIN senal s ON se.id_senal=s.id_senal JOIN escenario e ON se.id_escenario=e.id_escenario WHERE s.id_topico=? AND e.id_topico=?`, [idTopico,idTopico]);
      const [relTE] = await db.query(`SELECT t.id_tendencia AS idA, e.id_escenario AS idB FROM tendencia_escenario te JOIN tendencia t ON te.id_tendencia=t.id_tendencia JOIN escenario e ON te.id_escenario=e.id_escenario WHERE t.id_topico=? AND e.id_topico=?`, [idTopico,idTopico]);
      return res.json({
        relaciones: [
          ...relST.map(r => ({ tipo: 'senal_tendencia',     idA: r.idA, idB: r.idB })),
          ...relSE.map(r => ({ tipo: 'senal_escenario',     idA: r.idA, idB: r.idB })),
          ...relTE.map(r => ({ tipo: 'tendencia_escenario', idA: r.idA, idB: r.idB })),
        ],
        created: 0,
        message: 'Ya existen relaciones para este tópico',
      });
    }

    if (!senales.length && !tendencias.length && !escenarios.length) {
      return res.status(400).json({ error: 'El tópico no tiene elementos publicados' });
    }

    // 4) Inferir relaciones — con IA si hay GROQ_API_KEY, sino por keywords
    let inferred = []; // [{ tipo, idA, idB }]

    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey && (senales.length + tendencias.length + escenarios.length) >= 2) {
      try {
        const prompt = `Eres un analista de prospectiva. Dado el tópico "${tp.nombre}", conecta señales → tendencias → escenarios según su relación temática.

SEÑALES:
${senales.map(s => `  uuid:${s.uuid} | "${s.titulo}" | ${s.descCorta || ''}`).join('\n') || '  (ninguna)'}

TENDENCIAS:
${tendencias.map(t => `  uuid:${t.uuid} | "${t.titulo}" | ${t.descCorta || ''}`).join('\n') || '  (ninguna)'}

ESCENARIOS:
${escenarios.map(e => `  uuid:${e.uuid} | "${e.titulo}" | ${e.descCorta || ''}`).join('\n') || '  (ninguno)'}

Reglas:
- senal_tendencia: conecta señales con las tendencias que representan (puede ser 1 señal → varias tendencias)
- tendencia_escenario: conecta tendencias con los escenarios que proyectan
- senal_escenario: solo si NO hay tendencias o el escenario queda huérfano (sin tendencia que lo conecte)
- Cada elemento debe aparecer al menos una vez; no inventar UUIDs

Responde SOLO JSON válido:
{"relaciones":[{"tipo":"senal_tendencia","idA":"uuid-senal","idB":"uuid-tendencia"}]}`;

        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 800, temperature: 0.2,
          }),
        });
        if (r.ok) {
          const data = await r.json();
          const text = data.choices?.[0]?.message?.content || '';
          const m = text.match(/\{[\s\S]*\}/);
          if (m) {
            const parsed = JSON.parse(m[0]);
            inferred = Array.isArray(parsed.relaciones) ? parsed.relaciones : [];
          }
        }
      } catch (aiErr) {
        console.warn('[inferir] IA falló, usando keyword fallback:', aiErr.message);
        inferred = [];
      }
    }

    // Fallback: keyword matching
    if (!inferred.length) {
      // Keyword fallback — todos los IDs como strings para consistencia
      // señal → tendencia
      for (const s of senales) {
        const sw = new Set(tokens(`${s.titulo} ${s.descCorta || ''}`));
        let connected = false;
        for (const t of tendencias) {
          if (tokens(`${t.titulo} ${t.descCorta || ''}`).some(w => sw.has(w))) {
            inferred.push({ tipo: 'senal_tendencia', idA: String(s.uuid), idB: String(t.uuid) });
            connected = true;
          }
        }
        if (!connected && tendencias.length > 0) {
          inferred.push({ tipo: 'senal_tendencia', idA: String(s.uuid), idB: String(tendencias[0].uuid) });
        }
      }
      // tendencia → escenario
      for (const t of tendencias) {
        const tw = new Set(tokens(`${t.titulo} ${t.descCorta || ''}`));
        let connected = false;
        for (const e of escenarios) {
          if (tokens(`${e.titulo} ${e.descCorta || ''}`).some(w => tw.has(w))) {
            inferred.push({ tipo: 'tendencia_escenario', idA: String(t.uuid), idB: String(e.uuid) });
            connected = true;
          }
        }
        if (!connected && escenarios.length > 0) {
          inferred.push({ tipo: 'tendencia_escenario', idA: String(t.uuid), idB: String(escenarios[0].uuid) });
        }
      }
      // señal → escenario (solo si no hay tendencias o escenario huérfano)
      const connectedEscIds = new Set(inferred.filter(r => r.tipo === 'tendencia_escenario').map(r => r.idB));
      if (tendencias.length === 0) {
        for (const s of senales) {
          const sw = new Set(tokens(`${s.titulo} ${s.descCorta || ''}`));
          let connected = false;
          for (const e of escenarios) {
            if (tokens(`${e.titulo} ${e.descCorta || ''}`).some(w => sw.has(w))) {
              inferred.push({ tipo: 'senal_escenario', idA: String(s.uuid), idB: String(e.uuid) });
              connected = true;
            }
          }
          if (!connected && escenarios.length > 0) {
            inferred.push({ tipo: 'senal_escenario', idA: String(s.uuid), idB: String(escenarios[0].uuid) });
          }
        }
      } else {
        for (const e of escenarios) {
          if (connectedEscIds.has(String(e.uuid))) continue;
          let bestS = senales[0]; let bestScore = 0;
          const ew = new Set(tokens(`${e.titulo} ${e.descCorta || ''}`));
          for (const s of senales) {
            const sc = tokens(`${s.titulo} ${s.descCorta || ''}`).filter(w => ew.has(w)).length;
            if (sc > bestScore) { bestScore = sc; bestS = s; }
          }
          if (bestS) inferred.push({ tipo: 'senal_escenario', idA: String(bestS.uuid), idB: String(e.uuid) });
        }
      }
    }

    // 5) Validar IDs y guardar en BD
    // Nota: los IDs vienen como enteros de MySQL; String() normaliza la comparación
    // sin importar si Groq devuelve strings o el fallback devuelve números.
    const senalIdSet = new Set(senales.map(s  => String(s.uuid)));
    const tendIdSet  = new Set(tendencias.map(t => String(t.uuid)));
    const escIdSet   = new Set(escenarios.map(e => String(e.uuid)));

    let created = 0;
    const savedRels = [];
    for (const rel of inferred) {
      const idA = String(rel.idA);
      const idB = String(rel.idB);
      try {
        if (rel.tipo === 'senal_tendencia' && senalIdSet.has(idA) && tendIdSet.has(idB)) {
          await db.query('INSERT IGNORE INTO senal_tendencia (id_senal, id_tendencia) VALUES (?,?)', [rel.idA, rel.idB]);
          savedRels.push(rel); created++;
        } else if (rel.tipo === 'tendencia_escenario' && tendIdSet.has(idA) && escIdSet.has(idB)) {
          await db.query('INSERT IGNORE INTO tendencia_escenario (id_tendencia, id_escenario) VALUES (?,?)', [rel.idA, rel.idB]);
          savedRels.push(rel); created++;
        } else if (rel.tipo === 'senal_escenario' && senalIdSet.has(idA) && escIdSet.has(idB)) {
          await db.query('INSERT IGNORE INTO senal_escenario (id_senal, id_escenario) VALUES (?,?)', [rel.idA, rel.idB]);
          savedRels.push(rel); created++;
        } else {
          console.warn(`[inferir] relación ignorada (IDs inválidos): tipo=${rel.tipo} idA=${rel.idA} idB=${rel.idB}`);
        }
      } catch (e) { console.warn('[inferir] INSERT error:', e.message); }
    }

    console.log(`[inferir] tópico=${idTopico} (${tp.nombre}): ${created}/${inferred.length} relaciones guardadas`);
    res.json({ relaciones: savedRels, created, message: `${created} relaciones guardadas` });

  } catch (err) {
    console.error('[POST /cadena-causal/inferir]', err);
    serverError(res, err);
  }
});

export default router;
