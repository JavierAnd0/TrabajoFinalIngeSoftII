#!/usr/bin/env node
/**
 * Ejecuta un comando cargando antes el .env de la raíz del monorepo.
 * Prisma solo busca .env junto a su schema, por eso `npm run db:push` fallaba
 * con "Environment variable not found: DIRECT_URL" aunque el .env raíz existiera.
 * Uso: node scripts/with-root-env.mjs <comando> [args...]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(rootEnv)) {
  for (const line of readFileSync(rootEnv, 'utf-8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const [command, ...args] = process.argv.slice(2);
const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
