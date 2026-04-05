-- Add unique constraint on tin_number for borrowers table
-- This is required for the upsert ON CONFLICT clause to work

-- First, check if there are any duplicate TINs and handle them
-- (This will fail if duplicates exist, which is the desired behavior)

-- Add unique constraint
ALTER TABLE borrowers 
ADD CONSTRAINT borrowers_tin_number_unique UNIQUE (tin_number);

-- Add index to improve lookup performance
CREATE INDEX IF NOT EXISTS idx_borrowers_tin_number ON borrowers(tin_number);
