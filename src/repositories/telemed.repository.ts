import { supabase } from '../config/supabase';
import { TelemedSession, CreateSessionBody, SessionStatus } from '../models/telemed.model';

const TABLE = 'telemed_sessions';

// ─── Create ───────────────────────────────────────────────────────────────────
export async function insertSession(
  data: Omit<TelemedSession, 'id' | 'created_at' | 'updated_at' | 'started_at' | 'ended_at' | 'duration_minutes'> & {
    started_at?: null;
    ended_at?: null;
    duration_minutes?: null;
  }
): Promise<TelemedSession> {
  const { data: row, error } = await supabase
    .from(TABLE)
    .insert(data)
    .select()
    .single();

  if (error) {
    const err = new Error(error.message) as NodeJS.ErrnoException;
    err.code = '500';
    throw err;
  }

  return row as TelemedSession;
}

// ─── Find by id ───────────────────────────────────────────────────────────────
export async function findSessionById(id: string): Promise<TelemedSession | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // row not found
    const err = new Error(error.message) as NodeJS.ErrnoException;
    err.code = '500';
    throw err;
  }

  return data as TelemedSession;
}

// ─── Find by appointment_id ───────────────────────────────────────────────────
export async function findSessionByAppointmentId(appointmentId: string): Promise<TelemedSession | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('appointment_id', appointmentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    const err = new Error(error.message) as NodeJS.ErrnoException;
    err.code = '500';
    throw err;
  }

  return data as TelemedSession;
}

// ─── Update status ────────────────────────────────────────────────────────────
export async function updateSessionStatus(
  id: string,
  patch: Partial<Pick<TelemedSession, 'status' | 'started_at' | 'ended_at' | 'duration_minutes'>>
): Promise<TelemedSession> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    const err = new Error(error.message) as NodeJS.ErrnoException;
    err.code = '500';
    throw err;
  }

  return data as TelemedSession;
}
