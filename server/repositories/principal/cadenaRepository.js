import { radarPrisma } from '../../prismaClient.js';

function firstPestel(relaciones = []) {
  const pestel = relaciones.map(r => r.pestel).filter(Boolean)[0];
  return {
    pestel: pestel?.nombre_pestel || null,
    color: pestel?.color || null,
  };
}

function mapSenal(senal) {
  return {
    uuid: senal.id_senal,
    titulo: senal.titulo_senal,
    descCorta: senal.desc_corta_senal,
    urlImagen: senal.url_imagen_senal,
    fuente: senal.fuente_senal,
    urlFuente: senal.url_fuente,
    ...firstPestel(senal.senal_pestel),
  };
}

function mapTendencia(tendencia) {
  return {
    uuid: tendencia.id_tendencia,
    titulo: tendencia.titulo_tendencia,
    descCorta: tendencia.desc_corta_tendencia,
    ...firstPestel(tendencia.tendencia_pestel),
  };
}

function mapEscenario(escenario) {
  return {
    uuid: escenario.id_escenario,
    titulo: escenario.titulo_escenario,
    descCorta: escenario.desc_corta_escenario,
    probabilidad: escenario.probabilidad,
    ...firstPestel(escenario.escenario_pestel),
  };
}

export async function getTopicosConElementosActivos() {
  return radarPrisma.topico.findMany({
    where: {
      OR: [
        { senal: { some: { id_estado: 1 } } },
        { tendencia: { some: { id_estado: 1 } } },
        { escenario: { some: { id_estado: 1 } } },
      ],
    },
    orderBy: { nombre: 'asc' },
    select: { id_topico: true, nombre: true },
  });
}

export async function getCadenaTopico(idTopico) {
  const whereActivo = { id_topico: idTopico, id_estado: 1 };
  const pestelActivo = { where: { pestel: { activo: true } }, include: { pestel: true } };

  const [senalesRaw, tendenciasRaw, escenariosRaw, relSTRaw, relSERaw, relTERaw] = await Promise.all([
    radarPrisma.senal.findMany({
      where: whereActivo,
      orderBy: { fecha_publicacion: 'desc' },
      include: { senal_pestel: pestelActivo },
    }),
    radarPrisma.tendencia.findMany({
      where: whereActivo,
      orderBy: { fecha_publicacion: 'desc' },
      include: { tendencia_pestel: pestelActivo },
    }),
    radarPrisma.escenario.findMany({
      where: whereActivo,
      orderBy: { fecha_publicacion: 'desc' },
      include: { escenario_pestel: pestelActivo },
    }),
    radarPrisma.senal_tendencia.findMany({
      where: { senal: whereActivo, tendencia: whereActivo },
      select: { id_senal: true, id_tendencia: true },
    }),
    radarPrisma.senal_escenario.findMany({
      where: { senal: whereActivo, escenario: whereActivo },
      select: { id_senal: true, id_escenario: true },
    }),
    radarPrisma.tendencia_escenario.findMany({
      where: { tendencia: whereActivo, escenario: whereActivo },
      select: { id_tendencia: true, id_escenario: true },
    }),
  ]);

  return {
    senales: senalesRaw.map(mapSenal),
    tendencias: tendenciasRaw.map(mapTendencia),
    escenarios: escenariosRaw.map(mapEscenario),
    relST: relSTRaw.map(r => ({ idSenal: r.id_senal, idTendencia: r.id_tendencia })),
    relSE: relSERaw.map(r => ({ idSenal: r.id_senal, idEscenario: r.id_escenario })),
    relTE: relTERaw.map(r => ({ idTendencia: r.id_tendencia, idEscenario: r.id_escenario })),
  };
}

export async function getTopicoById(idTopico) {
  return radarPrisma.topico.findUnique({
    where: { id_topico: idTopico },
    select: { id_topico: true, nombre: true },
  });
}

export async function getElementosPublicadosByTopico(idTopico) {
  const where = { id_topico: idTopico, id_estado: 1 };
  const [senales, tendencias, escenarios] = await Promise.all([
    radarPrisma.senal.findMany({
      where,
      select: { id_senal: true, titulo_senal: true, desc_corta_senal: true },
    }),
    radarPrisma.tendencia.findMany({
      where,
      select: { id_tendencia: true, titulo_tendencia: true, desc_corta_tendencia: true },
    }),
    radarPrisma.escenario.findMany({
      where,
      select: { id_escenario: true, titulo_escenario: true, desc_corta_escenario: true },
    }),
  ]);

  return {
    senales: senales.map(s => ({ uuid: s.id_senal, titulo: s.titulo_senal, descCorta: s.desc_corta_senal })),
    tendencias: tendencias.map(t => ({ uuid: t.id_tendencia, titulo: t.titulo_tendencia, descCorta: t.desc_corta_tendencia })),
    escenarios: escenarios.map(e => ({ uuid: e.id_escenario, titulo: e.titulo_escenario, descCorta: e.desc_corta_escenario })),
  };
}

export async function countRelacionesTopico(idTopico) {
  const [cntST, cntSE, cntTE] = await Promise.all([
    radarPrisma.senal_tendencia.count({ where: { senal: { id_topico: idTopico } } }),
    radarPrisma.senal_escenario.count({ where: { senal: { id_topico: idTopico } } }),
    radarPrisma.tendencia_escenario.count({ where: { tendencia: { id_topico: idTopico } } }),
  ]);

  return cntST + cntSE + cntTE;
}

export async function getRelacionesTopico(idTopico) {
  const [relST, relSE, relTE] = await Promise.all([
    radarPrisma.senal_tendencia.findMany({
      where: { senal: { id_topico: idTopico }, tendencia: { id_topico: idTopico } },
      select: { id_senal: true, id_tendencia: true },
    }),
    radarPrisma.senal_escenario.findMany({
      where: { senal: { id_topico: idTopico }, escenario: { id_topico: idTopico } },
      select: { id_senal: true, id_escenario: true },
    }),
    radarPrisma.tendencia_escenario.findMany({
      where: { tendencia: { id_topico: idTopico }, escenario: { id_topico: idTopico } },
      select: { id_tendencia: true, id_escenario: true },
    }),
  ]);

  return [
    ...relST.map(r => ({ tipo: 'senal_tendencia', idA: r.id_senal, idB: r.id_tendencia })),
    ...relSE.map(r => ({ tipo: 'senal_escenario', idA: r.id_senal, idB: r.id_escenario })),
    ...relTE.map(r => ({ tipo: 'tendencia_escenario', idA: r.id_tendencia, idB: r.id_escenario })),
  ];
}

export async function saveRelacionInferida(rel) {
  if (rel.tipo === 'senal_tendencia') {
    await radarPrisma.senal_tendencia.createMany({
      data: [{ id_senal: rel.idA, id_tendencia: rel.idB }],
      skipDuplicates: true,
    });
    return;
  }
  if (rel.tipo === 'tendencia_escenario') {
    await radarPrisma.tendencia_escenario.createMany({
      data: [{ id_tendencia: rel.idA, id_escenario: rel.idB }],
      skipDuplicates: true,
    });
    return;
  }
  if (rel.tipo === 'senal_escenario') {
    await radarPrisma.senal_escenario.createMany({
      data: [{ id_senal: rel.idA, id_escenario: rel.idB }],
      skipDuplicates: true,
    });
  }
}
