import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import promBundle from 'express-prom-bundle';
import { env } from './config/env';
import telemedRouter from './routes/telemed.routes';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';

const app = express();

// ─── Security & Logging ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: env.ALLOWED_ORIGINS.split(','),
  credentials: true,
}));
app.use(morgan('dev'));

// ─── Prometheus Metrics ───────────────────────────────────────────────────────
const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  promClient: { collectDefaultMetrics: {} },
});
app.use(metricsMiddleware as any);

// ─── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'telemed-service' });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/telemed', telemedRouter);

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`✅ Telemed Service running on port ${env.PORT} [${env.NODE_ENV}]`);
});

export default app;
