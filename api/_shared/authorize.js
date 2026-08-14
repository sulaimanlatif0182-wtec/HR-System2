// Centralized authorization helpers.
//
// The backend uses the Supabase service-role key, so Row Level Security does
// not protect these endpoints. All access control is therefore hand-coded and
// must be consistent. Use these helpers instead of repeating inline
// `authUser.role !== 'admin'` checks so forbidden/owner logic stays in one place.

export function assertRole(user, res, roles = []) {
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  if (!roles.includes(user.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }

  return true;
}

export function assertAdmin(user, res) {
  return assertRole(user, res, ['admin']);
}

export function assertAdminOrManager(user, res) {
  return assertRole(user, res, ['admin', 'manager']);
}

export function assertOwnershipOrRole(user, res, { ownerId, roles = [] } = {}) {
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  if (Number(user.id) === Number(ownerId)) return true;
  if (roles.includes(user.role)) return true;

  res.status(403).json({ error: 'Forbidden' });
  return false;
}
