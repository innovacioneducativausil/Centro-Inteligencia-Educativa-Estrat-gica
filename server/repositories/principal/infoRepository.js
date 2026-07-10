import { describeRadarModel, getRadarModelNames } from '../prismaSchemaRepository.js';

export async function getDatabaseTables() {
  return getRadarModelNames();
}

export async function describeTable(tableName) {
  return describeRadarModel(tableName);
}
