import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  createSessionHandler,
  getSessionHandler,
  getSessionByAppointmentHandler,
  getActiveSessionHandler,
  generateTokenHandler,
  startSessionHandler,
  endSessionHandler,
  cancelSessionHandler,
} from '../controllers/telemed.controller';

const router = Router();

// All telemed routes require a valid JWT
router.use(authenticate);

// ── GET /sessions/appointment/:appointmentId — must be BEFORE /sessions/:id ──
router.get('/sessions/appointment/:appointmentId', getSessionByAppointmentHandler);

// ── GET /sessions/active ───────────────────────────────────────────────────────
router.get('/sessions/active', getActiveSessionHandler);

// ── POST /sessions ─────────────────────────────────────────────────────────────
router.post('/sessions', createSessionHandler);

// ── GET /sessions/:id ──────────────────────────────────────────────────────────
router.get('/sessions/:id', getSessionHandler);

// ── POST /sessions/:id/token ───────────────────────────────────────────────────
// Genera token privado de Daily.co para entrar a la sala de videollamada.
// Solo el owner_id y el veterinarian_id de la sesión pueden solicitarlo.
// La sesión debe estar IN_PROGRESS y dentro de la ventana de tiempo.
router.post('/sessions/:id/token', generateTokenHandler);

// ── PATCH /sessions/:id/start ──────────────────────────────────────────────────
router.patch('/sessions/:id/start', startSessionHandler);

// ── PATCH /sessions/:id/end ────────────────────────────────────────────────────
router.patch('/sessions/:id/end', endSessionHandler);

// ── PATCH /sessions/:id/cancel ─────────────────────────────────────────────────
router.patch('/sessions/:id/cancel', cancelSessionHandler);

export default router;
