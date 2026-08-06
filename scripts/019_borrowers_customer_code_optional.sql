-- Fix: submitting a loan application failed with
--   23502: null value in column "customer_code" of relation "borrowers"
--          violates not-null constraint
--
-- `borrowers.customer_code` holds the BANK's own customer reference. Existing
-- values are hand-entered and arbitrary ('34', '42', 'TT23', 'C24', 'D3'), so
-- it is reference data supplied by the bank, not a system-generated key.
--
-- The New Loan Application form exposes it as an OPTIONAL field
-- ("Bank Customer Code" / placeholder "Customer ID at bank") and sends
-- `customer_code: bankCustomerCode || null`. The column, however, was
-- NOT NULL with no default, so every application submitted without a bank
-- customer code was rejected.
--
-- Making the column optional matches how the value is actually collected.
-- The UNIQUE constraint (borrowers_customer_code_key) is intentionally kept:
-- Postgres allows multiple NULLs under a UNIQUE constraint, so blank codes do
-- not collide with one another, while a real code stays unique.
ALTER TABLE public.borrowers
  ALTER COLUMN customer_code DROP NOT NULL;

-- NOTE (not changed here, needs a product decision):
-- `customer_code` is UNIQUE *globally*, but it is a per-bank reference and
-- `borrowers` has no bank_id column. Two different banks may legitimately use
-- the same internal code for different customers, and that currently cannot
-- be represented. See docs/CODEBASE_INDEX.md.
