-- Remove the Zip Code field from the application.
-- Zip/postal codes are not used anywhere in the system, so the column is
-- dropped from the borrowers table. The loan application form, the borrower
-- autofill, the draft save/restore, and the i18n strings no longer reference it.
--
-- Already applied to the database via the `drop_borrowers_address_zip` migration.
-- Kept here so a fresh environment ends up with the same schema.

ALTER TABLE public.borrowers DROP COLUMN IF EXISTS address_zip;
