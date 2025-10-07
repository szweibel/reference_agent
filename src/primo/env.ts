import path from 'node:path';

import dotenv from 'dotenv';

let loaded = false;

export function ensurePrimoEnv(): void {
  if (loaded || process.env.PRIMO_API_KEY) {
    loaded = true;
    return;
  }

  const envPath = path.resolve(process.cwd(), 'primo/.env');
  dotenv.config({ path: envPath });
  loaded = true;
}

ensurePrimoEnv();
