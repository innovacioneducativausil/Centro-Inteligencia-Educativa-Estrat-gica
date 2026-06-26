

import { Router }     from 'express';
import { randomUUID } from 'crypto';
import db             from '../db.js';
import { serverError } from '../middleware/errorHandler.js';
import { sanitizeRichHtml } from '../utils/security.js';
import { ensureRadarSchemaSupport } from '../services/schemaMaintenance.js';

const router = Router();

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador o analista.' });
    }
    next();
  };
}
const adminOnly = requireRole('admin', 'analista');


function serializeUrlFuentes(urlsFuente, fallbackUrl) {
  const arr = Array.isArray(urlsFuente)
    ? urlsFuente.filter(u => u?.trim())
    : (fallbackUrl?.trim() ? [fallbackUrl.trim()] : []);
  return arr.length ? JSON.stringify(arr) : null;
}

const TYPE_CFG = {
  senal:      { table: 'senal',     id: 'id_senal',     title: 'titulo_senal',     name: 'nombre_senal',     short: 'desc_corta_senal',     long: 'desc_larga_senal',     source: 'fuente_senal',     url: 'url_fuente', img: 'url_imagen_senal',     video: 'url_video_senal',     topico: 'id_topico' },
  tendencia: { table: 'tendencia', id: 'id_tendencia', title: 'titulo_tendencia', name: 'nombre_tendencia', short: 'desc_corta_tendencia', long: 'desc_larga_tendencia', source: 'fuente_tendencia', url: 'url_fuente', img: 'url_imagen_tendencia', video: 'url_video_tendencia', topico: 'id_topico' },
  escenario: { table: 'escenario', id: 'id_escenario', title: 'titulo_escenario', name: 'nombre_escenario', short: 'desc_corta_escenario', long: 'desc_larga_escenario', source: 'fuente_escenario', url: 'url_fuente', img: 'url_imagen_escenario', video: 'url_video_escenario', topico: 'id_topico' },
};

function normalizeComparable(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a = '', b = '') {
  const aw = new Set(normalizeComparable(a).split(' ').filter(w => w.length > 2));
  const bw = new Set(normalizeComparable(b).split(' ').filter(w => w.length > 2));
  if (!aw.size || !bw.size) return 0;
  let common = 0;
  for (const w of aw) if (bw.has(w)) common++;
  return common / Math.max(aw.size, bw.size);
}

function firstUrl(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (raw.startsWith('[')) {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? String(arr[0] || '') : '';
    } catch { return ''; }
  }
  return raw;
}

function findBestExisting(proposal, existingRows) {
  const url = firstUrl(proposal.urlFuente || (Array.isArray(proposal.urlsFuente) ? proposal.urlsFuente[0] : ''));
  const title = proposal.titulo || '';
  const name = proposal.nombre || '';

  let best = null;
  for (const row of existingRows) {
    const rowUrl = firstUrl(row.url);
    let score = 0;
    const reasons = [];

    if (url && rowUrl && normalizeComparable(url) === normalizeComparable(rowUrl)) {
      score = 1;
      reasons.push('misma URL');
    }

    const titleScore = similarity(title, row.titulo);
    const nameScore = similarity(name, row.nombre);
    const textScore = Math.max(titleScore, nameScore);
    if (textScore >= 0.9) {
      score = Math.max(score, 0.95);
      reasons.push('título/nombre casi igual');
    } else if (textScore >= 0.72) {
      score = Math.max(score, 0.78);
      reasons.push('posible coincidencia por título');
    }

    if (!best || score > best.score) best = { row, score, reasons };
  }
  return best && best.score >= 0.72 ? best : null;
}

async function findDuplicateTitleOrName(tipo, titulo, nombre) {
  const cfg = {
    senal:      { table: 'senal',     id: 'id_senal',     title: 'titulo_senal',     name: 'nombre_senal' },
    tendencia: { table: 'tendencia', id: 'id_tendencia', title: 'titulo_tendencia', name: 'nombre_tendencia' },
    escenario: { table: 'escenario', id: 'id_escenario', title: 'titulo_escenario', name: 'nombre_escenario' },
  }[tipo];
  if (!cfg) return null;

  const [[dup]] = await db.query(
    `SELECT \`${cfg.id}\` AS id,
            \`${cfg.title}\` AS titulo,
            \`${cfg.name}\` AS nombre
       FROM \`${cfg.table}\`
      WHERE LOWER(TRIM(\`${cfg.title}\`)) = LOWER(TRIM(?))
         OR LOWER(TRIM(\`${cfg.title}\`)) = LOWER(TRIM(?))
         OR LOWER(TRIM(\`${cfg.name}\`)) = LOWER(TRIM(?))
         OR LOWER(TRIM(\`${cfg.name}\`)) = LOWER(TRIM(?))
      LIMIT 1`,
    [titulo, nombre, titulo, nombre]
  );
  if (!dup) return null;

  return { ...dup, field: 'titulo o nombre' };
}

async function loadExistingByTopic(topicoNombre) {
  if (!topicoNombre?.trim()) return { senal: [], tendencia: [], escenario: [] };
  const [[topico]] = await db.query(
    'SELECT id_topico FROM topico WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?)) LIMIT 1',
    [topicoNombre.trim()]
  );
  if (!topico) return { senal: [], tendencia: [], escenario: [] };

  const result = {};
  for (const [tipo, cfg] of Object.entries(TYPE_CFG)) {
    const [rows] = await db.query(
      `SELECT \`${cfg.id}\` AS id,
              \`${cfg.title}\` AS titulo,
              \`${cfg.name}\` AS nombre,
              \`${cfg.short}\` AS descCorta,
              \`${cfg.url}\` AS url
         FROM \`${cfg.table}\`
        WHERE \`${cfg.topico}\` = ?`,
      [topico.id_topico]
    );
    result[tipo] = rows;
  }
  return result;
}


router.get('/importar/topico-existe', adminOnly, async (req, res) => {
  try {
    const topico = String(req.query.topico || '').trim();
    if (!topico) return res.json({ exists: false, counts: { senal: 0, tendencia: 0, escenario: 0 } });

    const existing = await loadExistingByTopic(topico);
    const counts = {
      senal: existing.senal?.length || 0,
      tendencia: existing.tendencia?.length || 0,
      escenario: existing.escenario?.length || 0,
    };
    res.json({
      exists: Boolean(counts.senal || counts.tendencia || counts.escenario),
      counts,
    });
  } catch (err) {
    serverError(res, err);
  }
});

async function findOrCreateTopico(nombre) {
  if (!nombre?.trim()) return null;
  const n = nombre.trim();
  const [[existing]] = await db.query(
    'SELECT id_topico FROM topico WHERE LOWER(TRIM(nombre)) = LOWER(?)', [n]
  );
  if (existing) return existing.id_topico;
  const [result] = await db.query('INSERT INTO topico (nombre) VALUES (?)', [n]);
  return result.insertId;
}

router.post('/importar/revisar', adminOnly, async (req, res) => {
  try {
    const { topico = '', propuestas = [] } = req.body;
    if (!topico?.trim()) return res.status(400).json({ error: 'Ingresa un tópico para revisar.' });
    if (!Array.isArray(propuestas)) return res.status(400).json({ error: 'Las propuestas son inválidas.' });

    const existing = await loadExistingByTopic(topico);
    const items = propuestas.map(p => {
      const tipo = p.tipo;
      const match = TYPE_CFG[tipo] ? findBestExisting(p, existing[tipo] || []) : null;
      if (!match) {
        return {
          localId: p.id,
          tipo,
          accion: 'crear',
          estado: 'faltante',
          mensaje: 'No existe en la BD para este tópico',
          existing: null,
        };
      }
      const changed = similarity(p.descCorta || '', match.row.descCorta || '') < 0.92
        || normalizeComparable(p.titulo || '') !== normalizeComparable(match.row.titulo || '');
      return {
        localId: p.id,
        tipo,
        accion: changed ? 'actualizar' : 'ignorar',
        estado: changed ? 'diferente' : 'existente',
        mensaje: changed ? `Coincide con un registro existente: ${match.reasons.join(', ')}` : 'Ya existe sin diferencias principales',
        score: match.score,
        existing: {
          id: match.row.id,
          titulo: match.row.titulo,
          nombre: match.row.nombre,
          descCorta: match.row.descCorta,
        },
      };
    });

    const resumen = items.reduce((acc, item) => {
      acc[item.estado] = (acc[item.estado] || 0) + 1;
      return acc;
    }, {});

    res.json({ items, resumen });
  } catch (err) {
    serverError(res, err);
  }
});


router.post('/importar/confirmar', adminOnly, async (req, res) => {
  const { topico = '', fuente = '', urlFuente = '', propuestas, relaciones = [], modoRevision = false } = req.body;

  if (!Array.isArray(propuestas) || propuestas.length === 0) {
    return res.status(400).json({ error: 'No hay propuestas para confirmar.' });
  }
  await ensureRadarSchemaSupport();

  const usuarioId    = req.user.id;
  const creados      = [];
  const errores      = [];
  const omitidos      = [];


  let topicoIdDoc     = null;
  let topicoNombre    = topico.trim() || null;
  if (topicoNombre) {
    try {
      topicoIdDoc = await findOrCreateTopico(topicoNombre);
    } catch (err) {
      console.error('[IMPORTAR] Error creando tópico:', err);
    }
  }

  let topicoId = topicoIdDoc;


  const localToReal = new Map();

  for (const p of propuestas) {
    const {
      id: localId,
      tipo,
      titulo,
      nombre,
      descCorta,
      descLarga         = '',
      fuente:           fuenteItem,
      urlFuente:        urlFuenteItem,
      urlsFuente        = [],
      probabilidad,
      temasRelacionados = [],
      pestelId,
      sectorId,
      pestelIds = [],
      sectorIds = [],

      razonClasificacion = '',
      paisOrigen         = null,
      fechaArticulo      = null,
      lugar              = null,
      fechaMencionada    = null,
      horizonteTemporal  = null,
      urlImagen          = '',
      urlVideo           = '',

      topico:    topicoEscenario = '',
      referencias = [],
      tendenciasSoporte = [],
      autor             = null,
      syncAction        = null,
      existingId        = null,
    } = p;


    if (!tipo || !['senal', 'tendencia', 'escenario'].includes(tipo)) {
      errores.push({ id: localId, titulo: titulo || '(sin título)', error: `Tipo inválido: "${tipo}"` });
      continue;
    }
    if (!titulo?.trim() || !descCorta?.trim()) {
      errores.push({ id: localId, titulo: titulo || '(sin título)', error: 'El título y la descripción son obligatorios.' });
      continue;
    }

    const finalPestelIds = pestelIds.length > 0 ? pestelIds : (pestelId ? [pestelId] : []);
    const finalSectorIds = sectorIds.length > 0 ? sectorIds : (sectorId ? [sectorId] : []);

    if (finalPestelIds.length === 0 || finalSectorIds.length === 0) {
      errores.push({ id: localId, titulo: titulo.trim(), error: 'PESTEL y sector son obligatorios.' });
      continue;
    }

    const newId           = randomUUID();
    const tituloFin       = titulo.trim().slice(0, 180);
    const nombreFin       = (nombre?.trim() || titulo.trim()).slice(0, 60);
    const descCortaFin    = descCorta.trim().slice(0, 280);
    const descLargaFin    = sanitizeRichHtml(descLarga);
    const fuenteFin       = fuenteItem?.trim() || fuente.trim() || null;
    const urlFuenteFin    = urlFuenteItem?.trim() || urlFuente.trim() || null;
    const razonCambioFin  = razonClasificacion?.trim() || null;

    try {
      if (syncAction === 'actualizar' && existingId) {
        const idValue = String(existingId);
        const urlImagenFin = urlImagen?.trim() || null;
        const urlVideoFin = urlVideo?.trim() || null;

        if (tipo === 'senal') {
          const paisOrigenFin    = (paisOrigen || lugar)?.trim() || null;
          const fechaArticuloFin = (fechaArticulo || fechaMencionada)?.trim() || null;
          await db.query(
            `UPDATE senal
                SET titulo_senal=?, nombre_senal=?, desc_corta_senal=?, desc_larga_senal=?,
                    razon_cambio=?, fuente_senal=?, url_fuente=?, url_imagen_senal=?, url_video_senal=?,
                    pais_origen=?, fecha_senal_articulo=?, id_topico=?, id_estado=1,
                    fecha_publicacion=IF(fecha_publicacion IS NULL, NOW(), fecha_publicacion),
                    fecha_actualizacion=NOW()
              WHERE id_senal=?`,
            [tituloFin, nombreFin, descCortaFin, descLargaFin, razonCambioFin, fuenteFin, urlFuenteFin,
             urlImagenFin, urlVideoFin, paisOrigenFin, fechaArticuloFin, topicoId, idValue]
          );
          await db.query('DELETE FROM senal_pestel WHERE id_senal=?', [idValue]);
          await db.query('DELETE FROM senal_sector WHERE id_senal=?', [idValue]);
          for (const pid of finalPestelIds) await db.query('INSERT IGNORE INTO senal_pestel (id_senal, id_pestel) VALUES (?, ?)', [idValue, pid]);
          for (const sid of finalSectorIds) await db.query('INSERT IGNORE INTO senal_sector (id_senal, id_sector) VALUES (?, ?)', [idValue, sid]);
        } else if (tipo === 'tendencia') {
          await db.query(
            `UPDATE tendencia
                SET titulo_tendencia=?, nombre_tendencia=?, desc_corta_tendencia=?, desc_larga_tendencia=?,
                    razon_cambio=?, fuente_tendencia=?, url_fuente=?, url_imagen_tendencia=?, url_video_tendencia=?,
                    autor=?, id_topico=?, id_estado=1,
                    fecha_publicacion=IF(fecha_publicacion IS NULL, NOW(), fecha_publicacion),
                    fecha_actualizacion=NOW()
              WHERE id_tendencia=?`,
            [tituloFin, nombreFin, descCortaFin, descLargaFin, razonCambioFin, fuenteFin, urlFuenteFin,
             urlImagenFin, urlVideoFin, autor?.trim() || null, topicoId, idValue]
          );
          await db.query('DELETE FROM tendencia_pestel WHERE id_tendencia=?', [idValue]);
          await db.query('DELETE FROM tendencia_sector WHERE id_tendencia=?', [idValue]);
          for (const pid of finalPestelIds) await db.query('INSERT IGNORE INTO tendencia_pestel (id_tendencia, id_pestel) VALUES (?, ?)', [idValue, pid]);
          for (const sid of finalSectorIds) await db.query('INSERT IGNORE INTO tendencia_sector (id_tendencia, id_sector) VALUES (?, ?)', [idValue, sid]);
        } else if (tipo === 'escenario') {
          const urlFuenteStored = serializeUrlFuentes(urlsFuente, urlFuenteItem || urlFuente);
          const probInt = probabilidad ? Math.max(1, Math.min(5, parseInt(probabilidad) || 0)) || null : null;
          const referenciasFin = Array.isArray(referencias) && referencias.length > 0
            ? JSON.stringify(referencias.filter(r => r?.trim()))
            : null;
          let topicoIdEsc = topicoIdDoc;
          if (!topicoIdEsc && topicoEscenario?.trim()) {
            topicoIdEsc = await findOrCreateTopico(topicoEscenario.trim());
          }
          await db.query(
            `UPDATE escenario
                SET titulo_escenario=?, nombre_escenario=?, desc_corta_escenario=?, desc_larga_escenario=?,
                    razon_cambio=?, fuente_escenario=?, url_fuente=?, url_imagen_escenario=?, url_video_escenario=?,
                    referencias_escenario=?, horizonte_escenario=?, probabilidad=?, autor=?, id_topico=?,
                    id_estado=1, fecha_publicacion=IF(fecha_publicacion IS NULL, NOW(), fecha_publicacion),
                    fecha_actualizacion=NOW()
              WHERE id_escenario=?`,
            [tituloFin, nombreFin, descCortaFin, descLargaFin, razonCambioFin, fuenteFin, urlFuenteStored,
             urlImagenFin, urlVideoFin, referenciasFin, horizonteTemporal?.trim() || null, probInt,
             autor?.trim() || null, topicoIdEsc, idValue]
          );
          await db.query('DELETE FROM escenario_pestel WHERE id_escenario=?', [idValue]);
          await db.query('DELETE FROM escenario_sector WHERE id_escenario=?', [idValue]);
          for (const pid of finalPestelIds) await db.query('INSERT IGNORE INTO escenario_pestel (id_escenario, id_pestel) VALUES (?, ?)', [idValue, pid]);
          for (const sid of finalSectorIds) await db.query('INSERT IGNORE INTO escenario_sector (id_escenario, id_sector) VALUES (?, ?)', [idValue, sid]);
        }

        localToReal.set(localId, { realId: idValue, tipo });
        creados.push({ localId, realId: idValue, tipo, titulo: tituloFin, accion: 'actualizado' });
        console.log(`[IMPORTAR] ${tipo} actualizado id=${idValue} "${tituloFin}" (by ${req.user.correo})`);
        continue;
      }

      if (tipo === 'senal') {

        const dup = await findDuplicateTitleOrName('senal', tituloFin, nombreFin);
        if (dup) {
          if (modoRevision) {
            localToReal.set(localId, { realId: dup.id, tipo });
            omitidos.push({ localId, realId: dup.id, tipo, titulo: tituloFin, motivo: 'Ya existia una senal con ese titulo o nombre.' });
            continue;
          }
          errores.push({ id: localId, titulo: tituloFin, error: `Ya existe una señal con ese ${dup.field} (duplicado omitido).` });
          continue;
        }


        const paisOrigenFin    = (paisOrigen || lugar)?.trim()          || null;
        const fechaArticuloFin = (fechaArticulo || fechaMencionada)?.trim() || null;
        const urlImagenFin     = urlImagen?.trim() || null;
        const urlVideoFin      = urlVideo?.trim()  || null;

        await db.query(
          `INSERT INTO senal
             (id_senal, titulo_senal, nombre_senal,
              desc_corta_senal, desc_larga_senal, razon_cambio,
              fuente_senal, url_fuente,
              url_imagen_senal, url_video_senal,
              pais_origen, fecha_senal_articulo,
              id_topico, id_estado, id_usuario_creador, fecha_publicacion)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())`,
          [newId, tituloFin, nombreFin, descCortaFin, descLargaFin,
           razonCambioFin, fuenteFin, urlFuenteFin,
           urlImagenFin, urlVideoFin,
           paisOrigenFin, fechaArticuloFin,
           topicoId, usuarioId]
        );
        for (const pid of finalPestelIds)
          await db.query('INSERT IGNORE INTO senal_pestel (id_senal, id_pestel) VALUES (?, ?)', [newId, pid]);
        for (const sid of finalSectorIds)
          await db.query('INSERT IGNORE INTO senal_sector  (id_senal, id_sector) VALUES (?, ?)', [newId, sid]);

      } else if (tipo === 'tendencia') {

        const dup = await findDuplicateTitleOrName('tendencia', tituloFin, nombreFin);
        if (dup) {
          if (modoRevision) {
            localToReal.set(localId, { realId: dup.id, tipo });
            omitidos.push({ localId, realId: dup.id, tipo, titulo: tituloFin, motivo: 'Ya existia una tendencia con ese titulo o nombre.' });
            continue;
          }
          errores.push({ id: localId, titulo: tituloFin, error: `Ya existe una tendencia con ese ${dup.field} (duplicado omitido).` });
          continue;
        }

        await db.query(
          `INSERT INTO tendencia
             (id_tendencia, titulo_tendencia, nombre_tendencia,
              desc_corta_tendencia, desc_larga_tendencia, razon_cambio,
              fuente_tendencia, url_fuente,
              url_imagen_tendencia, url_video_tendencia,
              autor, id_topico, id_estado, id_usuario_creador, fecha_publicacion)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())`,
          [newId, tituloFin, nombreFin, descCortaFin, descLargaFin,
           razonCambioFin, fuenteFin, urlFuenteFin,
           urlImagen?.trim() || null, urlVideo?.trim() || null,
           autor?.trim() || null, topicoId, usuarioId]
        );
        for (const pid of finalPestelIds)
          await db.query('INSERT IGNORE INTO tendencia_pestel (id_tendencia, id_pestel) VALUES (?, ?)', [newId, pid]);
        for (const sid of finalSectorIds)
          await db.query('INSERT IGNORE INTO tendencia_sector  (id_tendencia, id_sector) VALUES (?, ?)', [newId, sid]);


        for (const tema of temasRelacionados) {
          if (!tema?.trim()) continue;
          try {
            const temaTopicoId = await findOrCreateTopico(tema);
            if (temaTopicoId) {
              await db.query(
                'INSERT IGNORE INTO topico_relac_tendencia (id_topico, id_tendencia) VALUES (?, ?)',
                [temaTopicoId, newId]
              );
            }
          } catch (tErr) {
            console.warn(`[IMPORTAR] Tema relacionado "${tema}" no pudo insertarse:`, tErr.message);
          }
        }

      } else if (tipo === 'escenario') {

        const dup = await findDuplicateTitleOrName('escenario', tituloFin, nombreFin);
        if (dup) {
          if (modoRevision) {
            localToReal.set(localId, { realId: dup.id, tipo });
            omitidos.push({ localId, realId: dup.id, tipo, titulo: tituloFin, motivo: 'Ya existia un escenario con ese titulo o nombre.' });
            continue;
          }
          errores.push({ id: localId, titulo: tituloFin, error: `Ya existe un escenario con ese ${dup.field} (duplicado omitido).` });
          continue;
        }

        const urlFuenteStored = serializeUrlFuentes(urlsFuente, urlFuenteItem || urlFuente);
        const probInt = probabilidad
          ? Math.max(1, Math.min(5, parseInt(probabilidad) || 0)) || null
          : null;

        const horizonteFin = horizonteTemporal?.trim() || null;


        let topicoIdEsc = topicoIdDoc;
        if (!topicoIdEsc && topicoEscenario?.trim()) {
          try {
            topicoIdEsc = await findOrCreateTopico(topicoEscenario.trim());
          } catch (err) {
            console.warn('[IMPORTAR] topico por escenario no pudo crearse:', err.message);
          }
        }


        const referenciasFin = Array.isArray(referencias) && referencias.length > 0
          ? JSON.stringify(referencias.filter(r => r?.trim()))
          : null;

        await db.query(
          `INSERT INTO escenario
             (id_escenario, titulo_escenario, nombre_escenario,
              desc_corta_escenario, desc_larga_escenario, razon_cambio,
              fuente_escenario, url_fuente,
              url_imagen_escenario, url_video_escenario,
              referencias_escenario,
              horizonte_escenario, probabilidad,
              autor, id_topico, id_estado, id_usuario_creador, fecha_publicacion)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())`,
          [newId, tituloFin, nombreFin, descCortaFin, descLargaFin,
           razonCambioFin, fuenteFin, urlFuenteStored,
           urlImagen?.trim() || null, urlVideo?.trim() || null,
           referenciasFin,
           horizonteFin, probInt,
           autor?.trim() || null, topicoIdEsc, usuarioId]
        );
        for (const pid of finalPestelIds)
          await db.query('INSERT IGNORE INTO escenario_pestel (id_escenario, id_pestel) VALUES (?, ?)', [newId, pid]);
        for (const sid of finalSectorIds)
          await db.query('INSERT IGNORE INTO escenario_sector  (id_escenario, id_sector) VALUES (?, ?)', [newId, sid]);


        if (Array.isArray(tendenciasSoporte) && tendenciasSoporte.length > 0) {
          for (const nombreTend of tendenciasSoporte) {
            if (!nombreTend?.trim()) continue;
            try {
              const [[tend]] = await db.query(
                `SELECT id_tendencia FROM tendencia
                 WHERE LOWER(TRIM(titulo_tendencia)) = LOWER(TRIM(?))
                    OR LOWER(TRIM(nombre_tendencia)) = LOWER(TRIM(?))
                 LIMIT 1`,
                [nombreTend.trim(), nombreTend.trim()]
              );
              if (tend) {
                await db.query(
                  'INSERT IGNORE INTO tendencia_escenario (id_tendencia, id_escenario) VALUES (?, ?)',
                  [tend.id_tendencia, newId]
                );
              }
            } catch (tErr) {
              console.warn(`[IMPORTAR] tendenciaSoporte "${nombreTend}" no pudo vincularse:`, tErr.message);
            }
          }
        }
      }

      localToReal.set(localId, { realId: newId, tipo });
      creados.push({ localId, realId: newId, tipo, titulo: tituloFin });
      console.log(`[IMPORTAR] ${tipo} creado id=${newId} "${tituloFin}" (by ${req.user.correo})`);

    } catch (err) {
      console.error(`[IMPORTAR] Error creando "${tituloFin}":`, err);
      errores.push({
        id: localId,
        titulo: tituloFin,
        error: err.code === 'ER_DUP_ENTRY' ? 'Ya existe un elemento con ese nombre.' : err.message,
      });
    }
  }


  let relacionesCreadas = 0;
  for (const rel of relaciones) {
    const { idOrigen, idDestino, tipo: tipoRel } = rel;
    const origen  = localToReal.get(idOrigen);
    const destino = localToReal.get(idDestino);
    if (!origen || !destino) continue;

    try {
      if (tipoRel === 'senal_tendencia') {
        await db.query(
          'INSERT IGNORE INTO senal_tendencia (id_senal, id_tendencia) VALUES (?, ?)',
          [origen.realId, destino.realId]
        );
        relacionesCreadas++;
      } else if (tipoRel === 'senal_escenario') {
        await db.query(
          'INSERT IGNORE INTO senal_escenario (id_senal, id_escenario) VALUES (?, ?)',
          [origen.realId, destino.realId]
        );
        relacionesCreadas++;
      } else if (tipoRel === 'tendencia_escenario') {
        await db.query(
          'INSERT IGNORE INTO tendencia_escenario (id_tendencia, id_escenario) VALUES (?, ?)',
          [origen.realId, destino.realId]
        );
        relacionesCreadas++;
      }
    } catch (err) {
      console.warn(`[IMPORTAR] Relación ${tipoRel} ${idOrigen}→${idDestino} falló:`, err.message);
    }
  }

  res.json({
    creados:      creados.filter(x => x.accion !== 'actualizado').length,
    actualizados: creados.filter(x => x.accion === 'actualizado').length,
    procesados:   creados.length,
    ids:          creados,
    omitidos,
    relaciones:   relacionesCreadas,
    errores,
    topicoId,
    topicoNombre,
  });
});

export default router;
