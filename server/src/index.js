import http from 'node:http';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { config } from './config.js';
import journeys from './routes/journeys.js';
import { initSocket } from './realtime/socket.js';

const app = express();
app.set('trust proxy', 1); // correct client IPs behind Render/Railway/Nginx for rate limiting
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'upgrade-insecure-requests': null,
        'img-src': ["'self'", 'data:', 'https://*.tile.openstreetmap.org', 'https:'],
        'connect-src': ["'self'", 'ws:', 'wss:', 'https:'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
      },
    },
  })
);
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '20kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
const guard = rateLimit({
  windowMs: 10 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Wait a few minutes and try again.' },
});
app.use('/api/journeys/join', guard);
app.use('/api/journeys/preview', guard);
// Creating journeys triggers geocoding/routing calls, so keep it modest per IP
app.post('/api/journeys', rateLimit({ windowMs: 60 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many journeys created. Try again later.' } }));

app.use('/api/journeys', journeys);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

if (config.clientDist) {
  app.use(express.static(config.clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

await mongoose.connect(config.mongoUri);
const server = http.createServer(app);
initSocket(server);
server.listen(config.port, () => {
  console.log(`Convoy listening on :${config.port}${config.clientDist ? ' (serving website)' : ''}`);
  if (config.allowSimulation) console.log('Testing mode (simulated vehicles) is enabled.');
});
