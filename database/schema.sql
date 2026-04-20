-- ============================================================
--  PetWell — Telemed Service
--  database/schema.sql
-- ============================================================

-- Enable uuid generation (Supabase already has this)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Table: telemed_sessions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telemed_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id   UUID        NOT NULL,
  clinic_id        UUID        NOT NULL,
  veterinarian_id  UUID        NOT NULL,
  owner_id         UUID        NOT NULL,
  pet_id           UUID        NOT NULL,

  room_id          VARCHAR(100) UNIQUE NOT NULL,
  room_url         TEXT        NOT NULL,

  status           VARCHAR(20) NOT NULL DEFAULT 'CREATED',
  -- CREATED | READY | IN_PROGRESS | COMPLETED | CANCELLED

  scheduled_at     TIMESTAMPTZ NOT NULL,
  started_at       TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,

  duration_minutes INTEGER,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indices ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_telemed_appointment ON telemed_sessions (appointment_id);
CREATE INDEX IF NOT EXISTS idx_telemed_clinic      ON telemed_sessions (clinic_id);
CREATE INDEX IF NOT EXISTS idx_telemed_vet         ON telemed_sessions (veterinarian_id);
CREATE INDEX IF NOT EXISTS idx_telemed_owner       ON telemed_sessions (owner_id);

-- ── Auto-update updated_at trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_telemed ON telemed_sessions;
CREATE TRIGGER set_updated_at_telemed
  BEFORE UPDATE ON telemed_sessions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── Status constraint ─────────────────────────────────────────────────────────
ALTER TABLE telemed_sessions
  DROP CONSTRAINT IF EXISTS chk_telemed_status;

ALTER TABLE telemed_sessions
  ADD CONSTRAINT chk_telemed_status
  CHECK (status IN ('CREATED', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'));
