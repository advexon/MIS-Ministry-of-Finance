/**
 * Translates database/Supabase errors into messages a bank user can act on.
 *
 * Supabase returns plain objects rather than `Error` instances, so naive
 * handling (`err instanceof Error ? err.message : JSON.stringify(err)`) leaks
 * raw Postgres JSON such as:
 *   {"code":"23502","message":"null value in column \"customer_code\" ..."}
 */

/** Human labels for database columns that can appear in constraint errors. */
const COLUMN_LABELS: Record<string, string> = {
  customer_code: "Bank Customer Code",
  legal_type: "Legal Entity Type",
  name: "Client / Company Name",
  tin_number: "TIN Number",
  registration_number: "Registration Number",
  sector_id: "Business Sector",
  address_street: "Street Address",
  address_city: "City",
  address_district: "District",
  phone: "Phone Number",
  email: "Email",
  legal_rep_surname: "Legal Representative Surname",
  legal_rep_name: "Legal Representative First Name",
  legal_rep_tin: "Legal Representative TIN",
  bank_id: "Bank",
  branch_id: "Branch",
  borrower_id: "Borrower",
  product_id: "Loan Product",
  requested_amount: "Requested Amount",
  loan_term: "Loan Term",
  interest_rate: "Interest Rate",
  guarantee_coverage: "Guarantee Coverage",
}

const labelFor = (column: string | undefined): string =>
  (column && COLUMN_LABELS[column]) || "One of the fields"

/** Pulls the column name out of a Postgres constraint message. */
function extractColumn(message: string): string | undefined {
  // e.g. null value in column "customer_code" of relation "borrowers"
  const inColumn = message.match(/column "([^"]+)"/)
  if (inColumn) return inColumn[1]
  // e.g. Key (customer_code)=(42) already exists.
  const inKey = message.match(/Key \(([^)]+)\)=/)
  if (inKey) return inKey[1].split(",")[0].trim()
  return undefined
}

/**
 * Returns a readable, actionable message for any thrown value.
 * Never returns raw JSON.
 */
export function getDatabaseErrorMessage(err: unknown): string {
  const e = (err ?? {}) as {
    code?: string
    message?: string
    details?: string | null
    hint?: string | null
  }
  const message = e.message || ""
  const code = e.code

  switch (code) {
    // NOT NULL violation — a required value never reached the database.
    case "23502": {
      const column = extractColumn(message)
      return `${labelFor(column)} is required. Please provide a value and try again.`
    }
    // UNIQUE violation — the value is already taken.
    case "23505": {
      const column = extractColumn(e.details || message)
      return `${labelFor(column)} is already used by another record. Please enter a different value.`
    }
    // FOREIGN KEY violation — a referenced record is missing.
    case "23503": {
      const column = extractColumn(e.details || message)
      return `The selected ${labelFor(column)} is no longer available. Please choose another option.`
    }
    // CHECK constraint violation — value outside the allowed set.
    case "23514":
      return message && !message.includes('violates check constraint') ? message : "One of the selected values is not allowed. Please review the highlighted fields and try again."
    case "40001":
      return "This application changed. Reload it before saving again."
    // Value too long for the column.
    case "22001":
      return "One of the values entered is too long. Please shorten it and try again."
    // Invalid number / date format.
    case "22P02":
    case "22007":
      return "One of the values is not in the expected format. Please check numbers and dates."
    // RLS denied the operation.
    case "42501":
      return "You do not have permission to perform this action. Please contact an administrator."
    default:
      break
  }

  // Fall back to a real Error message, but never raw JSON.
  if (err instanceof Error && err.message) return err.message
  if (message) return message
  return "Something went wrong while saving. Please try again, or contact support if the problem continues."
}
