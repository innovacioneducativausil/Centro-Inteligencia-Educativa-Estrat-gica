/**
 * Corre analizarMapaCurricular() directo contra el servicio, para todas las
 * carreras con malla vigente -- sin pasar por el frontend ni por una sesion
 * de usuario. Pensado para reanudar "sigue con las otras carreras" sin
 * depender del navegador ni de que la sesion de CIEE siga activa.
 *
 * Uso:
 *   node scripts/analizarTodasLasCarreras.js                -> todas las carreras
 *   node scripts/analizarTodasLasCarreras.js "Arquitectura"  -> solo esa carrera (nombre exacto)
 *
 * Requiere las mismas env vars que el server (DB + HF/GROQ keys), asi que
 * se corre en el mismo entorno (Railway console) o local con el mismo .env.
 */
import { curricularPrisma } from '../prismaClient.js';
import { analizarMapaCurricular } from '../services/analisisCurricularService.js';

const soloEsta = process.argv[2] || null;

async function main() {
  const where = soloEsta ? { nombre_carrera: soloEsta } : {};
  const carreras = await curricularPrisma.carrera.findMany({
    where,
    orderBy: [{ id_facultad: 'asc' }, { nombre_carrera: 'asc' }],
    include: { facultad: { select: { nombre_facultad: true } } },
  });

  if (!carreras.length) {
    console.log('No se encontraron carreras' + (soloEsta ? ` con nombre "${soloEsta}"` : ''));
    process.exit(1);
  }

  const resultados = [];

  for (const carrera of carreras) {
    const malla = await curricularPrisma.malla_version.findFirst({
      where: { id_carrera: carrera.id_carrera, es_vigente: true },
      select: { id_malla_version: true },
    });

    const etiqueta = `${carrera.nombre_carrera} (${carrera.facultad.nombre_facultad})`;

    if (!malla) {
      console.log(`\n[SKIP] ${etiqueta} -- sin malla vigente cargada`);
      resultados.push({ carrera: etiqueta, ok: false, error: 'sin malla vigente' });
      continue;
    }

    console.log(`\n[INICIO] ${etiqueta} -- malla_version ${malla.id_malla_version}`);
    const inicio = Date.now();

    try {
      const r = await analizarMapaCurricular(carrera.id_carrera, malla.id_malla_version);
      const seg = Math.round((Date.now() - inicio) / 1000);
      if (!r.ok) {
        console.log(`[ERROR] ${etiqueta} -- ${r.error}`);
        resultados.push({ carrera: etiqueta, ok: false, error: r.error });
      } else {
        console.log(`[OK] ${etiqueta} -- analizados=${r.analizados} omitidos=${r.omitidos} errores=${r.errores} total=${r.total} (${seg}s)`);
        resultados.push({ carrera: etiqueta, ok: true, ...r, segundos: seg });
      }
    } catch (err) {
      console.log(`[EXCEPCION] ${etiqueta} -- ${err.message}`);
      resultados.push({ carrera: etiqueta, ok: false, error: err.message });
    }
  }

  console.log('\n===== RESUMEN FINAL =====');
  for (const r of resultados) {
    if (r.ok) {
      console.log(`${r.carrera}: analizados=${r.analizados} omitidos=${r.omitidos} errores=${r.errores}/${r.total}`);
    } else {
      console.log(`${r.carrera}: NO PROCESADA (${r.error})`);
    }
  }

  await curricularPrisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fallo el script:', err);
  await curricularPrisma.$disconnect();
  process.exit(1);
});
