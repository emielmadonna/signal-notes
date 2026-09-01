// =============================================================================
// lib/errors.ts — how a server-side failure reaches the user.
//
// The routes used to interpolate raw Postgres/driver text straight into the
// response body (`Saving the document failed: ${insertError.message}`). That
// hands an unauthenticated-adjacent caller our table names, column names,
// constraint names and RLS policy names on any DB hiccup.
//
// The constitution's R3 says an error is SURFACED, never swallowed — it does
// not say the user gets the driver's words. So: the operator gets the whole
// error in the server log, keyed by a short reference; the user gets a true
// statement of what failed, what it means for their data, and that reference
// to quote at us. Nothing is hidden, and nothing internal leaks.
// =============================================================================

// Web Crypto, not node:crypto — this module is imported from client
// components as well as route handlers, and node:crypto would break the
// browser bundle. crypto.randomUUID() exists in Node 19+ and every browser
// this app supports.

/** Short, human-quotable correlation id, e.g. "a3f9c1". */
function newReference(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 6);
}

/**
 * Log `cause` in full against a fresh reference, and return the reference.
 * Call this anywhere a raw error would otherwise have been interpolated into
 * a user-facing string.
 */
export function logInternal(context: string, cause: unknown): string {
  const reference = newReference();
  console.error(`[${reference}] ${context}:`, cause);
  return reference;
}

/**
 * The user-facing half. `summary` must be a complete, honest sentence about
 * what happened and what it means for their data — the reference is added on
 * the end, not used as a substitute for saying anything.
 *
 *   internalError("Saving the document failed. Nothing was added.", err)
 *   → "Saving the document failed. Nothing was added. (reference a3f9c1)"
 */
export function internalError(
  summary: string,
  context: string,
  cause: unknown
): string {
  const reference = logInternal(context, cause);
  return `${summary} (reference ${reference})`;
}
