import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function readJson(fileName) {
  const filePath = path.join(process.cwd(), 'public', fileName);
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

export async function GET() {
  const [conchas, bisuteria] = await Promise.all([
    readJson('catalogo-conchas.json'),
    readJson('catalogo-fotos.json'),
  ]);

  return Response.json(
    [...conchas, ...bisuteria],
    { headers: { 'cache-control': 'no-store' } },
  );
}
