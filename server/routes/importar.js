// server/routes/importar.js — Importación de artículos con clasificación IA
// POST /api/importar/confirmar — Guarda propuestas aprobadas como publicadas
import { Router }     from 'express';
import { randomUUID } from 'crypto';
import db             from '../db.js';
import { serverError } from '../middleware/errorHandler.js';
import { sanitizeRichHtml } from '../utils/security.js';

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

/** Serializa array de URLs para escenario.url_fuente (TEXT JSON) */
function serializeUrlFuentes(urlsFuente, fallbackUrl) {
  const arr = Array.isArray(urlsFuente)
    ? urlsFuente.filter(u => u?.trim())
    : (fallbackUrl?.trim() ? [fallbackUrl.trim()] : []);
  return arr.length ? JSON.stringify(arr) : null;
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

/** Encuentra o crea un tópico por nombre. Devuelve id_topico (int). */
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

/**
 * POST /api/importar/confirmar
 * Body: {
 *   topico:    string   — título del artículo (crea/encuentra en tabla topico)
 *   fuente:    string   — nombre de la fuente del artículo
 *   urlFuente: string   — URL del artículo original
 *   propuestas: Array<{
 *     id:               string    — localId (ej. 'senal-0', 'tendencia-1')
 *     tipo:             'senal' | 'tendencia' | 'escenario'
 *     titulo:           string    — título descriptivo (max 100 chars)
 *     nombre:           string    — nombre conciso (max 60 chars)
 *     descCorta:        string    — descripción breve (max 280 chars)
 *     descLarga:        string    — texto completo del fragmento
 *     fuente:           string    — fuente específica del ítem
 *     urlFuente:        string    — URL para señal/tendencia
 *     urlsFuente:       string[]  — URLs múltiples para escenario
 *     probabilidad:     number    — 1-5 (solo escenario)
 *     temasRelacionados: string[] — tópicos relacionados (solo tendencia)
 *     pestelId:         string    — id del PESTEL asignado
 *     sectorId:         string    — id del sector asignado
 *   }>
 *   relaciones: Array<{
 *     idOrigen:  string  — localId del origen
 *     idDestino: string  — localId del destino
 *     tipo:      'senal_tendencia' | 'tendencia_escenario' | 'senal_escenario'
 *   }>
 * }
 * Respuesta: { creados, ids, relaciones, errores, topicoId, topicoNombre }
 */
router.post('/importar/confirmar', adminOnly, async (req, res) => {
  const { topico = '', fuente = '', urlFuente = '', propuestas, relaciones = [] } = req.body;

  if (!Array.isArray(propuestas) || propuestas.length === 0) {
    return res.status(400).json({ error: 'No hay propuestas para confirmar.' });
  }

  const usuarioId    = req.user.id;
  const creados      = [];  // { localId, realId, tipo, titulo }
  const errores      = [];

  // 1. Crear/encontrar tópico del artículo (ancla de trazabilidad)
  // Prioridad: topico del formulario (nivel documento) — lo pasamos al loop
  // para que cada escenario pueda usar su propio topico como fallback si el documento no lo tiene.
  let topicoIdDoc     = null;
  let topicoNombre    = topico.trim() || null;
  if (topicoNombre) {
    try {
      topicoIdDoc = await findOrCreateTopico(topicoNombre);
    } catch (err) {
      console.error('[IMPORTAR] Error creando tópico:', err);
    }
  }
  // Alias mantenido para señales y tendencias
  let topicoId = topicoIdDoc;

  // 2. Insertar cada propuesta aprobada
  const localToReal = new Map(); // localId → { realId, tipo }

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
      pestelId,          // legacy single (fallback)
      sectorId,          // legacy single (fallback)
      pestelIds = [],    // nuevos arrays multi-valor
      sectorIds = [],    // nuevos arrays multi-valor
      // Campos enriquecidos → columnas DB
      razonClasificacion = '',   // → razon_cambio
      paisOrigen         = null, // → pais_origen (señales)
      fechaArticulo      = null, // → fecha_senal_articulo (señales) YYYY-MM-DD
      lugar              = null, // legacy alias de paisOrigen
      fechaMencionada    = null, // legacy alias de fechaArticulo
      horizonteTemporal  = null, // → horizonte_escenario (escenarios)
      urlImagen          = '',   // → url_imagen_senal / tendencia / escenario
      urlVideo           = '',   // → url_video_senal  / tendencia / escenario
      // Escenarios (nuevos campos de prompt)
      topico:    topicoEscenario = '', // tópico del documento por escenario (fallback)
      referencias = [],              // → referencias_escenario (JSON array)
      tendenciasSoporte = [],        // nombres de tendencias de soporte → tendencia_escenario
      autor             = null,      // extraído de "Seleccionado, filtrado y editado con [AUTOR]"
    } = p;

    // Validaciones mínimas
    if (!tipo || !['senal', 'tendencia', 'escenario'].includes(tipo)) {
      errores.push({ id: localId, titulo: titulo || '(sin título)', error: `Tipo inválido: "${tipo}"` });
      continue;
    }
    if (!titulo?.trim() || !descCorta?.trim()) {
      errores.push({ id: localId, titulo: titulo || '(sin título)', error: 'El título y la descripción son obligatorios.' });
      continue;
    }
    // Unificar arrays: nuevos campos tienen prioridad; fallback a single legacy
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
      if (tipo === 'senal') {
        // Anti-colisión por título o nombre
        const dup = await findDuplicateTitleOrName('senal', tituloFin, nombreFin);
        if (dup) {
          errores.push({ id: localId, titulo: tituloFin, error: `Ya existe una señal con ese ${dup.field} (duplicado omitido).` });
          continue;
        }

        // paisOrigen / fechaArticulo (nuevos) con fallback legacy
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
        // Anti-colisión por título o nombre
        const dup = await findDuplicateTitleOrName('tendencia', tituloFin, nombreFin);
        if (dup) {
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

        // Temas relacionados → topico_relac_tendencia
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
        // Anti-colisión por título o nombre
        const dup = await findDuplicateTitleOrName('escenario', tituloFin, nombreFin);
        if (dup) {
          errores.push({ id: localId, titulo: tituloFin, error: `Ya existe un escenario con ese ${dup.field} (duplicado omitido).` });
          continue;
        }

        const urlFuenteStored = serializeUrlFuentes(urlsFuente, urlFuenteItem || urlFuente);
        const probInt = probabilidad
          ? Math.max(1, Math.min(5, parseInt(probabilidad) || 0)) || null
          : null;

        const horizonteFin = horizonteTemporal?.trim() || null;

        // Fallback: si el formulario no tenía tópico, usar el que la IA generó por escenario
        let topicoIdEsc = topicoIdDoc;
        if (!topicoIdEsc && topicoEscenario?.trim()) {
          try {
            topicoIdEsc = await findOrCreateTopico(topicoEscenario.trim());
          } catch (err) {
            console.warn('[IMPORTAR] topico por escenario no pudo crearse:', err.message);
          }
        }

        // Serializar referencias como JSON
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

        // Vincular tendenciasSoporte: buscar por nombre y crear relación en tendencia_escenario
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

  // 3. Insertar relaciones usando IDs reales (localId → realId ya mapeados)
  let relacionesCreadas = 0;
  for (const rel of relaciones) {
    const { idOrigen, idDestino, tipo: tipoRel } = rel;
    const origen  = localToReal.get(idOrigen);
    const destino = localToReal.get(idDestino);
    if (!origen || !destino) continue; // uno falló o fue rechazado

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
    creados:      creados.length,
    ids:          creados,
    relaciones:   relacionesCreadas,
    errores,
    topicoId,
    topicoNombre,
  });
});

export default router;
