import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { ensureAuth } from './auth.ts';
import { loadConfig } from './config.ts';
import { ensureSeeded, openDatabase } from './db.ts';

const config = loadConfig();
const db = openDatabase(config);
ensureSeeded(db);
const auth = ensureAuth(db, config);

const app = createApp({ config, db, auth });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`profile-page listening on http://0.0.0.0:${info.port}`);
});
