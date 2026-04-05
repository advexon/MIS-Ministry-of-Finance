-- Loan Drafts Table for saving work-in-progress applications
-- Created: 2026-04-05

-- Create loan_drafts table
CREATE TABLE IF NOT EXISTS loan_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_name TEXT NOT NULL,
  form_data JSONB NOT NULL DEFAULT '{}',
  current_step TEXT NOT NULL DEFAULT 'borrower',
  completion_percentage INTEGER NOT NULL DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  is_auto_saved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_loan_drafts_user_id ON loan_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_loan_drafts_expires_at ON loan_drafts(expires_at);
CREATE INDEX IF NOT EXISTS idx_loan_drafts_updated_at ON loan_drafts(updated_at DESC);

-- Enable RLS
ALTER TABLE loan_drafts ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own drafts
CREATE POLICY "Users can view own drafts" ON loan_drafts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own drafts" ON loan_drafts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own drafts" ON loan_drafts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own drafts" ON loan_drafts
  FOR DELETE USING (auth.uid() = user_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_loan_draft_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS loan_drafts_updated_at ON loan_drafts;
CREATE TRIGGER loan_drafts_updated_at
  BEFORE UPDATE ON loan_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_loan_draft_timestamp();

-- Function to clean up expired drafts (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_loan_drafts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM loan_drafts WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
