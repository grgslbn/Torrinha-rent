-- ============================================================
-- Migration: tenant context store + email log
-- ============================================================

-- 1. Tenant context store
-- Multiple rich context entries per tenant (pasted emails, notes, agreements, etc.)
CREATE TABLE IF NOT EXISTS torrinha_tenant_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES torrinha_tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('relationship', 'communication', 'agreement', 'note', 'other')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  added_by TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_context_tenant ON torrinha_tenant_context(tenant_id);

-- 2. Email log
-- All outbound and inbound emails, linked to tenants where known
CREATE TABLE IF NOT EXISTS torrinha_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES torrinha_tenants(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  template TEXT,
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_email_log_tenant ON torrinha_email_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_log_sent ON torrinha_email_log(sent_at DESC);
