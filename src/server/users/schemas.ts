import 'server-only';
import { z } from 'zod';
import { UserRoleSchema } from '@/core/domain/entities/club.types';
import { EmailSchema } from '../auth/login-schema';
import { NewPasswordSchema } from '../auth/password-schema';

/** Request bodies of the user administration API (S2, S4, S6). Unknown fields are dropped. */

/** Upper bound for these small JSON bodies. */
export const MAX_USER_BODY_BYTES = 4 * 1024;

const NameSchema = z.string().trim().min(2).max(60);

/** `POST /api/users`. */
export const CreateUserBodySchema = z.object({
  name: NameSchema,
  email: EmailSchema,
  role: UserRoleSchema,
  temporaryPassword: NewPasswordSchema,
});
export type CreateUserBody = z.infer<typeof CreateUserBodySchema>;

/** `PATCH /api/users/[id]`: at least one editable field. */
export const UpdateUserBodySchema = z
  .object({
    name: NameSchema.optional(),
    email: EmailSchema.optional(),
    role: UserRoleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'Nothing to update',
  });
export type UpdateUserBody = z.infer<typeof UpdateUserBodySchema>;

/** `POST /api/users/[id]/password`. */
export const ResetPasswordBodySchema = z.object({ temporaryPassword: NewPasswordSchema });
export type ResetPasswordBody = z.infer<typeof ResetPasswordBodySchema>;
