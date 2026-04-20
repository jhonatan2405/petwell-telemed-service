import { Request, Response } from 'express';
import {
  createSession,
  getSessionById,
  getSessionByAppointment,
  getActiveSession,
  generateAccessToken,
  startSession,
  endSession,
  cancelSession,
} from '../services/telemed.service';
import { successResponse, errorResponse } from '../utils/response.util';
import { CreateSessionBody } from '../models/telemed.model';

// ─── Helper: extract token from Authorization header ─────────────────────────
function extractToken(req: Request): string {
  return (req.headers.authorization ?? '').split(' ')[1] ?? '';
}

// ─── Helper: map service errors to HTTP responses ────────────────────────────
function handleError(err: unknown, res: Response): void {
  const e = err as NodeJS.ErrnoException;
  const code = parseInt(e.code ?? '500', 10);
  res.status(isNaN(code) ? 500 : code).json(errorResponse(e.message));
}

// ─── POST /sessions ───────────────────────────────────────────────────────────
export async function createSessionHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as CreateSessionBody;
    const { appointment_id, clinic_id, veterinarian_id, owner_id, pet_id, scheduled_at } = body;

    if (!appointment_id || !clinic_id || !veterinarian_id || !owner_id || !pet_id || !scheduled_at) {
      res.status(400).json(errorResponse(
        'Campos requeridos: appointment_id, clinic_id, veterinarian_id, owner_id, pet_id, scheduled_at'
      ));
      return;
    }

    const session = await createSession(body, extractToken(req));
    res.status(201).json(successResponse('Sesión de telemedicina creada', session));
  } catch (err) {
    handleError(err, res);
  }
}

// ─── GET /sessions/:id ────────────────────────────────────────────────────────
export async function getSessionHandler(req: Request, res: Response): Promise<void> {
  try {
    const session = await getSessionById(req.params['id']!, req.user!);
    res.status(200).json(successResponse('Sesión obtenida', session));
  } catch (err) {
    handleError(err, res);
  }
}

// ─── GET /sessions/appointment/:appointmentId ─────────────────────────────────
export async function getSessionByAppointmentHandler(req: Request, res: Response): Promise<void> {
  try {
    const session = await getSessionByAppointment(req.params['appointmentId']!, req.user!);
    res.status(200).json(successResponse('Sesión obtenida', session));
  } catch (err) {
    handleError(err, res);
  }
}

// ─── GET /sessions/active ─────────────────────────────────────────────────────
export async function getActiveSessionHandler(req: Request, res: Response): Promise<void> {
  // This endpoint is polled frequently — must NEVER return 500.
  // Always respond with 200 + { data: session | null }.
  try {
    if (!req.user) {
      res.status(200).json({ success: true, message: 'Sin sesión activa', data: null });
      return;
    }
    const session = await getActiveSession(req.user);
    res.status(200).json({ success: true, message: 'Sesión activa', data: session });
  } catch (err: any) {
    // Swallow all errors — return safe null instead of 500
    console.error('[getActiveSessionHandler] Unexpected error:', err?.message ?? err);
    res.status(200).json({ success: true, message: 'Sin sesión activa', data: null });
  }
}

// ─── POST /sessions/:id/token ─────────────────────────────────────────────────
/**
 * Genera un token privado de Daily.co para que el usuario autenticado
 * entre a la sala de videollamada.
 *
 * Reglas:
 *  - Solo owner_id o veterinarian_id pueden solicitar token.
 *  - La sesión debe estar IN_PROGRESS.
 *  - No accesible más de 5 min antes de scheduled_at.
 *
 * Retorna: { room_url, token, scheduled_at, status }
 */
export async function generateTokenHandler(req: Request, res: Response): Promise<void> {
  try {
    const result = await generateAccessToken(req.params['id']!, req.user!);
    res.status(200).json(successResponse('Token generado', result));
  } catch (err) {
    handleError(err, res);
  }
}

// ─── PATCH /sessions/:id/start ────────────────────────────────────────────────
export async function startSessionHandler(req: Request, res: Response): Promise<void> {
  try {
    const session = await startSession(req.params['id']!, req.user!);
    res.status(200).json(successResponse('Sesión iniciada', session));
  } catch (err) {
    handleError(err, res);
  }
}

// ─── PATCH /sessions/:id/end ──────────────────────────────────────────────────
export async function endSessionHandler(req: Request, res: Response): Promise<void> {
  try {
    const session = await endSession(req.params['id']!, req.user!);
    res.status(200).json(successResponse('Sesión finalizada', session));
  } catch (err) {
    handleError(err, res);
  }
}

// ─── PATCH /sessions/:id/cancel ───────────────────────────────────────────────
export async function cancelSessionHandler(req: Request, res: Response): Promise<void> {
  try {
    const session = await cancelSession(req.params['id']!, req.user!);
    res.status(200).json(successResponse('Sesión cancelada', session));
  } catch (err) {
    handleError(err, res);
  }
}
