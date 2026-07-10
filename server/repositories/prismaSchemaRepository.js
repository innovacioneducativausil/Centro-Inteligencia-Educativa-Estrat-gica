import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, '../prisma/principal/schema.prisma');

let cachedModels = null;

async function loadRadarModels() {
  if (cachedModels) return cachedModels;
  const schema = await readFile(schemaPath, 'utf8');
  const models = new Map();
  const modelBlocks = schema.matchAll(/model\s+(\w+)\s+\{([\s\S]*?)\n\}/g);

  for (const match of modelBlocks) {
    const [, name, body] = match;
    const columns = body
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//') && !line.startsWith('@@'))
      .map(line => {
        const [field, type] = line.split(/\s+/);
        return { Field: field, Type: type, Raw: line };
      });
    models.set(name, columns);
  }

  cachedModels = models;
  return models;
}

export async function getRadarModelNames() {
  const models = await loadRadarModels();
  return [...models.keys()].sort();
}

export async function describeRadarModel(modelName) {
  const safeModelName = String(modelName || '').replace(/[^a-zA-Z0-9_]/g, '');
  const models = await loadRadarModels();
  return {
    table: safeModelName,
    columns: models.get(safeModelName) || [],
  };
}
