function splitAllowlist(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveCorsOrigin(reqOrigin, allowlistRaw) {
  const allowlist = splitAllowlist(allowlistRaw);
  if (!allowlist.length) return '';
  // Only reflect the request origin when it is explicitly allow-listed.
  // Reflecting an unmatched origin (or a fixed first entry) leaks the
  // configured origin and is rejected by browsers when credentials are enabled.
  if (reqOrigin && allowlist.includes(reqOrigin)) return reqOrigin;
  return '';
}

export function setCors(res, req) {
  const reqOrigin = req?.headers?.origin || '';
  const origin = resolveCorsOrigin(reqOrigin, process.env.FRONTEND_URL);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', origin || '');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
