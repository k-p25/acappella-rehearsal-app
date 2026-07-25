import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import rehearsalRoutes from './routes/rehearsals.js';
import absenceRoutes from './routes/absences.js';
import gigRoutes from './routes/gigs.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/rehearsals', rehearsalRoutes);
  app.use('/api/absences', absenceRoutes);
  app.use('/api/gigs', gigRoutes);

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
