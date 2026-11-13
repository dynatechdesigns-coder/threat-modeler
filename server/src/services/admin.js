/**
 * Who is an admin: an address listed in ADMIN_EMAILS, AND confirmed. The confirmation matters: without it, anyone could
 * register with an admin's address and be treated as that admin. (Signing in with Google counts as confirmed.)
 */
export const isAdminUser = (user, adminEmails = []) =>
  Boolean(user && user.emailVerified === true && adminEmails.includes(String(user.email || '').toLowerCase()));
