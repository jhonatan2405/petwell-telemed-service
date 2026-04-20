// ─── Telemed Session — TypeScript Models ──────────────────────────────────────

export type SessionStatus =
  | 'CREATED'
  | 'READY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

// ─── Database row shape ───────────────────────────────────────────────────────
export interface TelemedSession {
  id: string;
  appointment_id: string;
  clinic_id: string;
  veterinarian_id: string;
  owner_id: string;
  pet_id: string;

  room_id: string;
  room_url: string;

  status: SessionStatus;

  scheduled_at: string;       // ISO 8601
  started_at: string | null;
  ended_at: string | null;

  duration_minutes: number | null;

  created_at: string;
  updated_at: string;
}

// ─── Request bodies ───────────────────────────────────────────────────────────
export interface CreateSessionBody {
  appointment_id: string;
  clinic_id: string;
  veterinarian_id: string;
  owner_id: string;
  pet_id: string;
  scheduled_at: string; // ISO 8601
}
