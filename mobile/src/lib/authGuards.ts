type AuthGuardOptions = {
  userId?: string | null;
  message?: string;
  setMessage?: (message: string) => void;
  goToAuth?: () => void;
};

type RoleGuardOptions = AuthGuardOptions & {
  role?: string | null;
  requiredRole: string;
  roleMessage?: string;
};

export function ensureAuthenticated(options: AuthGuardOptions): boolean {
  const { userId, message = 'Sign in to continue.', setMessage, goToAuth } = options;
  if (userId) return true;
  setMessage?.(message);
  goToAuth?.();
  return false;
}

export function ensureRole(options: RoleGuardOptions): boolean {
  const {
    role,
    requiredRole,
    roleMessage = `This action requires ${requiredRole} role.`,
    setMessage,
  } = options;
  if (role === requiredRole) return true;
  setMessage?.(roleMessage);
  return false;
}
