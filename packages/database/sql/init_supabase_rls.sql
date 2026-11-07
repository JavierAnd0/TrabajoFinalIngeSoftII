-- ============================================================================
-- EDUDISTRIBUIDA / USCO-NET - SCRIPT DDL DE SEGURIDAD Y OPTIMIZACIÓN SUPABASE
-- Archivo: packages/database/sql/init_supabase_rls.sql
-- Propósito: Índices compuestos, Restricciones de Integridad de Cupos,
--            Triggers de Auditoría y Políticas Row-Level Security (RLS)
-- ============================================================================

-- 1. EXTENSIÓN PARA UUID Y CRIPTOGRAFÍA
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ESQUEMA DE COMPATIBILIDAD LOCAL PARA SUPABASE AUTH (Si se ejecuta fuera de Supabase Cloud)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claim.sub', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
  );
$$;

CREATE OR REPLACE FUNCTION auth.jwt_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claim.user_role', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role'),
    'service_role'
  );
$$;

-- ============================================================================
-- 3. RESTRICCIONES DE INTEGRIDAD DE DOMINIO (PREVENCIÓN DE SOBRECUPOS Y RANGOS)
-- ============================================================================

ALTER TABLE "CourseSection"
  DROP CONSTRAINT IF EXISTS chk_course_section_quota_bounds;

ALTER TABLE "CourseSection"
  ADD CONSTRAINT chk_course_section_quota_bounds
  CHECK ("occupiedQuota" >= 0 AND "occupiedQuota" <= "maxQuota");

ALTER TABLE "Grade"
  DROP CONSTRAINT IF EXISTS chk_grade_bounds_0_to_5;

ALTER TABLE "Grade"
  ADD CONSTRAINT chk_grade_bounds_0_to_5
  CHECK (
    ("cut1" IS NULL OR ("cut1" >= 0.0 AND "cut1" <= 5.0)) AND
    ("cut2" IS NULL OR ("cut2" >= 0.0 AND "cut2" <= 5.0)) AND
    ("cut3" IS NULL OR ("cut3" >= 0.0 AND "cut3" <= 5.0)) AND
    ("finalGrade" IS NULL OR ("finalGrade" >= 0.0 AND "finalGrade" <= 5.0))
  );

-- ============================================================================
-- 4. ÍNDICES COMPUESTOS DE ALTO RENDIMIENTO MULTI-SEDE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_section_campus_period_quota
  ON "CourseSection" ("campusId", "periodId", "occupiedQuota", "maxQuota");

CREATE INDEX IF NOT EXISTS idx_enrollment_student_active
  ON "Enrollment" ("studentId", "periodId")
  WHERE "status" = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_cert_job_student_requested
  ON "CertificateJob" ("studentId", "requestedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_chat_log_student_engine
  ON "ChatInteractionLog" ("studentId", "engineUsed", "createdAt" DESC);

-- ============================================================================
-- 5. TRIGGER AUTOMÁTICO DE CÁLCULO PONDERADO DE NOTAS (30% / 30% / 40%)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_recalculate_weighted_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_c1 DOUBLE PRECISION := COALESCE(NEW."cut1", 0.0);
  v_c2 DOUBLE PRECISION := COALESCE(NEW."cut2", 0.0);
  v_c3 DOUBLE PRECISION := COALESCE(NEW."cut3", 0.0);
  v_final DOUBLE PRECISION;
BEGIN
  IF NEW."cut1" IS NOT NULL OR NEW."cut2" IS NOT NULL OR NEW."cut3" IS NOT NULL THEN
    v_final := ROUND((v_c1 * 0.30 + v_c2 * 0.30 + v_c3 * 0.40)::numeric, 2)::double precision;
    NEW."finalGrade" := v_final;
    IF NEW."cut1" IS NOT NULL AND NEW."cut2" IS NOT NULL AND NEW."cut3" IS NOT NULL THEN
      NEW."passed" := (v_final >= 3.0);
    ELSE
      NEW."passed" := CASE WHEN v_final >= 3.0 THEN TRUE ELSE NULL END;
    END IF;
  END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_weighted_grade ON "Grade";
CREATE TRIGGER trg_recalculate_weighted_grade
BEFORE INSERT OR UPDATE OF "cut1", "cut2", "cut3" ON "Grade"
FOR EACH ROW
EXECUTE FUNCTION fn_recalculate_weighted_grade();

-- ============================================================================
-- 6. POLÍTICAS ROW-LEVEL SECURITY (RLS) PARA SUPABASE MULTI-SEDE
-- ============================================================================

ALTER TABLE "Campus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicProgram" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Course" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Grade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CertificateJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatInteractionLog" ENABLE ROW LEVEL SECURITY;

-- 6.1 Catálogos públicos de lectura para usuarios autenticados y service_role
DROP POLICY IF EXISTS pol_campus_read_all ON "Campus";
CREATE POLICY pol_campus_read_all ON "Campus"
  FOR SELECT USING (true);

DROP POLICY IF EXISTS pol_program_read_all ON "AcademicProgram";
CREATE POLICY pol_program_read_all ON "AcademicProgram"
  FOR SELECT USING (true);

DROP POLICY IF EXISTS pol_period_read_all ON "AcademicPeriod";
CREATE POLICY pol_period_read_all ON "AcademicPeriod"
  FOR SELECT USING (true);

DROP POLICY IF EXISTS pol_course_read_all ON "Course";
CREATE POLICY pol_course_read_all ON "Course"
  FOR SELECT USING (true);

DROP POLICY IF EXISTS pol_section_read_all ON "CourseSection";
CREATE POLICY pol_section_read_all ON "CourseSection"
  FOR SELECT USING (true);

-- 6.2 Aislamiento de Usuarios: Cada estudiante ve su propio perfil; ADMIN y service_role tienen acceso total
DROP POLICY IF EXISTS pol_user_isolation ON "User";
CREATE POLICY pol_user_isolation ON "User"
  FOR ALL
  USING (
    auth.jwt_role() IN ('service_role', 'ADMIN')
    OR "id" = auth.uid()
    OR "supabaseUid" = auth.uid()
  );

-- 6.3 Aislamiento de Matrículas: Estudiante solo accede a sus matrículas; Docente a sus secciones; Admin total
DROP POLICY IF EXISTS pol_enrollment_isolation ON "Enrollment";
CREATE POLICY pol_enrollment_isolation ON "Enrollment"
  FOR ALL
  USING (
    auth.jwt_role() IN ('service_role', 'ADMIN')
    OR "studentId" = auth.uid()
    OR EXISTS (
      SELECT 1 FROM "CourseSection" cs
      WHERE cs."id" = "Enrollment"."sectionId"
        AND cs."teacherId" = auth.uid()
    )
  );

-- 6.4 Aislamiento de Calificaciones: Estudiante lee sus propias notas; Docente edita notas de su grupo
DROP POLICY IF EXISTS pol_grade_isolation ON "Grade";
CREATE POLICY pol_grade_isolation ON "Grade"
  FOR ALL
  USING (
    auth.jwt_role() IN ('service_role', 'ADMIN')
    OR EXISTS (
      SELECT 1 FROM "Enrollment" e
      WHERE e."id" = "Grade"."enrollmentId"
        AND (
          e."studentId" = auth.uid()
          OR EXISTS (
            SELECT 1 FROM "CourseSection" cs
            WHERE cs."id" = e."sectionId" AND cs."teacherId" = auth.uid()
          )
        )
    )
  );

-- 6.5 Aislamiento de Trabajos de Certificados PDF
DROP POLICY IF EXISTS pol_certificate_job_isolation ON "CertificateJob";
CREATE POLICY pol_certificate_job_isolation ON "CertificateJob"
  FOR ALL
  USING (
    auth.jwt_role() IN ('service_role', 'ADMIN')
    OR "studentId" = auth.uid()
  );

-- 6.6 Aislamiento de Logs de Auditoría del Chatbot IA
DROP POLICY IF EXISTS pol_chat_log_isolation ON "ChatInteractionLog";
CREATE POLICY pol_chat_log_isolation ON "ChatInteractionLog"
  FOR ALL
  USING (
    auth.jwt_role() IN ('service_role', 'ADMIN')
    OR "studentId" = auth.uid()
  );
