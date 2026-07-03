
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
import adminUsersRouter   from './routes/adminUsers.js';
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
import { auditMutatingRequests, auditReadRequests } from './middleware/auditMutations.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import { cleanupExpiredArchives, ensureArchiveSupport, getArchiveRetentionDays } from './services/archiveMaintenance.js';
import { ensureRadarSchemaSupport } from './services/schemaMaintenance.js';
import { ensureActividadSupport, cleanupOldActividad, getActividadRetentionDays } from './services/actividadMaintenance.js';
import { runUserMigration } from './services/userMigration.js';
import actividadRouter from './routes/actividad.js';

const app  = express();
const PORT = process.env.API_PORT || 3001;


app.set('trust proxy', 1);


const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://centro-inteligencia-educativa-estra.vercel.app',
    ];


app.use(helmet({
  crossOriginEmbedderPolicy: false,
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


app.use(cors({
  origin: (origin, cb) => {

    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`Origin no permitido: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());


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


app.use('/api', authRouter);

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


app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));


app.use(globalErrorHandler);


async function startServer() {
  try {
    await ensureArchiveSupport();
    await ensureRadarSchemaSupport();
    await ensureActividadSupport();
    await runUserMigration();
    await cleanupExpiredArchives();
    await cleanupOldActividad();
  } catch (err) {
    console.error('[SCHEMA] No se pudo preparar soporte de esquema:', err.message);
    process.exit(1);
  }

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
    console.error('[ARCHIVE] Error en limpieza programada:', err.message);
  });
  cleanupOldActividad().catch(err => {
    console.error('[ACTIVIDAD] Error en limpieza programada:', err.message);
  });
}, 24 * 60 * 60 * 1000);

startServer();
