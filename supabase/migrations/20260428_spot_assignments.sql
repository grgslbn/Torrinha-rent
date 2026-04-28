-- ============================================================
-- Migration: spot assignments + tenant status
-- ============================================================

-- 1. Enable btree_gist for exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Add status column to torrinha_tenants
ALTER TABLE torrinha_tenants
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'future', 'inactive'));

-- Sync status from existing active column
UPDATE torrinha_tenants
  SET status = CASE WHEN active THEN 'active' ELSE 'inactive' END;

-- 3. Create torrinha_spot_assignments table
CREATE TABLE IF NOT EXISTS torrinha_spot_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES torrinha_tenants(id) ON DELETE CASCADE,
  spot_id UUID NOT NULL REFERENCES torrinha_spots(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- No-overlap constraint: two assignments on the same spot cannot have overlapping date ranges
ALTER TABLE torrinha_spot_assignments
  ADD CONSTRAINT no_overlap_on_spot
  EXCLUDE USING gist (
    spot_id WITH =,
    daterange(start_date, COALESCE(end_date, '9999-12-31'), '[)') WITH &&
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_spot_assignments_tenant ON torrinha_spot_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_spot_assignments_spot ON torrinha_spot_assignments(spot_id);
CREATE INDEX IF NOT EXISTS idx_spot_assignments_dates ON torrinha_spot_assignments(start_date, end_date);

-- 4. RLS: match existing pattern (auth required)
ALTER TABLE torrinha_spot_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage spot assignments"
  ON torrinha_spot_assignments
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Service role bypass (for Railway cron)
CREATE POLICY "Service role bypass spot assignments"
  ON torrinha_spot_assignments
  FOR ALL
  USING (auth.role() = 'service_role');

-- 5. Backfill: create one assignment per current spot-tenant relationship
-- Uses tenant.start_date as the assignment start, end_date NULL (ongoing)
INSERT INTO torrinha_spot_assignments (tenant_id, spot_id, start_date, notes)
SELECT
  s.tenant_id,
  s.id,
  COALESCE(t.start_date, '2025-01-01'::date),
  'migration-backfill'
FROM torrinha_spots s
JOIN torrinha_tenants t ON t.id = s.tenant_id
WHERE s.tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;
