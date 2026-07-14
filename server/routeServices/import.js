import { serverError } from '../middleware/errorHandler.js';

import { Router }     from 'express';
import multer         from 'multer';
import xlsx           from 'xlsx';
import { randomUUID } from 'crypto';
import * as importRepository from '../repositories/principal/importRepository.js';
import { sanitizeRichHtml, validateExcelUpload } from '../utils/security.js';
import { auditEvent } from '../services/auditService.js';


const COUNTRIES = [
  'Afganistán','Albania','Alemania','Andorra','Angola','Antigua y Barbuda',
  'Arabia Saudita','Argelia','Argentina','Armenia','Australia','Austria',
  'Azerbaiyán','Bahamas','Bangladés','Barbados','Baréin','Bélgica',
  'Belice','Benín','Bielorrusia','Bolivia','Bosnia y Herzegovina','Botsuana',
  'Brasil','Brunéi','Bulgaria','Burkina Faso','Burundi','Bután',
  'Cabo Verde','Camboya','Camerún','Canadá','Catar','Chad',
  'Chile','China','Chipre','Colombia','Comoras','Congo',
  'Corea del Norte','Corea del Sur','Costa de Marfil','Costa Rica','Croacia','Cuba',
  'Dinamarca','Dominica','Ecuador','Egipto','El Salvador','Emiratos Árabes Unidos',
  'Eritrea','Eslovaquia','Eslovenia','España','Estados Unidos','Estonia',
  'Etiopía','Filipinas','Finlandia','Fiyi','Francia','Gabón',
  'Gambia','Georgia','Ghana','Granada','Grecia','Guatemala',
  'Guinea','Guinea Ecuatorial','Guinea-Bisáu','Guyana','Haití','Honduras',
  'Hungría','India','Indonesia','Irak','Irán','Irlanda',
  'Islandia','Islas Marshall','Islas Salomón','Israel','Italia',
  'Jamaica','Japón','Jordania','Kazajistán','Kenia','Kirguistán',
  'Kiribati','Kosovo','Kuwait','Laos','Lesoto','Letonia',
  'Líbano','Liberia','Libia','Liechtenstein','Lituania','Luxemburgo',
  'Madagascar','Malasia','Malaui','Maldivas','Malí',
  'Malta','Marruecos','Mauricio','Mauritania','México','Micronesia',
  'Moldavia','Mónaco','Mongolia','Montenegro','Mozambique','Myanmar',
  'Namibia','Nauru','Nepal','Nicaragua','Níger','Nigeria',
  'Noruega','Nueva Zelanda','Omán','Países Bajos','Pakistán','Palaos',
  'Panamá','Papúa Nueva Guinea','Paraguay','Perú','Polonia','Portugal',
  'Reino Unido','República Centroafricana','República Checa',
  'República Democrática del Congo','República Dominicana','Ruanda',
  'Rumania','Rusia','Samoa','San Marino','Santa Lucía','Senegal',
  'Serbia','Seychelles','Sierra Leona','Singapur','Siria','Somalia',
  'Sri Lanka','Sudáfrica','Sudán','Sudán del Sur','Suecia','Suiza',
  'Surinam','Tailandia','Tanzania','Tayikistán','Togo','Tonga',
  'Trinidad y Tobago','Túnez','Turkmenistán','Turquía','Tuvalu',
  'Ucrania','Uganda','Uruguay','Uzbekistán','Vanuatu','Venezuela',
  'Vietnam','Yemen','Yibuti','Zambia','Zimbabue',

  'Global','Europa','América Latina','Asia Pacífico','Oriente Medio','África Subsahariana',

  'Palestina','Caribe','África','África Oriental','África Austral','Norte de África',
  'Sudeste Asiático','Asia Central','Asia del Sur','Asia del Sudeste','Asia-Pacífico',
  'Medio Oriente','América del Norte','América del Sur','América Central',
  'Oceanía','Europa del Este','Europa Occidental','Antártida',
];


const stripAccents = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();



const COUNTRIES_MAP      = new Map(COUNTRIES.map(c => [c.normalize('NFC').toLowerCase(), c]));
const COUNTRIES_STRIPPED = new Map(COUNTRIES.map(c => [stripAccents(c), c]));


const COUNTRY_ALIASES = new Map([
  ['united states','Estados Unidos'],['usa','Estados Unidos'],['us','Estados Unidos'],
  ['u.s.','Estados Unidos'],['u.s.a.','Estados Unidos'],
  ['uk','Reino Unido'],['united kingdom','Reino Unido'],
  ['middle east','Oriente Medio'],['latin america','América Latina'],
  ['latinoamerica','América Latina'],['latin america and caribbean','América Latina'],
  ['southeast asia','Sudeste Asiático'],['south asia','Asia del Sur'],
  ['central asia','Asia Central'],['east africa','África Oriental'],
  ['southern africa','África Austral'],['north africa','Norte de África'],
  ['sub-saharan africa','África Subsahariana'],['subsaharan africa','África Subsahariana'],
  ['caribbean','Caribe'],['asia pacific','Asia Pacífico'],['asia-pacific','Asia-Pacífico'],
  ['africa','África'],['europa','Europa'],['global','Global'],
  ['antarctica','Antártida'],['antartida','Antártida'],
]);


const PESTEL_ALIASES = new Map([
  ['energía','Ecológico'],   ['energia','Ecológico'],
  ['medio ambiente','Ecológico'], ['medioambiente','Ecológico'], ['ambiental','Ecológico'],
  ['ecológico','Ecológico'], ['ecologico','Ecológico'],
  ['tecnología','Tecnológico'], ['tecnologia','Tecnológico'], ['tech','Tecnológico'],
  ['económico','Económico'], ['economico','Económico'], ['economía','Económico'], ['economia','Económico'],
  ['social','Social'],
  ['político','Político'], ['politico','Político'],
  ['legal','Legal'], ['regulatorio','Legal'], ['normativo','Legal'],
]);


const SKIP_PHRASES = new Set([
  'no determinable desde la fuente','no determinable','nd','n/a','na',
  'sin informacion','sin información','no aplica','no aplica','desconocido',
  'global / multiple','global / múltiple','multiple','múltiple','varios','varias',
  'international','internacional',
]);


function fuzzyResolveSector(token, sectorByName, sectorById) {
  if (!token) return null;
  if (/^\d+$/.test(token) && sectorById.has(token)) return token;
  const norm     = token.normalize('NFC').toLowerCase().trim();
  const stripped = stripAccents(token);

  if (sectorByName[norm]) return sectorByName[norm];

  for (const [key, id] of Object.entries(sectorByName)) {
    if (stripAccents(key) === stripped) return id;
  }

  for (const [key, id] of Object.entries(sectorByName)) {
    const ks = stripAccents(key);
    if (ks.includes(stripped) || stripped.includes(ks)) return id;
  }
  return null;
}


function resolvePais(val) {
  if (!val) return null;
  const parts = val.split(/\s*[;/]\s*/).map(p => p.trim()).filter(Boolean);
  let allSkip = true;
  for (const part of parts) {
    const nfcKey      = part.normalize('NFC').toLowerCase().trim();
    const strippedKey = stripAccents(part);

    if (SKIP_PHRASES.has(nfcKey) || SKIP_PHRASES.has(strippedKey)) continue;
    allSkip = false;

    if (COUNTRIES_MAP.has(nfcKey))      return COUNTRIES_MAP.get(nfcKey);

    if (COUNTRIES_STRIPPED.has(strippedKey)) return COUNTRIES_STRIPPED.get(strippedKey);

    if (COUNTRY_ALIASES.has(strippedKey))    return COUNTRY_ALIASES.get(strippedKey);
  }
  return allSkip ? '__skip__' : null;
}


const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const error = validateExcelUpload(file);
    cb(error ? new Error(error) : null, !error);
  },
});


function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}


function normalizeVerbInfinitive(titulo) {
  if (!titulo) return titulo;
  const words = titulo.split(' ');
  const first = words[0];
  const low = first.toLowerCase();
  let stem, suffix;


  if (low.endsWith('ando')) {
    stem = low.slice(0, -4); suffix = 'ar';
  } else if (low.endsWith('iendo')) {


    const s = low.slice(0, -5);
    stem = s; suffix = s.endsWith('u') ? 'ir' : 'er';
  } else if (low.endsWith('yendo')) {

    stem = low.slice(0, -5); suffix = stem.length === 0 ? 'ir' : 'ir';
  }

  else if (low.endsWith('ará') || low.endsWith('ara')) {
    stem = low.slice(0, -3); suffix = 'ar';
  } else if (low.endsWith('erá') || low.endsWith('era')) {
    stem = low.slice(0, -3); suffix = 'er';
  } else if (low.endsWith('irá') || low.endsWith('ira')) {
    stem = low.slice(0, -3); suffix = 'ir';
  }

  else if (low.endsWith('ado')) {
    stem = low.slice(0, -3); suffix = 'ar';
  } else if (low.endsWith('ido')) {
    stem = low.slice(0, -3); suffix = 'ir';
  }

  if (!stem && stem !== '') return titulo;
  const infinitive = stem + suffix;

  const normalized = infinitive.charAt(0).toUpperCase() + infinitive.slice(1);
  return [normalized, ...words.slice(1)].join(' ');
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol))
      return res.status(403).json({ error: 'Acceso denegado.' });
    next();
  };
}
const adminOnly = requireRole('admin', 'analista');


function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString().slice(0, 10);

  if (typeof val === 'number') {
    const d = xlsx.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}


router.post('/admin/senales/import', adminOnly, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });

  try {

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];

    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' })
      .map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim(), v])));

    if (rows.length === 0)
      return res.status(400).json({ error: 'El archivo no contiene filas de datos.' });


    const { pestels, sectors } = await importRepository.getPestelsAndSectors();

    const normalize = s => s.normalize('NFC').toLowerCase().trim();

    const pestelByName = Object.fromEntries(
      pestels.map(p => [normalize(p.nombre_pestel), p.id_pestel])
    );
    const pestelById = new Set(pestels.map(p => String(p.id_pestel)));

    const sectorByName = Object.fromEntries(
      sectors.map(s => [normalize(s.nombre_sector), s.id_sector])
    );
    const sectorById = new Set(sectors.map(s => String(s.id_sector)));


    const resolvePestel = token => {
      if (/^\d+$/.test(token) && pestelById.has(token)) return Number(token);
      const direct = pestelByName[normalize(token)];
      if (direct) return direct;
      const aliased = PESTEL_ALIASES.get(stripAccents(token));
      return aliased ? (pestelByName[normalize(aliased)] ?? null) : null;
    };
    const resolveSector = token => fuzzyResolveSector(token, sectorByName, sectorById);


    let imported = 0;
    const errors   = [];
    const warnings = [];

    for (let i = 0; i < rows.length; i++) {
      const row    = rows[i];
      const rowNum = i + 2;

      try {

        const titulo   = String(row.titulo_senal   || '').trim();
        const descCorta = String(row.desc_corta_senal || '').trim();

        if (!titulo)    { errors.push({ fila: rowNum, error: 'titulo_senal es obligatorio' });    continue; }
        if (!descCorta) { errors.push({ fila: rowNum, error: 'desc_corta_senal es obligatorio' }); continue; }


        const nombre      = capitalizeFirst(String(row.nombre_senal || titulo).trim()).slice(0, 180);
        const descLargaRaw = String(row.desc_larga_senal || '').trim();
      const descLarga   = sanitizeRichHtml(descLargaRaw.slice(0, 10000)) || null;
        const fuente      = String(row.fuente_senal       || '').trim() || null;
        const urlFuente   = String(row.url_fuente         || '').trim() || null;
        const urlImagen   = String(row.url_imagen_senal   || '').trim() || null;
        const urlVideo    = String(row.url_video_senal    || '').trim() || null;
        const paisRawS    = String(row.pais_origen || '').trim();
        let   paisOrigen  = null;
        if (paisRawS) {
          const pr = resolvePais(paisRawS);
          if (pr === '__skip__' || pr !== null) { paisOrigen = pr === '__skip__' ? null : pr; }
          else warnings.push({ fila: rowNum, aviso: `pais_origen "${paisRawS}" no está en la lista de países, se ignoró` });
        }
        const topicoNombre = String(row.topico_senal || '').trim() || null;
        const idTopico = await importRepository.resolveTopico(topicoNombre);

        const fechaArticulo = parseDate(row.fecha_senal_articulo);

        const idEstado = [1, 2, 3].includes(Number(row.id_estado)) ? Number(row.id_estado) : 3;
        let fechaPublicacion = null;
        if (idEstado === 1) {
          fechaPublicacion = parseDate(row.fecha_publicacion) || new Date().toISOString().slice(0, 10);
        }

        const newId = randomUUID();

        const tituloFinal = capitalizeFirst(titulo).slice(0, 180);
        const dup = await importRepository.findDuplicateTitleOrName('senal', 'id_senal', 'titulo_senal', 'nombre_senal', tituloFinal, nombre);
        if (dup) {
          errors.push({ fila: rowNum, error: 'Ya existe una señal con ese titulo o nombre' });
          continue;
        }

        await importRepository.insertSenal({
          newId, tituloFinal, nombre,
          descCorta: descCorta.slice(0, 280), descLarga,
          fuente, urlFuente, urlImagen, urlVideo,
          paisOrigen, idTopico, fechaArticulo,
          idEstado, usuarioId: req.user.id, fechaPublicacion,
        });

        const pestelRaw = String(row.id_pestel || row.pestel || row.nombre_pestel || '').trim();
        if (pestelRaw) {
          const tokens = pestelRaw.split(/[;,]/).map(n => n.trim()).filter(Boolean);
          for (const token of tokens) {
            const pid = resolvePestel(token);
            if (pid) {
              await importRepository.insertSenalPestel(newId, pid);
            } else {
              warnings.push({ fila: rowNum, aviso: `PESTEL "${token}" no encontrado en catálogo, se ignoró` });
            }
          }
        }

        const sectorRaw = String(row.id_sector || row.sector || '').trim();
        if (sectorRaw) {
          const tokens = sectorRaw.split(/[;,]/).map(n => n.trim()).filter(Boolean);
          for (const token of tokens) {
            const sid = resolveSector(token);
            if (sid) {
              await importRepository.insertSenalSector(newId, sid);
            } else {
              warnings.push({ fila: rowNum, aviso: `Sector "${token}" no encontrado en catálogo, se ignoró` });
            }
          }
        }

        imported++;
      } catch (rowErr) {
        errors.push({ fila: rowNum, error: rowErr.message });
      }
    }

    console.log(`[IMPORT] Señales: ${imported}/${rows.length} importadas (by ${req.user.correo}), ${warnings.length} avisos`);
    await auditEvent(req, {
      evento: 'importacion_senales',
      accion: 'importar',
      modulo: 'gestion',
      entidad: 'senal',
      detalle: `Importacion de senales: ${imported}/${rows.length} filas importadas`,
      metadata: { archivo: req.file.originalname, imported, total: rows.length, errors: errors.length, warnings: warnings.length },
    });
    res.json({ success: true, imported, total: rows.length, errors, warnings });
  } catch (err) {
    console.error('[POST /admin/senales/import]', err);
    serverError(res, err);
  }
});


router.post('/admin/tendencias/import', adminOnly, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' })
      .map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim(), v])));

    if (rows.length === 0)
      return res.status(400).json({ error: 'El archivo no contiene filas de datos.' });


    const { pestels, sectors } = await importRepository.getPestelsAndSectors();
    const normalize = s => s.normalize('NFC').toLowerCase().trim();
    const pestelByName = Object.fromEntries(pestels.map(p => [normalize(p.nombre_pestel), p.id_pestel]));
    const pestelById   = new Set(pestels.map(p => String(p.id_pestel)));
    const sectorByName = Object.fromEntries(sectors.map(s => [normalize(s.nombre_sector), s.id_sector]));
    const sectorById   = new Set(sectors.map(s => String(s.id_sector)));
    const resolvePestel = t => { if (/^\d+$/.test(t) && pestelById.has(t)) return Number(t); const d = pestelByName[normalize(t)]; if (d) return d; const a = PESTEL_ALIASES.get(stripAccents(t)); return a ? (pestelByName[normalize(a)] ?? null) : null; };
    const resolveSector = t => fuzzyResolveSector(t, sectorByName, sectorById);

    let imported = 0;
    const errors = [], warnings = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], rowNum = i + 2;
      try {
        const titulo    = String(row.titulo_tendencia    || '').trim();
        const nombre    = capitalizeFirst(normalizeVerbInfinitive(String(row.nombre_tendencia || titulo).trim()));
        const descCorta = String(row.desc_corta_tendencia || '').trim();

        if (!titulo)    { errors.push({ fila: rowNum, error: 'titulo_tendencia es obligatorio' });    continue; }
        if (!nombre)    { errors.push({ fila: rowNum, error: 'nombre_tendencia es obligatorio' });    continue; }

        const tituloFinal = capitalizeFirst(normalizeVerbInfinitive(titulo)).slice(0, 180);

        const descLargaRaw = String(row.desc_larga_tendencia || '').trim();
      const descLarga  = sanitizeRichHtml(descLargaRaw.slice(0, 10000)) || null;
        const fuente     = String(row.fuente_tendencia      || '').trim() || null;
        const urlFuente  = String(row.url_fuente            || '').trim() || null;
        const urlImagen  = String(row.url_imagen_tendencia  || '').trim() || null;
        const urlVideo   = String(row.url_video_tendencia   || '').trim() || null;
        const paisRaw    = String(row.pais_origen || '').trim();
        let   paisOrigen = null;
        if (paisRaw) {
          const pr = resolvePais(paisRaw);
          if (pr === '__skip__' || pr !== null) { paisOrigen = pr === '__skip__' ? null : pr; }
          else warnings.push({ fila: rowNum, aviso: `pais_origen "${paisRaw}" no está en la lista de países, se ignoró` });
        }
        const logica     = String(row.logica                || '').trim() || null;

        const topicoPrincipalNombre = String(row.topico_principal || '').trim() || null;
        const idTopicoPrincipal = await importRepository.resolveTopico(topicoPrincipalNombre);
        const topicoRelacRaw = String(row.topico_relacionado || '').trim();
        const idEstado   = [1,2,3].includes(Number(row.id_estado)) ? Number(row.id_estado) : 3;
        const fechaPub   = idEstado === 1 ? (parseDate(row.fecha_publicacion) || new Date().toISOString().slice(0,10)) : null;
        const newId      = randomUUID();
        const nombreFinal = nombre.slice(0, 180);
        const dup = await importRepository.findDuplicateTitleOrName('tendencia', 'id_tendencia', 'titulo_tendencia', 'nombre_tendencia', tituloFinal, nombreFinal);
        if (dup) {
          errors.push({ fila: rowNum, error: 'Ya existe una tendencia con ese titulo o nombre' });
          continue;
        }

        await importRepository.insertTendencia({
          newId, tituloFinal, nombreFinal, descCorta: descCorta.slice(0, 280), descLarga,
          fuente, urlFuente, urlImagen, urlVideo, paisOrigen, logica, idTopicoPrincipal,
          idEstado, usuarioId: req.user.id, fechaPub,
        });

        const pestelRaw = String(row.id_pestel || row.pestel || row.nombre_pestel || '').trim();
        if (pestelRaw) {
          for (const t of pestelRaw.split(/[;,]/).map(n => n.trim()).filter(Boolean)) {
            const pid = resolvePestel(t);
            if (pid) await importRepository.insertTendenciaPestel(newId, pid);
            else warnings.push({ fila: rowNum, aviso: `PESTEL "${t}" no encontrado, se ignoró` });
          }
        }
        const sectorRaw = String(row.id_sector || row.sector || '').trim();
        if (sectorRaw) {
          for (const t of sectorRaw.split(/[;,]/).map(n => n.trim()).filter(Boolean)) {
            const sid = resolveSector(t);
            if (sid) await importRepository.insertTendenciaSector(newId, sid);
            else warnings.push({ fila: rowNum, aviso: `Sector "${t}" no encontrado, se ignoró` });
          }
        }

        if (topicoRelacRaw) {
          for (const tn of topicoRelacRaw.split(/\s*;\s*/).map(t => t.trim()).filter(Boolean)) {
            const rid = await importRepository.resolveTopico(tn);
            if (rid) await importRepository.insertTopicoRelacTendencia(rid, newId);
          }
        }
        imported++;
      } catch (rowErr) {
        errors.push({ fila: rowNum, error: rowErr.message });
      }
    }

    console.log(`[IMPORT] Tendencias: ${imported}/${rows.length} importadas (by ${req.user.correo}), ${warnings.length} avisos`);
    await auditEvent(req, {
      evento: 'importacion_tendencias',
      accion: 'importar',
      modulo: 'gestion',
      entidad: 'tendencia',
      detalle: `Importacion de tendencias: ${imported}/${rows.length} filas importadas`,
      metadata: { archivo: req.file.originalname, imported, total: rows.length, errors: errors.length, warnings: warnings.length },
    });
    res.json({ success: true, imported, total: rows.length, errors, warnings });
  } catch (err) {
    console.error('[POST /admin/tendencias/import]', err);
    serverError(res, err);
  }
});


router.post('/admin/escenarios/import', adminOnly, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' })
      .map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim(), v])));

    if (rows.length === 0)
      return res.status(400).json({ error: 'El archivo no contiene filas de datos.' });

    const { pestels, sectors } = await importRepository.getPestelsAndSectors();
    const normalize = s => s.normalize('NFC').toLowerCase().trim();
    const pestelByName = Object.fromEntries(pestels.map(p => [normalize(p.nombre_pestel), p.id_pestel]));
    const pestelById   = new Set(pestels.map(p => String(p.id_pestel)));
    const sectorByName = Object.fromEntries(sectors.map(s => [normalize(s.nombre_sector), s.id_sector]));
    const sectorById   = new Set(sectors.map(s => String(s.id_sector)));
    const resolvePestel = t => { if (/^\d+$/.test(t) && pestelById.has(t)) return Number(t); const d = pestelByName[normalize(t)]; if (d) return d; const a = PESTEL_ALIASES.get(stripAccents(t)); return a ? (pestelByName[normalize(a)] ?? null) : null; };
    const resolveSector = t => fuzzyResolveSector(t, sectorByName, sectorById);

    const HORIZONTES_VALID = new Set(['2027','2028','2030','2035','2040','2050','largo_plazo']);

    let imported = 0;
    const errors = [], warnings = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], rowNum = i + 2;
      try {
        const titulo    = String(row.titulo_escenario    || '').trim();
        const nombre    = capitalizeFirst(String(row.nombre_escenario || titulo).trim());
        const descCorta = String(row.desc_corta_escenario || '').trim();

        if (!titulo)    { errors.push({ fila: rowNum, error: 'titulo_escenario es obligatorio' });    continue; }
        if (!nombre)    { errors.push({ fila: rowNum, error: 'nombre_escenario es obligatorio' });    continue; }

        const tituloFinal = capitalizeFirst(titulo).slice(0, 180);

        const descLargaRaw = String(row.desc_larga_escenario || '').trim();
      const descLarga  = sanitizeRichHtml(descLargaRaw.slice(0, 10000)) || null;
        const fuente     = String(row.fuente_escenario      || '').trim() || null;

        const urlFuenteRaw = String(row.url_fuente || '').trim();
        const urlFuenteArr = urlFuenteRaw ? urlFuenteRaw.split(/\s*;\s*/).map(u => u.trim()).filter(Boolean) : [];
        const urlFuente  = urlFuenteArr.length ? JSON.stringify(urlFuenteArr) : null;
        const urlImagen  = String(row.url_imagen_escenario  || '').trim() || null;
        const urlVideo   = String(row.url_video_escenario   || '').trim() || null;
        const horizonte  = String(row.horizonte_escenario   || '').trim().toLowerCase() || null;
        const topicoEscNombre = String(row.topico_escenario || '').trim() || null;
        const idTopico = await importRepository.resolveTopico(topicoEscNombre);
        const probRaw    = Number(row.probabilidad);
        const probabilidad = [1,2,3,4,5].includes(probRaw) ? probRaw : null;
        if (row.probabilidad !== '' && row.probabilidad !== undefined && probabilidad === null)
          warnings.push({ fila: rowNum, aviso: `probabilidad "${row.probabilidad}" inválida (debe ser 1-5), se ignoró` });
        const idEstado   = [1,2,3].includes(Number(row.id_estado)) ? Number(row.id_estado) : 3;
        const fechaPub   = idEstado === 1 ? (parseDate(row.fecha_publicacion) || new Date().toISOString().slice(0,10)) : null;
        const newId      = randomUUID();
        const nombreFinal = nombre.slice(0, 180);
        const dup = await importRepository.findDuplicateTitleOrName('escenario', 'id_escenario', 'titulo_escenario', 'nombre_escenario', tituloFinal, nombreFinal);
        if (dup) {
          errors.push({ fila: rowNum, error: 'Ya existe un escenario con ese titulo o nombre' });
          continue;
        }

        if (horizonte && !HORIZONTES_VALID.has(horizonte))
          warnings.push({ fila: rowNum, aviso: `horizonte_escenario "${horizonte}" no reconocido, se guardará tal cual` });

        await importRepository.insertEscenario({
          newId, tituloFinal, nombreFinal, descCorta: descCorta.slice(0, 280), descLarga,
          fuente, urlFuente, urlImagen, urlVideo, horizonte, probabilidad, idTopico,
          idEstado, usuarioId: req.user.id, fechaPub,
        });

        const pestelRaw = String(row.id_pestel || row.pestel || row.nombre_pestel || '').trim();
        if (pestelRaw) {
          for (const t of pestelRaw.split(/[;,]/).map(n => n.trim()).filter(Boolean)) {
            const pid = resolvePestel(t);
            if (pid) await importRepository.insertEscenarioPestel(newId, pid);
            else warnings.push({ fila: rowNum, aviso: `PESTEL "${t}" no encontrado, se ignoró` });
          }
        }
        const sectorRaw = String(row.id_sector || row.sector || '').trim();
        if (sectorRaw) {
          for (const t of sectorRaw.split(/[;,]/).map(n => n.trim()).filter(Boolean)) {
            const sid = resolveSector(t);
            if (sid) await importRepository.insertEscenarioSector(newId, sid);
            else warnings.push({ fila: rowNum, aviso: `Sector "${t}" no encontrado, se ignoró` });
          }
        }
        imported++;
      } catch (rowErr) {
        errors.push({ fila: rowNum, error: rowErr.message });
      }
    }

    console.log(`[IMPORT] Escenarios: ${imported}/${rows.length} importados (by ${req.user.correo}), ${warnings.length} avisos`);
    await auditEvent(req, {
      evento: 'importacion_escenarios',
      accion: 'importar',
      modulo: 'gestion',
      entidad: 'escenario',
      detalle: `Importacion de escenarios: ${imported}/${rows.length} filas importadas`,
      metadata: { archivo: req.file.originalname, imported, total: rows.length, errors: errors.length, warnings: warnings.length },
    });
    res.json({ success: true, imported, total: rows.length, errors, warnings });
  } catch (err) {
    console.error('[POST /admin/escenarios/import]', err);
    serverError(res, err);
  }
});


router.post('/admin/relaciones/import', adminOnly, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });
  try {
    const workbook  = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames.includes('Relaciones') ? 'Relaciones' : workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];
    const rows      = xlsx.utils.sheet_to_json(sheet, { defval: '' })
      .map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim(), v])));

    if (rows.length === 0)
      return res.status(400).json({ error: 'La hoja no contiene filas de datos.' });


    const normalizeType = t => stripAccents(t.toLowerCase().trim());

    let imported = 0;
    const errors = [], warnings = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], rowNum = i + 2;
      try {
        const origenTipo     = normalizeType(String(row.origen_tipo    || ''));
        const origenNombre   = String(row.origen_nombre  || '').trim();
        const destinoTipo    = normalizeType(String(row.destino_tipo   || ''));
        const destinoNombres = String(row.destino_nombre || '').split(';').map(s => s.trim()).filter(Boolean);


        if (!origenTipo && !origenNombre && !destinoTipo && destinoNombres.length === 0) continue;
        if (!origenTipo || !origenNombre || !destinoTipo || destinoNombres.length === 0) {
          errors.push({ fila: rowNum, error: 'Faltan columnas obligatorias: origen_tipo, origen_nombre, destino_tipo, destino_nombre' });
          continue;
        }
        const validTypes = ['senal', 'tendencia', 'escenario'];
        if (!validTypes.includes(origenTipo))  { errors.push({ fila: rowNum, error: `origen_tipo inválido: "${origenTipo}"` }); continue; }
        if (!validTypes.includes(destinoTipo)) { errors.push({ fila: rowNum, error: `destino_tipo inválido: "${destinoTipo}"` }); continue; }
        if (origenTipo === destinoTipo) { errors.push({ fila: rowNum, error: 'origen_tipo y destino_tipo no pueden ser iguales' }); continue; }

        const origenId = await importRepository.resolveItem(origenTipo, origenNombre);
        if (!origenId) { warnings.push({ fila: rowNum, aviso: `No se encontró ${origenTipo} con nombre "${origenNombre}"` }); continue; }

        for (const destNombre of destinoNombres) {
          const destinoId = await importRepository.resolveItem(destinoTipo, destNombre);
          if (!destinoId) { warnings.push({ fila: rowNum, aviso: `No se encontró ${destinoTipo} con nombre "${destNombre}"` }); continue; }

          const pair = [origenTipo, destinoTipo].sort().join('_');
          if (pair === 'senal_tendencia') {
            const senId  = origenTipo === 'senal'     ? origenId : destinoId;
            const tendId = origenTipo === 'tendencia' ? origenId : destinoId;
            await importRepository.insertRelacionSenalTendencia(senId, tendId);
          } else if (pair === 'escenario_senal') {
            const senId  = origenTipo === 'senal'     ? origenId : destinoId;
            const escId  = origenTipo === 'escenario' ? origenId : destinoId;
            await importRepository.insertRelacionSenalEscenario(senId, escId);
          } else if (pair === 'escenario_tendencia') {
            const tendId = origenTipo === 'tendencia' ? origenId : destinoId;
            const escId  = origenTipo === 'escenario' ? origenId : destinoId;
            await importRepository.insertRelacionTendenciaEscenario(tendId, escId);
          }
          imported++;
        }
      } catch (rowErr) {
        errors.push({ fila: rowNum, error: rowErr.message });
      }
    }

    console.log(`[IMPORT] Relaciones: ${imported}/${rows.length} importadas (by ${req.user.correo}), ${warnings.length} avisos`);
    await auditEvent(req, {
      evento: 'importacion_relaciones',
      accion: 'importar',
      modulo: 'gestion',
      entidad: 'relacion',
      detalle: `Importacion de relaciones: ${imported}/${rows.length} filas procesadas`,
      metadata: { archivo: req.file.originalname, imported, total: rows.length, errors: errors.length, warnings: warnings.length },
    });
    res.json({ success: true, imported, total: rows.length, errors, warnings });
  } catch (err) {
    console.error('[POST /admin/relaciones/import]', err);
    serverError(res, err);
  }
});

export default router;
