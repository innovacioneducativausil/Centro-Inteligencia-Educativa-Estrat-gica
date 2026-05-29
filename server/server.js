// server/server.js — Servidor principal Express
import express    from 'express';
import cors       from 'cors';
import helmet     from 'helmet';
import rateLimit  from 'express-rate-limit';
import dotenv     from 'dotenv';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

// ── Verificar variables críticas al arrancar ─────────────
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET no está definido en .env. El servidor no puede arrancar de forma segura.');
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
import aiRouter           from './routes/ai.js';
import importRouter        from './routes/import.js';
import importarRouter      from './routes/importar.js';
import empleabilidadRouter from './routes/empleabilidad.js';
import curricularRouter    from './routes/curricular.js';
import cadenaRouter        from './routes/cadena.js';
import mercadoLaboralRouter from './routes/mercadoLaboral.js';
import benchmarkingRouter    from './routes/benchmarking.js';
import motorCurricularRouter from './routes/motorCurricular.js';
import { requireAuth }        from './middleware/auth.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import { cleanupExpiredArchives, ensureArchiveSupport, getArchiveRetentionDays } from './services/archiveMaintenance.js';
import { ensureRadarSchemaSupport } from './services/schemaMaintenance.js';
import { ensureActividadSupport } from './services/actividadMaintenance.js';
import { runUserMigration } from './services/userMigration.js';
import actividadRouter from './routes/actividad.js';

const app  = express();
const PORT = process.env.API_PORT || 3001;

// Necesario para Railway/Vercel (proxy inverso)
app.set('trust proxy', 1);

// ── Orígenes permitidos (configurable por env) ───────────
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

// ── Helmet: cabeceras HTTP de seguridad ──────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false, // necesario si sirves assets externos
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", ...allowedOrigins],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      fontSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));

// ── CORS ─────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    // Permitir requests sin origin (curl, Postman, mismo servidor)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`Origin no permitido: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' })); // límite explícito al body JSON
app.use(cookieParser());

// ── Rate limiting ─────────────────────────────────────────
// Límite general: 200 req / 15 min por IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Espera unos minutos e intenta de nuevo.' },
});

// Límite estricto para auth: 20 req / 15 min por IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de autenticación. Espera 15 minutos.' },
});

app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);

// ── Health check ──────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' }); // sin timestamp para no filtrar info del servidor
});

// ── Rutas públicas (sin JWT) ──────────────────────────────
app.use('/api', authRouter);
// info solo accesible con JWT (expone esquema de BD)
app.use('/api', requireAuth, infoRouter);

// ── Rutas protegidas (requieren JWT) ────────────────────
app.use('/api', requireAuth, senalesRouter);
app.use('/api', requireAuth, tendenciasRouter);
app.use('/api', requireAuth, escenariosRouter);
app.use('/api', requireAuth, catalogosRouter);
app.use('/api', requireAuth, estadisticasRouter);
app.use('/api', requireAuth, adminRouter);
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

// ── 404 genérico ─────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ── Error handler global (last) ───────────────────────────
app.use(globalErrorHandler);

// ── Arrancar servidor ───────────────────────────────────
ensureArchiveSupport()
  .then(() => ensureRadarSchemaSupport())
  .then(() => ensureActividadSupport())
  .then(() => runUserMigration())
  .then(() => cleanupExpiredArchives())
  .catch(err => console.error('[SCHEMA] No se pudo preparar soporte de esquema:', err.message));

setInterval(() => {
  cleanupExpiredArchives().catch(err => {
    console.error('[ARCHIVE] Error en limpieza programada:', err.message);
  });
}, 24 * 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`🚀 API corriendo en http://localhost:${PORT}`);
  console.log(`   Health:       http://localhost:${PORT}/api/health`);
  console.log(`   Señales:      http://localhost:${PORT}/api/senales`);
  console.log(`   Tendencias:   http://localhost:${PORT}/api/tendencias`);
  console.log(`   Escenarios:   http://localhost:${PORT}/api/escenarios`);
  console.log(`   Estadísticas: http://localhost:${PORT}/api/estadisticas`);
  console.log(`   Papelera:      limpieza automatica a ${getArchiveRetentionDays()} dias`);
});
