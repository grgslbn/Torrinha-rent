ALTER TABLE torrinha_email_log
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS approval_token TEXT;

UPDATE torrinha_email_log SET status = 'sent' WHERE status IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_log_token
  ON torrinha_email_log(approval_token)
  WHERE approval_token IS NOT NULL;
