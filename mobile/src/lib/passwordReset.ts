import { supabase } from './supabase';

/** Emails a recovery code. The Supabase "Reset password" email template must include {{ .Token }}. */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw new Error(error.message);
}

/** Checks the emailed code (which signs the user in) and sets the new password. */
export async function resetPasswordWithCode(email: string, code: string, newPassword: string): Promise<void> {
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'recovery',
  });
  if (verifyError) throw new Error(verifyError.message);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}
