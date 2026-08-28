
import express    from 'express';
import cors       from 'cors';
import helmet     from 'helmet';
import rateLimit  from 'express-rate-limit';
import dotenv     from 'dotenv';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import logger from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });


if (!process.env.JWT_SECRET) {
  logger.error('FATAL: JWT_SECRET no esta definido en .env. El servidor no puede arrancar de forma segura.', {
    context: 'BOOT',
  });
  process.exit(1);
}

import infoRouter         from './routes/info.js';
import authRouter         from './routes/auth.js';
import senalesRouter      from './routes/senales.js';
import tendenciasRouter   from './routes/tendencias.js';
import escenariosRouter   from './routes/escenarios.js';
import catalogosRouter    from './routes/catalogos.js';
import estadisticasRouter from './routes/estadisticas.js';
import adminRouter        from './routes/admin.js';
import adminUsersRouter   from './routes/adminUsers.js';
import aiRouter           from './routes/ai.js';
import importRouter        from './routes/import.js';
import importarRouter      from './routes/importar.js';
import empleabilidadRouter, { ensureInformeEmpleabilidadSupport } from './routes/empleabilidad.js';
import curricularRouter, { ensureSilaboSupport } from './routes/curricular.js';
import cadenaRouter        from './routes/cadena.js';
import mercadoLaboralRouter from './routes/mercadoLaboral.js';
import benchmarkingRouter    from './routes/benchmarking.js';
import motorCurricularRouter from './routes/motorCurricular.js';
import { requireAuth }        from './middleware/auth.js';
import { auditMutatingRequests, auditReadRequests } from './middleware/auditMutations.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import { cleanupExpiredArchives, ensureArchiveSupport, getArchiveRetentionDays } from './services/archiveMaintenance.js';
import { ensureRadarSchemaSupport, ensureAlertasSupport } from './services/schemaMaintenance.js';
import { ensureActividadSupport, cleanupOldActividad, getActividadRetentionDays } from './services/actividadMaintenance.js';
import { runUserMigration } from './services/userMigration.js';
import actividadRouter from './routes/actividad.js';
import alertasRouter from './routes/alertas.js';
import adminSchemaRouter from './routes/adminSchema.js';
import { evaluarReglas } from './services/alertEngine.js';
import { ensureEducationXlsmImported } from './services/curricularXlsmImportService.js';
import { ensureCarreraCorrespondencia } from './services/carreraCorrespondenciaService.js';

const app  = express();
const PORT = process.env.API_PORT || 3001;
const BUILD_MARKER = 'benchmarking-direct-source-filter-2026-07-27';


app.set('trust proxy', 1);


const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'https://centro-inteligencia-educativa-estra.vercel.app',
    ];

const allowedOriginPatterns = [
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/[a-z0-9-]+\.up\.railway\.app$/i,
];

function isAllowedOrigin(origin) {
  return !origin
    || allowedOrigins.includes(origin)
    || allowedOriginPatterns.some(pattern => pattern.test(origin));
}

//----------------TI-38----------------
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  // HSTS: fuerza HTTPS por 1 año, incluye subdominios (TI-38 / TI-50)
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://*.vercel.app', 'https://*.up.railway.app', ...allowedOrigins],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      fontSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));


app.use(cors({
  origin: (origin, cb) => {

    if (isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error(`Origin no permitido: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());


//----------------TI-60----------------
// Rate limiting (control OWASP de fuerza bruta / DoS basico): limite
// general de API y uno mas estricto para autenticacion.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Espera unos minutos e intenta de nuevo.' },
});


const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de autenticación. Espera 15 minutos.' },
});

app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);


app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/version', (_req, res) => {
  res.json({
    status: 'ok',
    commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || null,
    marker: BUILD_MARKER,
  });
});

// Diagnostico temporal para monitorear la corrida de analisis curricular sin depender
// de la consola web de Railway (poco confiable, se desconecta seguido). Gateado por
// token compartido en vez de JWT porque necesita responder incluso sin sesion activa.
app.get('/api/debug/analisis-status', async (req, res) => {
  if (!process.env.DEBUG_STATUS_TOKEN || req.query.token !== process.env.DEBUG_STATUS_TOKEN) {
    return res.status(404).json({ error: 'Ruta no encontrada' });
  }
  const { execSync } = await import('child_process');
  const fs = await import('fs');
  const path = await import('path');
  const out = {};
  try {
    out.ps = execSync('ps aux | grep node').toString();
  } catch (err) {
    out.ps = `error: ${err.message}`;
  }
  try {
    out.finalLog = fs.readFileSync('/tmp/analisis_run.log', 'utf8');
  } catch (err) {
    out.finalLog = `error: ${err.message}`;
  }
  try {
    const logDir = path.join(__dirname, 'logs');
    const files = fs.readdirSync(logDir).filter(f => f.startsWith('server-') && f.endsWith('.txt')).sort();
    const latest = files[files.length - 1];
    if (latest) {
      const content = fs.readFileSync(path.join(logDir, latest), 'utf8');
      out.serverLogTail = content.trim().split('\n').slice(-40).join('\n');
    } else {
      out.serverLogTail = '(sin archivos de log)';
    }
  } catch (err) {
    out.serverLogTail = `error: ${err.message}`;
  }
  res.json(out);
});

// Relanza scripts/runDosCarreras2.js en background sin depender de la consola de
// Railway. Idempotente en el sentido de que si ya hay una corrida viva no hace nada.
app.post('/api/debug/analisis-relanzar', async (req, res) => {
  if (!process.env.DEBUG_STATUS_TOKEN || req.query.token !== process.env.DEBUG_STATUS_TOKEN) {
    return res.status(404).json({ error: 'Ruta no encontrada' });
  }
  const { spawn } = await import('child_process');
  const fs = await import('fs');
  const pidFile = '/tmp/analisis_run.pid';
  try {
    const existingPid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    if (existingPid) {
      try {
        process.kill(existingPid, 0); // no mata el proceso, solo verifica que existe
        return res.status(409).json({ error: 'Ya hay una corrida activa', pid: existingPid });
      } catch {
        // el proceso del pid guardado ya no existe, se puede relanzar
      }
    }
  } catch {
    // no hay pid file previo, se puede lanzar
  }
  const logFd = fs.openSync('/tmp/analisis_run.log', 'w');
  const child = spawn('node', ['scripts/runDosCarreras2.js'], {
    cwd: __dirname,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  fs.writeFileSync(pidFile, String(child.pid));
  res.json({ ok: true, pid: child.pid, log: '/tmp/analisis_run.log' });
});


app.use('/api', authRouter);

//----------------TI-44 / TI-59----------------
app.use('/api', requireAuth, auditMutatingRequests, auditReadRequests);

app.use('/api', requireAuth, infoRouter);


app.use('/api', requireAuth, senalesRouter);
app.use('/api', requireAuth, tendenciasRouter);
app.use('/api', requireAuth, escenariosRouter);
app.use('/api', requireAuth, catalogosRouter);
app.use('/api', requireAuth, estadisticasRouter);
app.use('/api', requireAuth, adminRouter);
app.use('/api', requireAuth, adminUsersRouter);
app.use('/api', requireAuth, aiRouter);
app.use('/api', requireAuth, importRouter);
app.use('/api', requireAuth, importarRouter);
app.use('/api', requireAuth, empleabilidadRouter);
app.use('/api', requireAuth, curricularRouter);
app.use('/api', requireAuth, cadenaRouter);
app.use('/api', requireAuth, mercadoLaboralRouter);
app.use('/api', requireAuth, benchmarkingRouter);
app.use('/api', requireAuth, motorCurricularRouter);
app.use('/api', requireAuth, actividadRouter);
app.use('/api', requireAuth, alertasRouter);
app.use('/api', requireAuth, adminSchemaRouter);


app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));


app.use(globalErrorHandler);


async function startServer() {
  try {
    //----------------TI-44 / TI-59 / OBS-01 / TI-02 / TI-53----------------
    await ensureArchiveSupport();
    await ensureRadarSchemaSupport();
    await ensureAlertasSupport();
    await ensureSilaboSupport();
    await ensureInformeEmpleabilidadSupport();
    await ensureActividadSupport();
    await runUserMigration();
    await cleanupExpiredArchives();
    await cleanupOldActividad();
    await ensureEducationXlsmImported();
    await ensureCarreraCorrespondencia();
  } catch (err) {
    logger.error(err?.message || 'No se pudo preparar soporte de esquema.', {
      context: 'SCHEMA',
      stack: err?.stack,
    });
    process.exit(1);
  }

  //----------------TI-08 / TI-23 / TI-31----------------
  evaluarReglas().catch(err => {
    logger.error(err?.message || 'Error en evaluacion inicial de reglas.', {
      context: 'ALERTAS',
      stack: err?.stack,
    });
  });

  app.listen(PORT, () => {
    console.log(`???? API corriendo en http://localhost:${PORT}`);
    console.log(`   Health:       http://localhost:${PORT}/api/health`);
    console.log(`   Se??ales:      http://localhost:${PORT}/api/senales`);
    console.log(`   Tendencias:   http://localhost:${PORT}/api/tendencias`);
    console.log(`   Escenarios:   http://localhost:${PORT}/api/escenarios`);
    console.log(`   Estad??sticas: http://localhost:${PORT}/api/estadisticas`);
    console.log(`   Papelera:      limpieza automatica a ${getArchiveRetentionDays()} dias`);
    console.log(`   Auditoria:     retencion de ${getActividadRetentionDays()} dias`);
  });
}

setInterval(() => {
  cleanupExpiredArchives().catch(err => {
    logger.error(err?.message || 'Error en limpieza programada de archivos.', {
      context: 'ARCHIVE',
      stack: err?.stack,
    });
  });
  cleanupOldActividad().catch(err => {
    logger.error(err?.message || 'Error en limpieza programada de actividad.', {
      context: 'ACTIVIDAD',
      stack: err?.stack,
    });
  });
}, 24 * 60 * 60 * 1000);

//----------------TI-08 / TI-23 / TI-31----------------
setInterval(() => {
  evaluarReglas().catch(err => {
    logger.error(err?.message || 'Error en evaluacion programada de reglas.', {
      context: 'ALERTAS',
      stack: err?.stack,
    });
  });
}, 15 * 60 * 1000);

startServer();
