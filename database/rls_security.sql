-- ============================================================
-- PetWell — Telemed Service
-- Row Level Security (RLS) policies
-- Tabla: telemed_sessions
--
-- Ejecutar en Supabase SQL Editor DESPUÉS de schema.sql
-- ============================================================
--
-- ⚠️  IMPORTANTE — Por qué esto es seguro para tus microservicios:
--
--   El telemed-service usa SUPABASE_SERVICE_ROLE_KEY.
--   El service role bypassa RLS automáticamente en Supabase.
--   → Los INSERTs al crear sesiones, los UPDATEs de estado
--     (CREATED → READY → IN_PROGRESS → COMPLETED) y todos los
--     webhooks existentes siguen funcionando sin ningún cambio.
--
--   Estas políticas protegen el acceso directo vía:
--     • Clave ANON (acceso público)
--     • Tokens JWT de usuarios (frontend / PostgREST)
--
-- Claims JWT:
--   auth.uid()             → UUID del usuario autenticado
--   jwt_claim('role')      → DUENO_MASCOTA | CLINIC_ADMIN | VETERINARIO
--   jwt_claim('clinic_id') → UUID de la clínica
-- ============================================================

-- Helper jwt_claim (idempotente — compatible con otros servicios)
CREATE OR REPLACE FUNCTION public.jwt_claim(claim TEXT)
RETURNS TEXT AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json ->> claim,
    ''
  );
$$ LANGUAGE sql STABLE;

-- ============================================================
-- TABLA: telemed_sessions
-- Reglas de acceso:
--   SELECT : CLINIC_ADMIN / VETERINARIO de su clínica
--            DUENO_MASCOTA que sea el dueño de la sesión (owner_id)
--   INSERT : Solo CLINIC_ADMIN de su clínica
--            (el microservicio crea la sesión con service_role)
--   UPDATE : CLINIC_ADMIN / VETERINARIO de su clínica
--            (cambios de estado: READY, IN_PROGRESS, COMPLETED, etc.)
-- ============================================================

ALTER TABLE telemed_sessions ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas anteriores (idempotente)
DROP POLICY IF EXISTS "telemed_sessions_select" ON telemed_sessions;
DROP POLICY IF EXISTS "telemed_sessions_insert" ON telemed_sessions;
DROP POLICY IF EXISTS "telemed_sessions_update" ON telemed_sessions;

-- SELECT ─────────────────────────────────────────────────────
CREATE POLICY "telemed_sessions_select"
ON telemed_sessions FOR SELECT
USING (
  -- Personal de clínica: solo sesiones de su propia clínica
  (
    public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO')
    AND public.jwt_claim('clinic_id')::uuid = clinic_id
  )
  -- Dueño de mascota: solo sus propias sesiones
  OR (
    public.jwt_claim('role') = 'DUENO_MASCOTA'
    AND auth.uid() = owner_id
  )
);

-- INSERT ─────────────────────────────────────────────────────
-- Solo CLINIC_ADMIN crea sesiones de telemedicina.
-- En la práctica el microservicio lo hace con service_role (bypass automático).
CREATE POLICY "telemed_sessions_insert"
ON telemed_sessions FOR INSERT
WITH CHECK (
  public.jwt_claim('role') = 'CLINIC_ADMIN'
  AND public.jwt_claim('clinic_id')::uuid = clinic_id
);

-- UPDATE ─────────────────────────────────────────────────────
-- Personal de clínica puede actualizar estado de sesiones de su clínica.
-- El microservicio actualiza via service_role (bypass automático).
CREATE POLICY "telemed_sessions_update"
ON telemed_sessions FOR UPDATE
USING (
  public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO')
  AND public.jwt_claim('clinic_id')::uuid = clinic_id
);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

-- Estado RLS:
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename = 'telemed_sessions';

-- Políticas activas:
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename = 'telemed_sessions'
-- ORDER BY cmd;
