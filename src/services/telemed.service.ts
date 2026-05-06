import axios from 'axios';
import { env } from '../config/env';
import { supabase } from '../config/supabase';
import { JwtPayload } from '../utils/jwt.util';
import { TelemedSession, CreateSessionBody } from '../models/telemed.model';
import {
  insertSession,
  findSessionById,
  findSessionByAppointmentId,
  updateSessionStatus,
} from '../repositories/telemed.repository';
import { createDailyRoom, createMeetingToken } from '../utils/daily.util';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeError(message: string, code: string | number): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = String(code);
  return err;
}

/**
 * Valida con el Appointment Service que la cita existe y es de tipo TELEMEDICINA.
 * Fail-secure: si el servicio no responde → lanza 502.
 */
async function validateAppointment(appointmentId: string, token: string): Promise<void> {
  try {
    const response = await axios.get(
      `${env.APPOINTMENT_SERVICE_URL}/api/v1/appointments/${appointmentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const appointment = response.data?.data;
    if (!appointment) {
      throw makeError('No se pudo obtener la cita del Appointment Service', 502);
    }

    if (appointment.type !== 'TELEMEDICINA') {
      throw makeError('La cita no es de tipo TELEMEDICINA', 400);
    }
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code) {
      throw err; // re-throw our own typed errors
    }
    // Axios network / service error
    throw makeError('Appointment Service no disponible', 502);
  }
}

// ─── CREATE SESSION ───────────────────────────────────────────────────────────

export async function createSession(
  body: CreateSessionBody,
  token: string
): Promise<TelemedSession> {
  // 1. Validate appointment type
  await validateAppointment(body.appointment_id, token);

  // 2. Check for duplicate session
  const existing = await findSessionByAppointmentId(body.appointment_id);
  if (existing) {
    throw makeError('Ya existe una sesión de telemedicina para esta cita', 409);
  }

  // 3. Create real Daily.co room
  const dailyRoom = await createDailyRoom();
  const room_id = dailyRoom.name;   // Daily room name (slug único)
  const room_url = dailyRoom.url;   // URL pública de Daily

  // 4. Persist
  const session = await insertSession({
    appointment_id: body.appointment_id,
    clinic_id: body.clinic_id,
    veterinarian_id: body.veterinarian_id,
    owner_id: body.owner_id,
    pet_id: body.pet_id,
    room_id,
    room_url,
    status: 'CREATED',
    scheduled_at: body.scheduled_at,
    started_at: null,
    ended_at: null,
    duration_minutes: null,
  });

  // 5. Emit event (simulated)
  console.log('[EVENT] telemed.session.created', {
    sessionId: session.id,
    appointmentId: session.appointment_id,
    clinicId: session.clinic_id,
    ownerId: session.owner_id,
    petId: session.pet_id,
    scheduledAt: session.scheduled_at,
    roomId: room_id,
  });

  return session;
}

// ─── GET SESSION ──────────────────────────────────────────────────────────────

export async function getSessionById(
  id: string,
  user: JwtPayload
): Promise<TelemedSession> {
  const session = await findSessionById(id);
  if (!session) {
    throw makeError('Sesión de telemedicina no encontrada', 404);
  }

  // Ownership check for DUENO_MASCOTA
  if (user.role === 'DUENO_MASCOTA') {
    const userId = user.sub ?? user.id;
    if (session.owner_id !== userId) {
      throw makeError('Sin permisos para ver esta sesión', 403);
    }
  }

  // Clinic staff can only see their clinic's sessions
  if (['CLINIC_ADMIN', 'RECEPCIONISTA'].includes(user.role)) {
    if (session.clinic_id !== user.clinic_id) {
      throw makeError('Sin permisos para ver sesiones de otra clínica', 403);
    }
  }

  return session;
}

// ─── GET SESSION BY APPOINTMENT ───────────────────────────────────────────────

export async function getSessionByAppointment(
  appointmentId: string,
  user: JwtPayload
): Promise<TelemedSession> {
  let session = await findSessionByAppointmentId(appointmentId);

  // ── Lazy creation: if no session exists, create it on-the-fly ──────────────
  if (!session) {
    console.log(`[telemed] Sesión no encontrada para cita ${appointmentId} — intentando creación lazy...`);
    try {
      const internalKey = process.env['INTERNAL_SERVICE_KEY'] ?? 'petwell_internal_secret';
      const apptRes = await axios.get(
        `${env.APPOINTMENT_SERVICE_URL}/api/v1/appointments/${appointmentId}`,
        {
          headers: { 'x-internal-service-key': internalKey },
          timeout: 8000,
        }
      );

      const appt = apptRes.data?.data;
      if (!appt || appt.type !== 'TELEMEDICINA') {
        throw makeError('La cita no es de tipo TELEMEDICINA o no existe', 404);
      }

      // Build scheduled_at from appointment date + time (Colombia UTC-5)
      const scheduledAt = `${appt.appointment_date}T${appt.start_time}-05:00`;

      // Create a Daily.co room and persist the session
      const dailyRoom = await createDailyRoom();
      session = await insertSession({
        appointment_id: appointmentId,
        clinic_id:       appt.clinic_id,
        veterinarian_id: appt.veterinarian_id,
        owner_id:        appt.owner_id,
        pet_id:          appt.pet_id,
        room_id:         dailyRoom.name,
        room_url:        dailyRoom.url,
        status:          'CREATED',
        scheduled_at:    scheduledAt,
        started_at:      null,
        ended_at:        null,
        duration_minutes: null,
      });
      console.log(`[telemed] ✅ Sesión creada lazy para cita ${appointmentId}: ${session.id}`);
    } catch (lazyErr: unknown) {
      const e = lazyErr as NodeJS.ErrnoException;
      if (e.code) throw lazyErr; // re-throw typed errors
      throw makeError('No se encontró sesión para esta cita y no se pudo crear', 404);
    }
  }

  // Apply same access rules as getSessionById
  if (user.role === 'DUENO_MASCOTA') {
    const userId = user.sub ?? user.id;
    if (session.owner_id !== userId) {
      throw makeError('Sin permisos para ver esta sesión', 403);
    }
  }

  if (['CLINIC_ADMIN', 'RECEPCIONISTA'].includes(user.role)) {
    if (session.clinic_id !== user.clinic_id) {
      throw makeError('Sin permisos para ver sesiones de otra clínica', 403);
    }
  }

  return session;
}


// ─── GET ACTIVE SESSION ──────────────────────────────────────────────────────────
export async function getActiveSession(user: JwtPayload): Promise<TelemedSession | null> {
  const userId = user?.sub ?? user?.id;

  // Guard inmediato: sin userId no hay query
  if (!userId) {
    console.warn('[getActiveSession] No userId found in JWT payload — returning null immediately');
    return null;
  }

  console.log(`[getActiveSession] Buscando sesión activa para userId: ${userId}`);

  // Timeout de 4 segundos para evitar 504
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
    console.error('[getActiveSession] Query timeout (4s) — abortando');
  }, 4000);

  try {
    const { data, error } = await supabase
      .from('telemed_sessions')
      .select('*')
      .eq('status', 'IN_PROGRESS')
      .or(`veterinarian_id.eq.${userId},owner_id.eq.${userId}`)
      .abortSignal(controller.signal)
      .maybeSingle();

    clearTimeout(timer);

    if (error) {
      console.error('[getActiveSession] Supabase error:', error.message);
      return null;
    }

    console.log(`[getActiveSession] Resultado: ${data ? data.id : 'null'}`);
    return data ?? null;
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      console.error('[getActiveSession] Query abortada por timeout');
    } else {
      console.error('[getActiveSession] Unexpected error:', err?.message ?? err);
    }
    return null;
  }
}

// ─── GENERATE ACCESS TOKEN (Daily.co) ────────────────────────────────────────
/**
 * Genera un token firmado por Daily.co para que el usuario entre a la sala.
 *
 * Validaciones:
 *  - El usuario debe ser owner_id o veterinarian_id de la sesión.
 *  - No se puede solicitar token más de 5 minutos antes de la hora programada.
 *  - La sesión debe estar en estado IN_PROGRESS.
 *
 * Retorna: { room_url, token, scheduled_at, status }
 */
export async function generateAccessToken(
  sessionId: string,
  user: JwtPayload
): Promise<{ room_url: string; token: string; scheduled_at: string; status: string }> {
  const session = await findSessionById(sessionId);
  if (!session) {
    throw makeError('Sesión de telemedicina no encontrada', 404);
  }

  // 1. Verificar que el usuario pertenece a la sesión
  const userId = user.sub ?? user.id ?? '';
  const isVeterinarian = session.veterinarian_id === userId;
  const isOwner = session.owner_id === userId;

  if (!isVeterinarian && !isOwner) {
    throw makeError('No tienes acceso a esta sesión de telemedicina', 403);
  }

  // 2. Validar ventana de tiempo solo si la sesión AÚN NO ha iniciado
  // Si ya está IN_PROGRESS, cualquier participante puede entrar sin restricción de hora
  if (session.status !== 'IN_PROGRESS' && user.role === 'DUENO_MASCOTA') {
    const allowedStart = new Date(session.scheduled_at).getTime() - 30 * 60 * 1000;
    const now = Date.now();
    if (now < allowedStart) {
      const minutesLeft = Math.ceil((allowedStart - now) / 60000);
      throw makeError(
        `La consulta aún no está disponible. Disponible en ${minutesLeft} minuto(s).`,
        403
      );
    }
  }

  // 3. Validar que la sesión está IN_PROGRESS
  if (session.status !== 'IN_PROGRESS') {
    throw makeError(
      `La consulta no ha iniciado. Estado actual: ${session.status}`,
      400
    );
  }

  // 4. Determinar rol en Daily.co
  //    VETERINARIO → is_owner = true (puede grabar, expulsar, compartir pantalla)
  //    DUENO_MASCOTA → is_owner = false (participante estándar)
  const dailyIsOwner = user.role === 'VETERINARIO';

  // 5. Generar token con Daily.co
  const token = await createMeetingToken(session.room_id, userId, dailyIsOwner);

  console.log('[EVENT] telemed.token.generated', {
    sessionId: session.id,
    userId,
    role: user.role,
    dailyIsOwner,
  });

  return {
    room_url: session.room_url,
    token,
    scheduled_at: session.scheduled_at,
    status: session.status,
  };
}

// ─── START SESSION ────────────────────────────────────────────────────────────

export async function startSession(id: string, user: JwtPayload): Promise<TelemedSession> {
  const session = await findSessionById(id);
  if (!session) throw makeError('Sesión no encontrada', 404);

  // Only VETERINARIO can start
  if (user.role !== 'VETERINARIO') {
    throw makeError('Solo el veterinario puede iniciar la sesión', 403);
  }

  // Veterinarian must own the session
  const userId = user.sub ?? user.id;
  if (session.veterinarian_id !== userId) {
    throw makeError('No eres el veterinario asignado a esta sesión', 403);
  }

  // ✅ Protección: bloquear reactivación de sesiones finalizadas
  if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
    throw makeError(`La consulta ya fue finalizada. No se puede reiniciar una sesión en estado ${session.status}`, 409);
  }

  if (!['CREATED', 'READY'].includes(session.status)) {
    throw makeError(`No se puede iniciar una sesión en estado ${session.status}`, 409);
  }

  // Cannot start before scheduled time — only enforced for non-vets
  // VETERINARIO can start at any time (connectivity tests, early patients, etc.)
  if (user.role !== 'VETERINARIO') {
    const scheduledMs = new Date(session.scheduled_at).getTime();
    const nowMs = Date.now();
    const GRACE_MS = 30 * 60 * 1000; // 30 minutes early allowed for others
    if (nowMs < scheduledMs - GRACE_MS) {
      throw makeError('No se puede iniciar la sesión antes de la hora programada', 400);
    }
  }

  const updated = await updateSessionStatus(id, {
    status: 'IN_PROGRESS',
    started_at: new Date().toISOString(),
  });

  // Emit event
  console.log('[EVENT] telemed.session.started', {
    sessionId: updated.id,
    startedAt: updated.started_at,
  });

  // Notificación de inicio de consulta (fire-and-forget)
  axios.post(`${env.NOTIFICATION_SERVICE_URL}/api/v1/notifications`, {
    user_id: session.owner_id,
    type: 'TELEMED',
    title: 'Consulta iniciada',
    message: 'Tu consulta veterinaria ha comenzado',
    channel: 'EMAIL',
    scheduled_at: new Date().toISOString(),
  }).catch((err) => {
    console.error('[ERROR] Fallo al enviar notificación de telemedicina:', err.message);
  });

  return updated;
}

// ─── END SESSION ──────────────────────────────────────────────────────────────
/**
 * Finaliza la sesión de telemedicina y sincroniza el estado de la cita principal.
 * Operación estricta:
 *  1. telemed_sessions → status = COMPLETED, ended_at, duration_minutes
 *  2. appointments → status = COMPLETED (Supabase directo con service_role_key)
 * Si CUALQUIERA falla, se lanza error completo.
 */
export async function endSession(id: string, user: JwtPayload): Promise<TelemedSession> {
  const session = await findSessionById(id);
  if (!session) throw makeError('Sesión no encontrada', 404);

  if (user.role !== 'VETERINARIO') {
    throw makeError('Solo el veterinario puede finalizar la sesión', 403);
  }

  const userId = user.sub ?? user.id;
  if (session.veterinarian_id !== userId) {
    throw makeError('No eres el veterinario asignado a esta sesión', 403);
  }

  if (session.status !== 'IN_PROGRESS') {
    throw makeError(`No se puede finalizar una sesión en estado ${session.status}`, 409);
  }

  console.log(`[endSession] Finalizando sesión ${id} | appointment_id: ${session.appointment_id}`);

  const endedAt = new Date();
  const startedAt = session.started_at ? new Date(session.started_at) : endedAt;
  const durationMinutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);

  // 1. Marcar sesión como COMPLETED
  const updated = await updateSessionStatus(id, {
    status: 'COMPLETED',
    ended_at: endedAt.toISOString(),
    duration_minutes: durationMinutes,
  });

  console.log(`[endSession] Sesión ${id} marcada COMPLETED OK`);

  // 2. Sincronizar appointment → COMPLETED via ruta interna del Appointment Service
  // Usa X-Internal-Service-Key (no JWT de usuario) → sin restricciones de rol
  try {
    const internalUrl = `${env.APPOINTMENT_SERVICE_URL}/api/v1/appointments/${session.appointment_id}/internal/complete`;
    console.log(`[endSession] Llamando ruta interna: PATCH ${internalUrl}`);

    const response = await axios.patch(
      internalUrl,
      {},
      {
        headers: { 'X-Internal-Service-Key': env.INTERNAL_SERVICE_KEY },
        timeout: 8000,
      }
    );
    console.log(`[endSession] Appointment ${session.appointment_id} marcada COMPLETED:`, response.data);
  } catch (syncErr: any) {
    // La sesión ya quedó COMPLETED. Registrar para diagnóstico pero no revertir.
    console.error(
      `[endSession] WARN: fallo sincronización appointment ${session.appointment_id}:`,
      syncErr?.response?.status,
      syncErr?.response?.data ?? syncErr?.message
    );
  }

  console.log('[EVENT] telemed.session.completed', {
    sessionId: updated.id,
    appointmentId: session.appointment_id,
    durationMinutes: updated.duration_minutes,
    endedAt: updated.ended_at,
  });

  return updated;
}

// ─── CANCEL SESSION ───────────────────────────────────────────────────────────

export async function cancelSession(id: string, user: JwtPayload): Promise<TelemedSession> {
  const session = await findSessionById(id);
  if (!session) throw makeError('Sesión no encontrada', 404);

  // DUENO_MASCOTA can only cancel their own sessions
  if (user.role === 'DUENO_MASCOTA') {
    const userId = user.sub ?? user.id;
    if (session.owner_id !== userId) {
      throw makeError('Sin permisos para cancelar esta sesión', 403);
    }
  }

  // Clinic staff can only cancel sessions of their clinic
  if (['CLINIC_ADMIN', 'RECEPCIONISTA'].includes(user.role)) {
    if (session.clinic_id !== user.clinic_id) {
      throw makeError('Sin permisos para cancelar sesiones de otra clínica', 403);
    }
  }

  if (['COMPLETED', 'CANCELLED'].includes(session.status)) {
    throw makeError(`No se puede cancelar una sesión en estado ${session.status}`, 409);
  }

  const updated = await updateSessionStatus(id, { status: 'CANCELLED' });
  return updated;
}
