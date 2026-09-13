import { openDatabase } from './db.js';
import { createApp } from './app.js';
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const production = process.env.NODE_ENV === 'production';
const origin = process.env.APP_ORIGIN || `http://localhost:${port}`;
if (production && !origin.startsWith('https://'))
  throw new Error('Production APP_ORIGIN must use HTTPS.');
const db = openDatabase(process.env.DATABASE_PATH || './data/gather.sqlite');
const app = createApp({ db, origin, production });
const server = app.listen(port, host, (error) => {
  if (error) {
    console.error(`Unable to start Gather: ${error.message}`);
    db.close();
    process.exit(1);
  }
  console.log(`Gather is ready at ${origin}`);
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
