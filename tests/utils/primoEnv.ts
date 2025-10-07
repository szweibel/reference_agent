import fs from 'node:fs';
import path from 'node:path';

declare global {
  // eslint-disable-next-line no-var
  var __primoEnvLoaded: boolean | undefined;
}

export function loadPrimoEnv(): void {
  if (globalThis.__primoEnvLoaded) {
    return;
  }

  const envPath = path.resolve(process.cwd(), 'primo/.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Expected Primo environment file at ${envPath}`);
  }

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }

    const upperKey = key.toUpperCase();
    if (!(upperKey in process.env)) {
      process.env[upperKey] = value;
    }
  }

  globalThis.__primoEnvLoaded = true;
}
