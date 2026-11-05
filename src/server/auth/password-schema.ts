import 'server-only';
import { z } from 'zod';

/** Every password a user or the admin chooses: 8 to 256 characters, kept exactly as typed (S6). */
export const NewPasswordSchema = z.string().min(8).max(256);

/** Body of `POST /api/auth/password`; the current password only has to fit the login bounds. */
export const PasswordChangeBodySchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: NewPasswordSchema,
});
export type PasswordChangeBody = z.infer<typeof PasswordChangeBodySchema>;
