-- Migration: Add CHECK constraint to borrowers.legal_type
-- This ensures legal_type only accepts valid values

-- First, update any existing invalid legal_type values to a default
UPDATE borrowers 
SET legal_type = 'individual' 
WHERE legal_type IS NULL 
   OR legal_type NOT IN ('individual', 'legal_entity', 'individual_entrepreneur');

-- Add the CHECK constraint if it doesn't exist
-- PostgreSQL doesn't have IF NOT EXISTS for constraints, so we use DO block
DO $$
BEGIN
  -- Check if the constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'borrowers_legal_type_check' 
    AND conrelid = 'borrowers'::regclass
  ) THEN
    -- Add the constraint
    ALTER TABLE borrowers 
    ADD CONSTRAINT borrowers_legal_type_check 
    CHECK (legal_type IN ('individual', 'legal_entity', 'individual_entrepreneur'));
    
    RAISE NOTICE 'Added borrowers_legal_type_check constraint';
  ELSE
    RAISE NOTICE 'borrowers_legal_type_check constraint already exists';
  END IF;
END $$;

-- Also ensure legal_type is NOT NULL
ALTER TABLE borrowers ALTER COLUMN legal_type SET NOT NULL;

-- Verify the constraint exists
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'borrowers_legal_type_check';
