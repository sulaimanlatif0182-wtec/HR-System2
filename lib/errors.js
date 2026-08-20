// Centralized database error responses.
//
// Supabase error messages can leak schema details, constraint names, and
// internal hints to clients. Always respond with a generic message and log
// the real error server-side instead of echoing error.message.

export function dbError(res, error, fallback = 'Internal server error.') {
  console.error(
    '[dbError]',
    error?.message || error?.details || error?.hint || error?.code || error
  );
  return res.status(500).json({ error: fallback });
}