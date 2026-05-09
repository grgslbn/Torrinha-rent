-- Create private storage bucket for inbound email attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('inbox-attachments', 'inbox-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Add attachments metadata column to torrinha_inbox
ALTER TABLE torrinha_inbox
  ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]';
