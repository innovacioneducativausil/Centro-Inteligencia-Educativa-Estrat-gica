import { Router } from 'express';
import { serverError } from '../middleware/errorHandler.js';
import { adminOrAnalyst } from '../middleware/roles.js';
import logger from '../logger.js';
import {
  countRelacionesTopico,
  getCadenaTopico,
  getElementosPublicadosByTopico,
  getRelacionesTopico,
  getTopicoById,
  getTopicosConElementosActivos,
  saveRelacionInferida,
} from '../repositories/principal/cadenaRepository.js';

const router = Router();

router.get('/cadena-causal', async (_req, res) => {
  try {
    const topicos = await getTopicosConElementosActivos();

    const result = await Promise.all(topicos.map(async (tp) => {
      const { senales, tendencias, escenarios, relST, relSE, relTE } = await getCadenaTopico(tp.id_topico);

      return {
        idTopico: tp.id_topico,
        nombre: tp.nombre,
        senales: senales.map(r => ({
          uuid: r.uuid,
          titulo: r.titulo,
          descCorta: r.descCorta,
          urlImagen: r.urlImagen,
          fuente: r.fuente,
          urlFuente: r.urlFuente,
          pestel: r.pestel,
          color: r.color,
        })),
        tendencias: tendencias.map(r => ({
          uuid: r.uuid,
          titulo: r.titulo,
          descCorta: r.descCorta,
          pestel: r.pestel,
          color: r.color,
        })),
        escenarios: escenarios.map(r => ({
          uuid: r.uuid,
          titulo: r.titulo,
          descCorta: r.descCorta,
          probabilidad: r.probabilidad,
          pestel: r.pestel,
          color: r.color,
        })),
        relaciones: [
          ...relST.map(r => ({ tipo: 'senal_tendencia', idA: String(r.idSenal), idB: String(r.idTendencia) })),
          ...relSE.map(r => ({ tipo: 'senal_escenario', idA: String(r.idSenal), idB: String(r.idEscenario) })),
          ...relTE.map(r => ({ tipo: 'tendencia_escenario', idA: String(r.idTendencia), idB: String(r.idEscenario) })),
        ],
      };
    }));

    const filtered = result.filter(t => t.senales.length > 0 || t.tendencias.length > 0 || t.escenarios.length > 0);
    res.json({ data: filtered });
  } catch (err) {
    serverError(res, err, 'GET /cadena-causal');
  }
});

const STOPS = new Set([
  'the', 'a', 'an', 'in', 'of', 'for', 'to', 'and', 'or', 'is', 'are', 'with', 'by', 'as', 'at', 'on',
  'that', 'this', 'their', 'they', 'have', 'been', 'will', 'from', 'but', 'not', 'more', 'its',
  'la', 'el', 'de', 'en', 'y', 'los', 'las', 'un', 'una', 'del', 'al', 'que', 'se', 'su', 'por',
  'con', 'para', 'como', 'mas', 'sin', 'sobre', 'entre', 'hacia', 'hasta', 'cuando', 'donde',
]);

function tokens(text) {
  return (text || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPS.has(w));
}

async function inferWithGroq({ topico, senales, tendencias, escenarios }) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || (senales.length + tendencias.length + escenarios.length) < 2) return [];

  const prompt = `Eres un analista de prospectiva. Dado el topico "${topico.nombre}", conecta senales -> tendencias -> escenarios segun su relacion tematica.

SENALES:
${senales.map(s => `  uuid:${s.uuid} | "${s.titulo}" | ${s.descCorta || ''}`).join('\n') || '  (ninguna)'}

TENDENCIAS:
${tendencias.map(t => `  uuid:${t.uuid} | "${t.titulo}" | ${t.descCorta || ''}`).join('\n') || '  (ninguna)'}

ESCENARIOS:
${escenarios.map(e => `  uuid:${e.uuid} | "${e.titulo}" | ${e.descCorta || ''}`).join('\n') || '  (ninguno)'}

Reglas:
- senal_tendencia: conecta senales con las tendencias que representan
- tendencia_escenario: conecta tendencias con los escenarios que proyectan
- senal_escenario: solo si no hay tendencias o el escenario queda huerfano
- Cada elemento debe aparecer al menos una vez; no inventar UUIDs

Responde SOLO JSON valido:
{"relaciones":[{"tipo":"senal_tendencia","idA":"uuid-senal","idB":"uuid-tendencia"}]}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.2,
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed.relaciones) ? parsed.relaciones : [];
  } catch (err) {
    logger.warn(err?.message || 'IA fallo, usando keyword fallback.', {
      context: 'cadena-causal/inferir',
      stack: err?.stack,
    });
    return [];
  }
}

function inferWithKeywords({ senales, tendencias, escenarios }) {
  const inferred = [];

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
      let bestS = senales[0];
      let bestScore = 0;
      const ew = new Set(tokens(`${e.titulo} ${e.descCorta || ''}`));
      for (const s of senales) {
        const score = tokens(`${s.titulo} ${s.descCorta || ''}`).filter(w => ew.has(w)).length;
        if (score > bestScore) {
          bestScore = score;
          bestS = s;
        }
      }
      if (bestS) inferred.push({ tipo: 'senal_escenario', idA: String(bestS.uuid), idB: String(e.uuid) });
    }
  }

  return inferred;
}

router.post('/cadena-causal/:idTopico/relaciones/inferir', adminOrAnalyst, async (req, res) => {
  const idTopico = parseInt(req.params.idTopico, 10);
  if (!idTopico) return res.status(400).json({ error: 'idTopico invalido' });

  try {
    const topico = await getTopicoById(idTopico);
    if (!topico) return res.status(404).json({ error: 'Topico no encontrado' });

    const { senales, tendencias, escenarios } = await getElementosPublicadosByTopico(idTopico);
    const existing = await countRelacionesTopico(idTopico);

    if (existing > 0) {
      return res.json({
        relaciones: await getRelacionesTopico(idTopico),
        created: 0,
        message: 'Ya existen relaciones para este topico',
      });
    }

    if (!senales.length && !tendencias.length && !escenarios.length) {
      return res.status(400).json({ error: 'El topico no tiene elementos publicados' });
    }

    let inferred = await inferWithGroq({ topico, senales, tendencias, escenarios });
    if (!inferred.length) inferred = inferWithKeywords({ senales, tendencias, escenarios });

    const senalIdSet = new Set(senales.map(s => String(s.uuid)));
    const tendIdSet = new Set(tendencias.map(t => String(t.uuid)));
    const escIdSet = new Set(escenarios.map(e => String(e.uuid)));

    let created = 0;
    const savedRels = [];
    for (const rel of inferred) {
      const idA = String(rel.idA);
      const idB = String(rel.idB);
      const isValid =
        (rel.tipo === 'senal_tendencia' && senalIdSet.has(idA) && tendIdSet.has(idB)) ||
        (rel.tipo === 'tendencia_escenario' && tendIdSet.has(idA) && escIdSet.has(idB)) ||
        (rel.tipo === 'senal_escenario' && senalIdSet.has(idA) && escIdSet.has(idB));

      if (!isValid) {
        logger.warn(`Relacion ignorada por IDs invalidos: tipo=${rel.tipo} idA=${rel.idA} idB=${rel.idB}`, {
          context: 'cadena-causal/inferir',
        });
        continue;
      }

      try {
        await saveRelacionInferida(rel);
        savedRels.push(rel);
        created++;
      } catch (err) {
        logger.warn(err?.message || 'No se pudo guardar relacion inferida.', {
          context: 'cadena-causal/inferir',
          stack: err?.stack,
        });
      }
    }

    logger.info(`Topico=${idTopico} (${topico.nombre}): ${created}/${inferred.length} relaciones guardadas`, {
      context: 'cadena-causal/inferir',
    });
    res.json({ relaciones: savedRels, created, message: `${created} relaciones guardadas` });
  } catch (err) {
    serverError(res, err, 'POST /cadena-causal/inferir');
  }
});

export default router;
