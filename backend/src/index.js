// Must be first: ES module imports are evaluated before any statement in this
// file runs, so .env has to be loaded before ./db/index.js reads DATABASE_URL.
import 'dotenv/config';

import { createApp } from './app.js';
import { initDb } from './db/index.js';

const PORT = process.env.PORT || 3001;

const app = createApp();

try {
  await initDb();
} catch (err) {
  console.error('Failed to connect to the database:', err.message);
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
