import 'server-only';
import { z } from 'zod';

/**
 * Body of `POST /api/auth/login`. The email is normalized like stored emails
 * (trimmed, lowercase); the password is kept exactly as typed.
 */
export const LoginBodySchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(256),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;
