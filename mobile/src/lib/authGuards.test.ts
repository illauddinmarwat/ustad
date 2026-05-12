import { ensureAuthenticated, ensureRole } from './authGuards';

describe('auth guards', () => {
  it('allows authenticated user', () => {
    expect(ensureAuthenticated({ userId: 'user-1' })).toBe(true);
  });

  it('blocks guest and calls callbacks', () => {
    const setMessage = jest.fn();
    const goToAuth = jest.fn();
    expect(ensureAuthenticated({ userId: null, setMessage, goToAuth, message: 'Sign in required' })).toBe(false);
    expect(setMessage).toHaveBeenCalledWith('Sign in required');
    expect(goToAuth).toHaveBeenCalled();
  });

  it('allows matching role', () => {
    expect(ensureRole({ role: 'worker', requiredRole: 'worker' })).toBe(true);
  });

  it('blocks mismatched role and sets message', () => {
    const setMessage = jest.fn();
    expect(
      ensureRole({
        role: 'customer',
        requiredRole: 'worker',
        roleMessage: 'Worker role required',
        setMessage,
      })
    ).toBe(false);
    expect(setMessage).toHaveBeenCalledWith('Worker role required');
  });
});
