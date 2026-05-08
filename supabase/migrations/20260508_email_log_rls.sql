-- RLS was enabled on torrinha_email_log but no policies existed,
-- causing authenticated admin queries to return zero rows.
CREATE POLICY "Admin full access"
  ON torrinha_email_log
  FOR ALL
  TO public
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role bypass"
  ON torrinha_email_log
  FOR ALL
  TO public
  USING (auth.role() = 'service_role');
