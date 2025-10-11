import path from 'node:path';

import dotenv from 'dotenv';

let loaded = false;

export function ensureLibGuidesEnv(): void {
  if (loaded || process.env.LIBGUIDES_SITE_ID) {
    loaded = true;
    return;
  }

  const envPath = path.resolve(process.cwd(), 'primo/.env');
  dotenv.config({ path: envPath });
  loaded = true;
}

ensureLibGuidesEnv();
