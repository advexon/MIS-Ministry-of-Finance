/**
 * Normalizes a Supabase embedded relation to a single record.
 *
 * PostgREST types every embedded resource as an array (`borrower:borrowers(name)`
 * yields `{ name }[]`) even when the foreign key guarantees at most one row.
 * Casting straight to an object is unsafe — it silently produces objects whose
 * fields are all `undefined`. This unwraps the first element instead.
 */
export function one<T>(relation: T | T[] | null | undefined): T | null {
  if (Array.isArray(relation)) return relation[0] ?? null
  return relation ?? null
}
