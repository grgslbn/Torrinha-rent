ALTER TABLE torrinha_payments
  ADD COLUMN IF NOT EXISTS source_transaction_id text;

COMMENT ON COLUMN torrinha_payments.source_transaction_id IS
  'Bank transaction id that paid this row; shared across rows when one transfer covers multiple months (matched_by = ponto_auto_split).';
