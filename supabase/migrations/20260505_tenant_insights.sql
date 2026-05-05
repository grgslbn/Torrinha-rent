CREATE TABLE IF NOT EXISTS torrinha_tenant_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES torrinha_tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence TEXT DEFAULT 'confirmed',
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_insights_tenant
  ON torrinha_tenant_insights(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_insights_key_value
  ON torrinha_tenant_insights(key, value);

-- Prevent duplicate IBAN entries across tenants
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_insights_iban
  ON torrinha_tenant_insights(key, value)
  WHERE key = 'iban';

-- RLS: only service role can write; authenticated users can read their own tenant's data
ALTER TABLE torrinha_tenant_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access"
  ON torrinha_tenant_insights
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "authenticated read"
  ON torrinha_tenant_insights
  FOR SELECT
  USING (auth.role() = 'authenticated');
