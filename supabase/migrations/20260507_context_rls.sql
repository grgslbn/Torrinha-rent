-- Fix: add RLS policies to torrinha_tenant_context.
-- The table was created without ENABLE ROW LEVEL SECURITY. If RLS was enabled
-- later (e.g. via Supabase Studio) without any policies, all authenticated
-- queries returned empty silently. This migration enables RLS explicitly and
-- grants full access to authenticated admins + service role bypass for Railway.

ALTER TABLE torrinha_tenant_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage tenant context"
  ON torrinha_tenant_context
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Service role bypass tenant context"
  ON torrinha_tenant_context
  FOR ALL
  USING (auth.role() = 'service_role');
