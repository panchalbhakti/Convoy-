import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const required = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}. Copy .env.example to .env and set it.`);
  return v;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');
const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/convoy',
  jwtSecret: required('JWT_SECRET'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  joinCodeTtlHours: Number(process.env.JOIN_CODE_TTL_HOURS || 48),
  orsApiKey: process.env.ORS_API_KEY || '',
  nominatimUserAgent: process.env.NOMINATIM_USER_AGENT || 'ConvoyApp/1.0 (set NOMINATIM_USER_AGENT to your contact email)',
  // Testing mode (simulated vehicles). On by default in development, off in production unless enabled.
  allowSimulation: process.env.ALLOW_SIMULATION ? process.env.ALLOW_SIMULATION === 'true' : !isProd,
  // Serve the built React app from this server (single-service deployment)
  clientDist: process.env.SERVE_CLIENT === 'false' ? null : fs.existsSync(clientDist) ? clientDist : null,
};
