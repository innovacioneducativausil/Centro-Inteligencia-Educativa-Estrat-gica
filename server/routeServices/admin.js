import { serverError } from '../middleware/errorHandler.js';


import { Router }      from 'express';
import { randomUUID }  from 'crypto';
import db from '../db.js';
import * as adminRepository from '../repositories/principal/adminRepository.js';
import { sanitizeRichHtml, normalizePositiveInt } from '../utils/security.js';
import { auditEvent } from '../services/auditService.js';
import { captureBeforeSnapshot } from '../middleware/auditMutations.js';

const router = Router();


const ESTADO = {
  1: { label: 'Publicado',   slug: 'publicado' },
  2: { label: 'En revisión', slug: 'revision'  },
  3: { label: 'Borrador',    slug: 'borrador'  },
  4: { label: 'Archivado',   slug: 'archivado' },
};
function estadoInfo(id) {
  return ESTADO[Number(id)] || { label: 'Borrador', slug: 'borrador' };
}


function parseUrlFuentes(raw) {
  if (!raw) return [];
  if (typeof raw === 'string' && raw.startsWith('[')) {
    try { return JSON.parse(raw).filter(Boolean); } catch {}
  }
  return raw ? [raw] : [];
}

function serializeUrlFuentes(urlFuentes, urlFuente) {
  const arr = Array.isArray(urlFuentes) ? urlFuentes.filter(u => u?.trim()) :
              (urlFuente?.trim() ? [urlFuente.trim()] : []);
  return arr.length ? JSON.stringify(arr) : null;
}

const ARCHIVE_STATE_ID = 4;
const ARCHIVE_RETENTION_DAYS = Math.max(1, Number(process.env.ARCHIVE_RETENTION_DAYS || 30));

function archiveMeta(row) {
  const fechaArchivado = row.fecha_archivado || null;
  const diasTranscurridos = fechaArchivado ? Math.max(0, Number(row.dias_archivado) || 0) : null;
  const diasRestantes = diasTranscurridos === null
    ? null
    : Math.max(0, ARCHIVE_RETENTION_DAYS - diasTranscurridos);
  return {
    fechaArchivado,
    diasArchivoRestantes: diasRestantes,
    diasArchivoRetencion: ARCHIVE_RETENTION_DAYS,
  };
}





function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador o analista.' });
    }
    next();
  };
}
const adminOnly = requireRole('admin');

//----------------TI-09----------------
// Señales/tendencias/escenarios/importar son sub-pestañas de la seccion
// "Radar" dentro de Gestion; el resto (usuarios, etc.) son secciones propias.
const VISTA_SECCION_MAP = { senales: 'radar', tendencias: 'radar', escenarios: 'radar', importar: 'radar' };

router.use(async (req, res, next) => {
  if (!req.path.startsWith('/admin')) return next();
  const shouldAudit = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!shouldAudit) return next();
  const antes = (req.method === 'PUT' || req.method === 'PATCH')
    ? await captureBeforeSnapshot(req.originalUrl)
    : null;
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      // Reservar el evento de inmediato (sincrono): auditEvent() tambien
      // marca req.auditLogged, pero solo al ejecutarse, y aqui hay un await
      // (la foto "ahora") antes de llegar a esa linea. Sin esto, el
      // middleware generico de auditMutations.js gana la carrera y crea un
      // registro duplicado/generico para el mismo evento.
      req.auditLogged = true;
      const entidad = req.path.split('/').filter(Boolean)[1] || 'admin';
      const vistaSeccion = VISTA_SECCION_MAP[entidad] || entidad;
      (async () => {
        //----------------TI-09----------------
        // La mutacion ya se aplico (estamos en 'finish'), asi que volver a
        // tomar la foto con la misma funcion captura el estado "despues".
        const ahora = (req.method === 'PUT' || req.method === 'PATCH')
          ? await captureBeforeSnapshot(req.originalUrl)
          : null;
        auditEvent(req, {
          evento: 'gestion_cambio',
          accion: req.method.toLowerCase(),
          modulo: 'gestion',
          entidad,
          entidadId: req.params.uuid || req.params.resource || null,
          detalle: `${req.method} ${req.originalUrl}`,
          metadata: { vista: vistaSeccion, params: req.params, antes: antes || undefined, ahora: ahora || undefined },
        });
      })();
    }
  });
  next();
});


function parsePagination(query) {
  const page  = normalizePositiveInt(query.page, 1, { min: 1, max: 100000 });
  const limit = normalizePositiveInt(query.limit, 10, { min: 1, max: 50 });
  return { page, limit, offset: (page - 1) * limit };
}


router.get('/admin/senales', adminOnly, async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const q          = req.query.q      || '';
    const estado     = req.query.estado || '';
    const pestelIds  = req.query.pestel ? req.query.pestel.split(',').filter(Boolean) : [];
    const sectorIds  = req.query.sector ? req.query.sector.split(',').filter(Boolean) : [];

    const conditions = [];
    const params     = [];

    if (q) {
      conditions.push('(s.titulo_senal LIKE ? OR s.desc_corta_senal LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (estado) {
      const match = Object.entries(ESTADO).find(([, v]) => v.slug === estado);
      if (match) { conditions.push('s.id_estado = ?'); params.push(match[0]); }
    } else {
      conditions.push('s.id_estado <> 4');
    }
    if (pestelIds.length) {
      const ph = pestelIds.map(() => '?').join(',');
      conditions.push(`EXISTS (SELECT 1 FROM senal_pestel _fp WHERE _fp.id_senal = s.id_senal AND _fp.id_pestel IN (${ph}))`);
      params.push(...pestelIds);
    }
    if (sectorIds.length) {
      const ph = sectorIds.map(() => '?').join(',');
      conditions.push(`EXISTS (SELECT 1 FROM senal_sector _fs WHERE _fs.id_senal = s.id_senal AND _fs.id_sector IN (${ph}))`);
      params.push(...sectorIds);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(DISTINCT s.id_senal) AS total FROM senal s ${where}`,
      params
    );

    const [rows] = await db.query(
      `SELECT
         s.id_senal,
         s.titulo_senal,
         s.desc_corta_senal,
         s.fuente_senal,
         s.url_fuente,
         s.id_estado,
         s.fecha_publicacion,
         s.fecha_creacion,
         s.fecha_actualizacion,
         s.fecha_archivado,
         TIMESTAMPDIFF(DAY, s.fecha_archivado, NOW()) AS dias_archivado,
         GROUP_CONCAT(DISTINCT p.nombre_pestel ORDER BY p.orden_display SEPARATOR '|') AS pestel_nombre,
         MIN(p.slug_pestel)      AS pestel_slug,
         GROUP_CONCAT(DISTINCT p.color       ORDER BY p.orden_display SEPARATOR ',')  AS pestel_colores,
         GROUP_CONCAT(DISTINCT p.letra_codigo ORDER BY p.orden_display SEPARATOR ',') AS pestel_letra,
         GROUP_CONCAT(DISTINCT sec.nombre_sector ORDER BY sec.id_sector SEPARATOR '|') AS sector_nombres,
         tp.nombre AS topico_nombre
       FROM senal s
       LEFT JOIN senal_pestel sp ON s.id_senal   = sp.id_senal
       LEFT JOIN pestel p        ON sp.id_pestel = p.id_pestel AND p.activo = 1
       LEFT JOIN senal_sector ss ON s.id_senal   = ss.id_senal
       LEFT JOIN sector sec      ON ss.id_sector = sec.id_sector AND sec.activo = 1
       LEFT JOIN topico tp       ON s.id_topico  = tp.id_topico
       ${where}
       GROUP BY s.id_senal
       ORDER BY s.fecha_creacion DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map(row => {
      const letras  = (row.pestel_letra   || '').split(',').filter(Boolean);
      const nombres = (row.pestel_nombre  || '').split('|').filter(Boolean);
      const colores = (row.pestel_colores || '').split(',').filter(Boolean);
      const pestels = letras.map((l, i) => ({ letra: l, nombre: nombres[i] || l, color: colores[i] || '#2A9D8F' }));
      return {
        uuid:        row.id_senal,
        titulo:      row.titulo_senal,
        descripcion: row.desc_corta_senal || '',
        fuente:      row.fuente_senal     || null,
        urlFuente:   row.url_fuente       || null,
        pestel:      nombres.join(', ')   || null,
        pestelSlug:  row.pestel_slug      || null,
        pestelColor: colores[0]           || '#2A9D8F',
        pestelLetra: letras.join('')      || null,
        pestels,
        sector:      (row.sector_nombres || '').split('|').filter(Boolean)[0] || null,
        sectors:     (row.sector_nombres || '').split('|').filter(Boolean),
        idEstado:    row.id_estado,
        estado:      estadoInfo(row.id_estado),
        fecha:       row.fecha_actualizacion || row.fecha_publicacion || row.fecha_creacion,
        ...archiveMeta(row),
        topico:      row.topico_nombre || null,
      };
    });

    res.json({ total, page, limit, pages: Math.ceil(total / limit), data });
  } catch (err) {
    console.error('[GET /admin/senales]', err);
    serverError(res, err);
  }
});


router.patch('/admin/senales/:uuid/estado', adminOnly, async (req, res) => {
  try {
    const { uuid }     = req.params;
    const { id_estado } = req.body;
    const nuevoEstado  = Number(id_estado);

    if (![1, 2, 3].includes(nuevoEstado)) {
      return res.status(400).json({ error: 'Estado inválido. Use 1 (Publicado), 2 (En revisión) o 3 (Borrador).' });
    }

    const row = await adminRepository.getSenalEstado(uuid);
    if (!row) return res.status(404).json({ error: 'Señal no encontrada.' });

    await adminRepository.updateSenalEstado(uuid, nuevoEstado);

    console.log(`[ADMIN] Señal ${uuid}: → ${nuevoEstado} (by ${req.user.correo})`);
    res.json({ success: true, estado: estadoInfo(nuevoEstado) });
  } catch (err) {
    console.error('[PATCH /admin/senales/:uuid/estado]', err);
    serverError(res, err);
  }
});


router.get('/admin/tendencias', adminOnly, async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const q          = req.query.q      || '';
    const estado     = req.query.estado || '';
    const pestelIds  = req.query.pestel ? req.query.pestel.split(',').filter(Boolean) : [];
    const sectorIds  = req.query.sector ? req.query.sector.split(',').filter(Boolean) : [];

    const conditions = [];
    const params     = [];

    if (q) {
      conditions.push('(t.titulo_tendencia LIKE ? OR t.desc_corta_tendencia LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (estado) {
      const match = Object.entries(ESTADO).find(([, v]) => v.slug === estado);
      if (match) { conditions.push('t.id_estado = ?'); params.push(match[0]); }
    } else {
      conditions.push('t.id_estado <> 4');
    }
    if (pestelIds.length) {
      const ph = pestelIds.map(() => '?').join(',');
      conditions.push(`EXISTS (SELECT 1 FROM tendencia_pestel _fp WHERE _fp.id_tendencia = t.id_tendencia AND _fp.id_pestel IN (${ph}))`);
      params.push(...pestelIds);
    }
    if (sectorIds.length) {
      const ph = sectorIds.map(() => '?').join(',');
      conditions.push(`EXISTS (SELECT 1 FROM tendencia_sector _fs WHERE _fs.id_tendencia = t.id_tendencia AND _fs.id_sector IN (${ph}))`);
      params.push(...sectorIds);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(DISTINCT t.id_tendencia) AS total FROM tendencia t ${where}`,
      params
    );

    const [rows] = await db.query(
      `SELECT
         t.id_tendencia,
         t.titulo_tendencia,
         t.desc_corta_tendencia,
         t.fuente_tendencia,
         t.url_fuente,
         t.id_estado,
         t.fecha_publicacion,
         t.fecha_creacion,
         t.fecha_actualizacion,
         t.fecha_archivado,
         TIMESTAMPDIFF(DAY, t.fecha_archivado, NOW()) AS dias_archivado,
         GROUP_CONCAT(DISTINCT p.nombre_pestel ORDER BY p.orden_display SEPARATOR '|') AS pestel_nombre,
         MIN(p.slug_pestel)      AS pestel_slug,
         GROUP_CONCAT(DISTINCT p.color       ORDER BY p.orden_display SEPARATOR ',')  AS pestel_colores,
         GROUP_CONCAT(DISTINCT p.letra_codigo ORDER BY p.orden_display SEPARATOR ',') AS pestel_letra,
         GROUP_CONCAT(DISTINCT sec.nombre_sector ORDER BY sec.id_sector SEPARATOR '|') AS sector_nombres,
         tpc.nombre AS topico_nombre
       FROM tendencia t
       LEFT JOIN tendencia_pestel tp ON t.id_tendencia = tp.id_tendencia
       LEFT JOIN pestel p            ON tp.id_pestel   = p.id_pestel AND p.activo = 1
       LEFT JOIN tendencia_sector ts ON t.id_tendencia = ts.id_tendencia
       LEFT JOIN sector sec          ON ts.id_sector   = sec.id_sector AND sec.activo = 1
       LEFT JOIN topico tpc          ON t.id_topico    = tpc.id_topico
       ${where}
       GROUP BY t.id_tendencia
       ORDER BY t.fecha_creacion DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map(row => {
      const letras  = (row.pestel_letra   || '').split(',').filter(Boolean);
      const nombres = (row.pestel_nombre  || '').split('|').filter(Boolean);
      const colores = (row.pestel_colores || '').split(',').filter(Boolean);
      const pestels = letras.map((l, i) => ({ letra: l, nombre: nombres[i] || l, color: colores[i] || '#2A9D8F' }));
      return {
        uuid:        row.id_tendencia,
        titulo:      row.titulo_tendencia,
        descripcion: row.desc_corta_tendencia || '',
        fuente:      row.fuente_tendencia     || null,
        urlFuente:   row.url_fuente           || null,
        pestel:      nombres.join(', ')       || null,
        pestelSlug:  row.pestel_slug          || null,
        pestelColor: colores[0]               || '#2A9D8F',
        pestelLetra: letras.join('')          || null,
        pestels,
        sector:      (row.sector_nombres || '').split('|').filter(Boolean)[0] || null,
        sectors:     (row.sector_nombres || '').split('|').filter(Boolean),
        idEstado:    row.id_estado,
        estado:      estadoInfo(row.id_estado),
        fecha:       row.fecha_actualizacion  || row.fecha_publicacion || row.fecha_creacion,
        ...archiveMeta(row),
        topico:      row.topico_nombre || null,
      };
    });

    res.json({ total, page, limit, pages: Math.ceil(total / limit), data });
  } catch (err) {
    console.error('[GET /admin/tendencias]', err);
    serverError(res, err);
  }
});


router.patch('/admin/tendencias/:uuid/estado', adminOnly, async (req, res) => {
  try {
    const { uuid }     = req.params;
    const { id_estado } = req.body;
    const nuevoEstado  = Number(id_estado);

    if (![1, 2, 3].includes(nuevoEstado)) {
      return res.status(400).json({ error: 'Estado inválido.' });
    }

    const row = await adminRepository.getTendenciaEstado(uuid);
    if (!row) return res.status(404).json({ error: 'Tendencia no encontrada.' });

    await adminRepository.updateTendenciaEstado(uuid, nuevoEstado);

    console.log(`[ADMIN] Tendencia ${uuid}: → ${nuevoEstado} (by ${req.user.correo})`);
    res.json({ success: true, estado: estadoInfo(nuevoEstado) });
  } catch (err) {
    console.error('[PATCH /admin/tendencias/:uuid/estado]', err);
    serverError(res, err);
  }
});


router.get('/admin/escenarios', adminOnly, async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const q          = req.query.q        || '';
    const estado     = req.query.estado   || '';
    const horizonte  = req.query.horizonte || '';
    const pestelIds  = req.query.pestel ? req.query.pestel.split(',').filter(Boolean) : [];
    const sectorIds  = req.query.sector ? req.query.sector.split(',').filter(Boolean) : [];

    const conditions = [];
    const params     = [];

    if (q) {
      conditions.push('(e.titulo_escenario LIKE ? OR e.desc_corta_escenario LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (estado) {
      const match = Object.entries(ESTADO).find(([, v]) => v.slug === estado);
      if (match) { conditions.push('e.id_estado = ?'); params.push(match[0]); }
    } else {
      conditions.push('e.id_estado <> 4');
    }
    if (horizonte) {
      conditions.push('e.horizonte_escenario = ?');
      params.push(horizonte);
    }
    if (pestelIds.length) {
      const ph = pestelIds.map(() => '?').join(',');
      conditions.push(`EXISTS (SELECT 1 FROM escenario_pestel _fp WHERE _fp.id_escenario = e.id_escenario AND _fp.id_pestel IN (${ph}))`);
      params.push(...pestelIds);
    }
    if (sectorIds.length) {
      const ph = sectorIds.map(() => '?').join(',');
      conditions.push(`EXISTS (SELECT 1 FROM escenario_sector _fs WHERE _fs.id_escenario = e.id_escenario AND _fs.id_sector IN (${ph}))`);
      params.push(...sectorIds);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(DISTINCT e.id_escenario) AS total FROM escenario e ${where}`,
      params
    );

    const [rows] = await db.query(
      `SELECT
         e.id_escenario,
         e.titulo_escenario,
         e.desc_corta_escenario,
         e.fuente_escenario,
         e.url_fuente,
         e.id_estado,
         e.fecha_publicacion,
         e.fecha_creacion,
         e.fecha_actualizacion,
         e.fecha_archivado,
         TIMESTAMPDIFF(DAY, e.fecha_archivado, NOW()) AS dias_archivado,
         e.horizonte_escenario,
         GROUP_CONCAT(DISTINCT p.nombre_pestel ORDER BY p.orden_display SEPARATOR '|') AS pestel_nombre,
         MIN(p.slug_pestel)      AS pestel_slug,
         GROUP_CONCAT(DISTINCT p.color       ORDER BY p.orden_display SEPARATOR ',')  AS pestel_colores,
         GROUP_CONCAT(DISTINCT p.letra_codigo ORDER BY p.orden_display SEPARATOR ',') AS pestel_letra,
         GROUP_CONCAT(DISTINCT sec.nombre_sector ORDER BY sec.id_sector SEPARATOR '|') AS sector_nombres,
         tpe.nombre AS topico_nombre
       FROM escenario e
       LEFT JOIN escenario_pestel ep  ON e.id_escenario = ep.id_escenario
       LEFT JOIN pestel p             ON ep.id_pestel   = p.id_pestel AND p.activo = 1
       LEFT JOIN escenario_sector esc ON e.id_escenario = esc.id_escenario
       LEFT JOIN sector sec           ON esc.id_sector  = sec.id_sector AND sec.activo = 1
       LEFT JOIN topico tpe           ON e.id_topico    = tpe.id_topico
       ${where}
       GROUP BY e.id_escenario
       ORDER BY e.fecha_creacion DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map(row => {
      const letras  = (row.pestel_letra   || '').split(',').filter(Boolean);
      const nombres = (row.pestel_nombre  || '').split('|').filter(Boolean);
      const colores = (row.pestel_colores || '').split(',').filter(Boolean);
      const pestels = letras.map((l, i) => ({ letra: l, nombre: nombres[i] || l, color: colores[i] || '#2A9D8F' }));
      return {
        uuid:        row.id_escenario,
        titulo:      row.titulo_escenario,
        descripcion: row.desc_corta_escenario || '',
        fuente:      row.fuente_escenario     || null,
        urlFuente:   parseUrlFuentes(row.url_fuente)[0] || null,
        pestel:      nombres.join(', ')       || null,
        pestelSlug:  row.pestel_slug          || null,
        pestelColor: colores[0]               || '#2A9D8F',
        pestelLetra: letras.join('')          || null,
        pestels,
        sector:      (row.sector_nombres || '').split('|').filter(Boolean)[0] || null,
        sectors:     (row.sector_nombres || '').split('|').filter(Boolean),
        idEstado:    row.id_estado,
        estado:      estadoInfo(row.id_estado),
        fecha:       row.fecha_actualizacion  || row.fecha_publicacion || row.fecha_creacion,
        ...archiveMeta(row),
        topico:      row.topico_nombre || null,
      };
    });

    res.json({ total, page, limit, pages: Math.ceil(total / limit), data });
  } catch (err) {
    console.error('[GET /admin/escenarios]', err);
    serverError(res, err);
  }
});


router.patch('/admin/escenarios/:uuid/estado', adminOnly, async (req, res) => {
  try {
    const { uuid }     = req.params;
    const { id_estado } = req.body;
    const nuevoEstado  = Number(id_estado);

    if (![1, 2, 3].includes(nuevoEstado)) {
      return res.status(400).json({ error: 'Estado inválido.' });
    }

    const row = await adminRepository.getEscenarioEstado(uuid);
    if (!row) return res.status(404).json({ error: 'Escenario no encontrado.' });

    await adminRepository.updateEscenarioEstado(uuid, nuevoEstado);

    console.log(`[ADMIN] Escenario ${uuid}: → ${nuevoEstado} (by ${req.user.correo})`);
    res.json({ success: true, estado: estadoInfo(nuevoEstado) });
  } catch (err) {
    console.error('[PATCH /admin/escenarios/:uuid/estado]', err);
    serverError(res, err);
  }
});


router.get('/admin/senales/:uuid', adminOnly, async (req, res) => {
  try {
    const { uuid } = req.params;
    const detalle = await adminRepository.getSenalDetalle(uuid);
    if (!detalle) return res.status(404).json({ error: 'Señal no encontrada.' });
    const { row, pestels, sectors, tendRel, escRel } = detalle;
    const fmt = d => d ? new Date(d).toLocaleDateString('es-PE') : null;
    const fmtDate = d => d ? (d instanceof Date ? d.toISOString().slice(0,10) : String(d).slice(0,10)) : null;
    res.json({
      uuid, nombre: row.nombre_senal, tituloDes: row.titulo_senal,
      descCorta: row.desc_corta_senal, descLarga: row.desc_larga_senal,
      razonCambio: row.razon_cambio || '',
      fuente: row.fuente_senal, urlFuente: row.url_fuente,
      imagenUrl: row.url_imagen_senal, videoUrl: row.url_video_senal,
      estadoId: String(row.id_estado),
      pestelIds: pestels.map(p => String(p.id_pestel)),
      sectorIds: sectors.map(s => String(s.id_sector)),
      paisOrigen: row.pais_origen || null,
      topico: row.topico_nombre || null,
      autor: row.autor || null,
      fechaArticulo: fmtDate(row.fecha_senal_articulo),
      fechaSeñalArticulo: fmtDate(row.fecha_senal_articulo),
      fechaCreacion: fmt(row.fecha_creacion),
      fechaPublicacion: fmt(row.fecha_publicacion),
      fechaActualizacion: fmt(row.fecha_actualizacion),
      tendenciasRelacionadas: tendRel.map(r => ({ uuid: r.uuid, titulo: r.nombre })),
      escenariosRelacionados: escRel.map(r => ({ uuid: r.uuid, titulo: r.nombre })),
    });
  } catch (err) { serverError(res, err); }
});


router.put('/admin/senales/:uuid', adminOnly, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { nombre, tituloDes, descCorta, descLarga, razonCambio, fuente, urlFuente,
            imagenUrl, videoUrl, pestelId, pestelIds, sectorId, sectorIds,
            tendenciasRel, escenariosRel, id_estado, autor, fechaArticulo } = req.body;
    const sids = Array.isArray(sectorIds)&&sectorIds.length ? sectorIds : (sectorId?[sectorId]:[]);
    const errs = validateCreate({ nombre, sectorId: sids[0], pestelId: pestelId || pestelIds?.[0], descCorta });
    if (errs.length) return res.status(400).json({ error: errs[0], errors: errs });

    const existing = await adminRepository.getSenalEstado(uuid);
    if (!existing) return res.status(404).json({ error: 'Señal no encontrada.' });
    const idEstado = [1,2,3].includes(Number(id_estado)) ? Number(id_estado) : (existing.id_estado || 3);
    const tituloFin = (tituloDes?.trim() || nombre.trim()).slice(0,100);
    const nombreFin = nombre.trim().slice(0,100);
    await adminRepository.ensureUniqueTitleOrName('senales', tituloFin, nombreFin, uuid);
    const pids = Array.isArray(pestelIds)&&pestelIds.length ? pestelIds : (pestelId?[pestelId]:[]);
    await adminRepository.updateSenal(uuid, {
      tituloFin, nombreFin,
      descCorta: descCorta?.trim()||'',
      descLarga: sanitizeRichHtml(descLarga),
      razonCambio: razonCambio?.trim()||null,
      fuente: fuente?.trim()||'',
      urlFuente: urlFuente?.trim()||'',
      imagenUrl: imagenUrl?.trim()||null,
      videoUrl: videoUrl?.trim()||null,
      autor: autor?.trim()||null,
      fechaArticulo: fechaArticulo || null,
      idEstado,
      pids,
      sids,
      tids: Array.isArray(tendenciasRel) ? tendenciasRel : [],
      eids: Array.isArray(escenariosRel) ? escenariosRel : [],
    }, req.user.id);

    res.json({ success: true, estado: estadoInfo(idEstado) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code==='ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe una señal con ese nombre.' });
    serverError(res, err);
  }
});


router.get('/admin/tendencias/:uuid', adminOnly, async (req, res) => {
  try {
    const { uuid } = req.params;
    const detalle = await adminRepository.getTendenciaDetalle(uuid);
    if (!detalle) return res.status(404).json({ error: 'Tendencia no encontrada.' });
    const { row, pestels, sectors, topicosRelac, senRel, escRel } = detalle;
    const fmt = d => d ? new Date(d).toLocaleDateString('es-PE') : null;
    res.json({
      uuid, nombre: row.nombre_tendencia, tituloDes: row.titulo_tendencia,
      descCorta: row.desc_corta_tendencia, descLarga: row.desc_larga_tendencia,
      razonCambio: row.razon_cambio || '',
      topico: row.topico_nombre || null,
      autor: row.autor || null,
      fuente: row.fuente_tendencia, urlFuente: row.url_fuente,
      imagenUrl: row.url_imagen_tendencia, videoUrl: row.url_video_tendencia,
      estadoId: String(row.id_estado),
      pestelIds: pestels.map(p => String(p.id_pestel)),
      sectorIds: sectors.map(s => String(s.id_sector)),
      topicosRelacionados: topicosRelac.map(t => t.nombre),
      fechaCreacion: fmt(row.fecha_creacion),
      fechaPublicacion: fmt(row.fecha_publicacion),
      fechaActualizacion: fmt(row.fecha_actualizacion),
      senalesRelacionadas:    senRel.map(r => ({ uuid: r.uuid, titulo: r.nombre })),
      escenariosRelacionados: escRel.map(r => ({ uuid: r.uuid, titulo: r.nombre })),
    });
  } catch (err) { serverError(res, err); }
});


router.put('/admin/tendencias/:uuid', adminOnly, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { nombre, tituloDes, descCorta, descLarga, razonCambio, fuente, urlFuente,
            imagenUrl, videoUrl, pestelId, pestelIds, sectorId, sectorIds,
            senalesRel, escenariosRel, id_estado, autor } = req.body;
    const sids = Array.isArray(sectorIds)&&sectorIds.length ? sectorIds : (sectorId?[sectorId]:[]);
    const errs = validateCreate({ nombre, sectorId: sids[0], pestelId: pestelId || pestelIds?.[0], descCorta });
    if (errs.length) return res.status(400).json({ error: errs[0], errors: errs });

    const existing = await adminRepository.getTendenciaEstado(uuid);
    if (!existing) return res.status(404).json({ error: 'Tendencia no encontrada.' });
    const idEstado = [1,2,3].includes(Number(id_estado)) ? Number(id_estado) : 3;
    const tituloFin = (tituloDes?.trim() || nombre.trim()).slice(0,100);
    const nombreFin = nombre.trim().slice(0,100);
    await adminRepository.ensureUniqueTitleOrName('tendencias', tituloFin, nombreFin, uuid);
    const pids = Array.isArray(pestelIds)&&pestelIds.length ? pestelIds : (pestelId?[pestelId]:[]);
    await adminRepository.updateTendencia(uuid, {
      tituloFin, nombreFin,
      descCorta: descCorta?.trim()||'',
      descLarga: sanitizeRichHtml(descLarga),
      razonCambio: razonCambio?.trim()||null,
      fuente: fuente?.trim()||null,
      urlFuente: urlFuente?.trim()||null,
      imagenUrl: imagenUrl?.trim()||null,
      videoUrl: videoUrl?.trim()||null,
      autor: autor?.trim()||null,
      idEstado,
      pids,
      sids,
      senIds: Array.isArray(senalesRel) ? senalesRel : [],
      eids: Array.isArray(escenariosRel) ? escenariosRel : [],
    }, req.user.id);

    res.json({ success: true, estado: estadoInfo(idEstado) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code==='ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe una tendencia con ese nombre.' });
    serverError(res, err);
  }
});


router.get('/admin/escenarios/:uuid', adminOnly, async (req, res) => {
  try {
    const { uuid } = req.params;
    const detalle = await adminRepository.getEscenarioDetalle(uuid);
    if (!detalle) return res.status(404).json({ error: 'Escenario no encontrado.' });
    const { row, pestels, sectors, senRel, tendRel } = detalle;
    const fmt = d => d ? new Date(d).toLocaleDateString('es-PE') : null;
    res.json({
      uuid, nombre: row.nombre_escenario, tituloDes: row.titulo_escenario,
      descCorta: row.desc_corta_escenario, descLarga: row.desc_larga_escenario,
      razonCambio: row.razon_cambio || '',
      topico: row.topico_nombre || null,
      fuente: row.fuente_escenario,
      urlFuente: parseUrlFuentes(row.url_fuente)[0] || null,
      urlFuentes: parseUrlFuentes(row.url_fuente),
      imagenUrl: row.url_imagen_escenario, videoUrl: row.url_video_escenario,
      estadoId: String(row.id_estado),
      pestelIds: pestels.map(p => String(p.id_pestel)),
      sectorIds: sectors.map(s => String(s.id_sector)),
      horizonte: row.horizonte_escenario || '',
      probabilidad: row.probabilidad ?? null,
      autor: row.autor || null,
      fechaCreacion: fmt(row.fecha_creacion),
      fechaPublicacion: fmt(row.fecha_publicacion),
      fechaActualizacion: fmt(row.fecha_actualizacion),
      senalesRelacionadas:   senRel.map(r => ({ uuid: r.uuid, titulo: r.nombre })),
      tendenciasRelacionadas: tendRel.map(r => ({ uuid: r.uuid, titulo: r.nombre })),
    });
  } catch (err) { serverError(res, err); }
});


router.put('/admin/escenarios/:uuid', adminOnly, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { nombre, tituloDes, descCorta, descLarga, razonCambio, fuente, urlFuente, urlFuentes,
            imagenUrl, videoUrl, horizonte, pestelId, pestelIds, sectorId, sectorIds,
            senalesRel, tendenciasRel, id_estado, autor } = req.body;
    const urlFuenteStored = serializeUrlFuentes(urlFuentes, urlFuente);
    const sids = Array.isArray(sectorIds)&&sectorIds.length ? sectorIds : (sectorId?[sectorId]:[]);
    const errs = validateCreate({ nombre, sectorId: sids[0], pestelId: pestelId || pestelIds?.[0], descCorta });
    if (errs.length) return res.status(400).json({ error: errs[0], errors: errs });

    const existing = await adminRepository.getEscenarioEstado(uuid);
    if (!existing) return res.status(404).json({ error: 'Escenario no encontrado.' });
    const idEstado = [1,2,3].includes(Number(id_estado)) ? Number(id_estado) : 3;
    const tituloFin = (tituloDes?.trim() || nombre.trim()).slice(0,100);
    const nombreFin = nombre.trim().slice(0,100);
    await adminRepository.ensureUniqueTitleOrName('escenarios', tituloFin, nombreFin, uuid);
    const pids = Array.isArray(pestelIds)&&pestelIds.length ? pestelIds : (pestelId?[pestelId]:[]);
    await adminRepository.updateEscenario(uuid, {
      tituloFin, nombreFin,
      descCorta: descCorta?.trim()||'',
      descLarga: sanitizeRichHtml(descLarga),
      razonCambio: razonCambio?.trim()||null,
      fuente: fuente?.trim()||null,
      urlFuenteStored,
      imagenUrl: imagenUrl?.trim()||null,
      videoUrl: videoUrl?.trim()||null,
      horizonte: horizonte?.trim()||null,
      autor: autor?.trim()||null,
      idEstado,
      pids,
      sids,
      senIds: Array.isArray(senalesRel) ? senalesRel : [],
      tids: Array.isArray(tendenciasRel) ? tendenciasRel : [],
    }, req.user.id);

    res.json({ success: true, estado: estadoInfo(idEstado) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code==='ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe un escenario con ese nombre.' });
    serverError(res, err);
  }
});


router.get('/admin/options', adminOnly, async (_req, res) => {
  try {
    const options = await adminRepository.getAdminOptions();
    res.json(options);
  } catch (err) {
    console.error('[GET /admin/options]', err);
    serverError(res, err);
  }
});


function validateCreate({ nombre, sectorId, pestelId, descCorta }) {
  const errs = [];
  if (!nombre?.trim())    errs.push('El nombre es obligatorio.');
  if (!sectorId)          errs.push('El sector es obligatorio.');
  if (!pestelId)          errs.push('La categoría PESTEL es obligatoria.');
  if (!descCorta?.trim()) errs.push('La descripción corta es obligatoria.');
  if (descCorta && descCorta.trim().length > 280) errs.push('La descripción corta no puede superar los 280 caracteres.');
  return errs;
}


router.post('/admin/senales', adminOnly, async (req, res) => {
  try {
    const {
      nombre, tituloDes, descCorta, descLarga, razonCambio,
      fuente, urlFuente, imagenUrl, videoUrl,
      pestelId, pestelIds, sectorId, sectorIds,
      tendenciasRel, escenariosRel,
      id_estado = 3, autor, fechaArticulo,
    } = req.body;

    const sids = Array.isArray(sectorIds)&&sectorIds.length ? sectorIds : (sectorId?[sectorId]:[]);
    const errs = validateCreate({ nombre, sectorId: sids[0], pestelId: pestelId || pestelIds?.[0], descCorta });
    if (errs.length) return res.status(400).json({ error: errs[0], errors: errs });

    const idEstado  = [1, 2, 3].includes(Number(id_estado)) ? Number(id_estado) : 3;
    const newId     = randomUUID();
    const tituloFin = (tituloDes?.trim() || nombre.trim()).slice(0, 100);
    const nombreFin = nombre.trim().slice(0, 100);

    await adminRepository.ensureUniqueTitleOrName('senales', tituloFin, nombreFin, null);
    await adminRepository.createSenal(newId, {
      tituloFin, nombreFin,
      descCorta: descCorta?.trim() || '',
      descLarga: sanitizeRichHtml(descLarga),
      razonCambio: razonCambio?.trim() || null,
      fuente: fuente?.trim() || '',
      urlFuente: urlFuente?.trim() || '',
      imagenUrl: imagenUrl?.trim() || null,
      videoUrl: videoUrl?.trim() || null,
      autor: autor?.trim() || null,
      fechaArticulo: fechaArticulo || null,
      idEstado,
      pestelsToInsert: Array.isArray(pestelIds) && pestelIds.length ? pestelIds : (pestelId ? [pestelId] : []),
      sids,
      tids: Array.isArray(tendenciasRel) ? tendenciasRel : [],
      eids: Array.isArray(escenariosRel) ? escenariosRel : [],
    }, req.user.id);

    console.log(`[ADMIN] Señal creada id=${newId} estado=${idEstado} (by ${req.user.correo})`);
    res.status(201).json({ success: true, id: newId, estado: estadoInfo(idEstado) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe una señal con ese nombre. Usa uno diferente.' });
    }
    console.error('[POST /admin/senales]', err);
    serverError(res, err);
  }
});


router.post('/admin/tendencias', adminOnly, async (req, res) => {
  try {
    const {
      nombre, tituloDes, descCorta, descLarga, razonCambio,
      fuente, urlFuente, imagenUrl, videoUrl,
      pestelId, pestelIds, sectorId, sectorIds,
      senalesRel, escenariosRel,
      id_estado = 3, autor,
    } = req.body;

    const sids = Array.isArray(sectorIds)&&sectorIds.length ? sectorIds : (sectorId?[sectorId]:[]);
    const errs = validateCreate({ nombre, sectorId: sids[0], pestelId: pestelId || pestelIds?.[0], descCorta });
    if (errs.length) return res.status(400).json({ error: errs[0], errors: errs });

    const idEstado  = [1, 2, 3].includes(Number(id_estado)) ? Number(id_estado) : 3;
    const newId     = randomUUID();
    const tituloFin = (tituloDes?.trim() || nombre.trim()).slice(0, 100);
    const nombreFin = nombre.trim().slice(0, 100);

    await adminRepository.ensureUniqueTitleOrName('tendencias', tituloFin, nombreFin, null);
    await adminRepository.createTendencia(newId, {
      tituloFin, nombreFin,
      descCorta: descCorta?.trim() || '',
      descLarga: sanitizeRichHtml(descLarga),
      razonCambio: razonCambio?.trim() || null,
      fuente: fuente?.trim() || null,
      urlFuente: urlFuente?.trim() || null,
      imagenUrl: imagenUrl?.trim() || null,
      videoUrl: videoUrl?.trim() || null,
      autor: autor?.trim() || null,
      idEstado,
      pestelsToInsert: Array.isArray(pestelIds) && pestelIds.length ? pestelIds : (pestelId ? [pestelId] : []),
      sids,
      senIds: Array.isArray(senalesRel) ? senalesRel : [],
      eids: Array.isArray(escenariosRel) ? escenariosRel : [],
    }, req.user.id);

    console.log(`[ADMIN] Tendencia creada id=${newId} estado=${idEstado} (by ${req.user.correo})`);
    res.status(201).json({ success: true, id: newId, estado: estadoInfo(idEstado) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe una tendencia con ese nombre. Usa uno diferente.' });
    }
    console.error('[POST /admin/tendencias]', err);
    serverError(res, err);
  }
});


router.post('/admin/escenarios', adminOnly, async (req, res) => {
  try {
    const {
      nombre, tituloDes, descCorta, descLarga, razonCambio,
      fuente, urlFuente, urlFuentes, imagenUrl, videoUrl,
      horizonte,
      pestelId, pestelIds, sectorId, sectorIds,
      senalesRel, tendenciasRel,
      id_estado = 3, autor,
    } = req.body;

    const sids = Array.isArray(sectorIds)&&sectorIds.length ? sectorIds : (sectorId?[sectorId]:[]);
    const errs = validateCreate({ nombre, sectorId: sids[0], pestelId: pestelId || pestelIds?.[0], descCorta });
    if (errs.length) return res.status(400).json({ error: errs[0], errors: errs });

    const idEstado        = [1, 2, 3].includes(Number(id_estado)) ? Number(id_estado) : 3;
    const newId           = randomUUID();
    const urlFuenteStored = serializeUrlFuentes(urlFuentes, urlFuente);
    const tituloFin       = (tituloDes?.trim() || nombre.trim()).slice(0, 100);
    const nombreFin       = nombre.trim().slice(0, 100);

    await adminRepository.ensureUniqueTitleOrName('escenarios', tituloFin, nombreFin, null);
    await adminRepository.createEscenario(newId, {
      tituloFin, nombreFin,
      descCorta: descCorta?.trim() || '',
      descLarga: sanitizeRichHtml(descLarga),
      razonCambio: razonCambio?.trim() || null,
      fuente: fuente?.trim() || null,
      urlFuenteStored,
      imagenUrl: imagenUrl?.trim() || null,
      videoUrl: videoUrl?.trim() || null,
      horizonte: horizonte?.trim() || null,
      autor: autor?.trim() || null,
      idEstado,
      pestelsToInsert: Array.isArray(pestelIds) && pestelIds.length ? pestelIds : (pestelId ? [pestelId] : []),
      sids,
      senIds: Array.isArray(senalesRel) ? senalesRel : [],
      tids: Array.isArray(tendenciasRel) ? tendenciasRel : [],
    }, req.user.id);

    console.log(`[ADMIN] Escenario creado id=${newId} estado=${idEstado} (by ${req.user.correo})`);
    res.status(201).json({ success: true, id: newId, estado: estadoInfo(idEstado) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe un escenario con ese nombre. Usa uno diferente.' });
    }
    console.error('[POST /admin/escenarios]', err);
    serverError(res, err);
  }
});


router.patch('/admin/:resource/:uuid/archive', adminOnly, async (req, res) => {
  try {
    const { resource, uuid } = req.params;
    const cfg = adminRepository.ARCHIVABLE[resource];
    if (!cfg) return res.status(404).json({ error: 'Recurso no encontrado.' });

    const row = await adminRepository.getResourceForArchive(resource, uuid);
    if (!row) return res.status(404).json({ error: `${cfg.label} no encontrada.` });

    if (Number(row.id_estado) === ARCHIVE_STATE_ID) {
      return res.json({ success: true, estado: estadoInfo(ARCHIVE_STATE_ID), alreadyArchived: true });
    }

    await adminRepository.setResourceArchived(resource, uuid, req.user.id);

    console.log(`[ADMIN] ${cfg.label} ${uuid}: archivado (by ${req.user.correo})`);
    res.json({ success: true, estado: estadoInfo(ARCHIVE_STATE_ID), fechaArchivado: new Date().toISOString() });
  } catch (err) {
    console.error('[PATCH /admin/:resource/:uuid/archive]', err);
    serverError(res, err);
  }
});

router.get('/admin/notificaciones', async (_req, res) => {
  try {
    const rows = await adminRepository.getNotificaciones();
    res.json({ data: rows });
  } catch (err) {
    console.error('[GET /admin/notificaciones]', err);
    serverError(res, err);
  }
});

import db_empl from '../db_empl.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirnameAdmin = dirname(fileURLToPath(import.meta.url));

router.post('/admin/run-empl-collation-fix', adminOnly, async (_req, res) => {
  const sqlFile = join(__dirnameAdmin, '../db/procedures_empl.sql');
  const raw = readFileSync(sqlFile, 'utf8');
  const statements = raw
    .split('\n')
    .filter(l => !/^\s*DELIMITER\b/i.test(l))
    .join('\n')
    .split('$$')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  let ok = 0; const errors = [];
  for (const sql of statements) {
    try { await db_empl.query(sql); ok++; } catch (e) { errors.push(e.message); }
  }
  res.json({ ok, errors: errors.length, details: errors.slice(0, 10) });
});

export default router;
