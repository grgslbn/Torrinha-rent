ALTER TABLE torrinha_tenants
  ADD COLUMN IF NOT EXISTS licence_plates TEXT[] DEFAULT '{}';

COMMENT ON COLUMN torrinha_tenants.licence_plates IS 'Vehicle licence plate numbers associated with this tenant';
