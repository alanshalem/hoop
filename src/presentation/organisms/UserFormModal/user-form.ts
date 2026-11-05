import { z } from 'zod';
import { UserRoleSchema } from '@/core/domain/entities/club.types';
import { NEW_PASSWORD_MESSAGE, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/core/application/auth/password-rules';
import type { ManagedUser, UserPatch } from '@/core/application/users/user-admin';

/** Same limits as `/api/users` (S2, S6), so the form refuses what the server would refuse. */
const USER_NAME_MIN_LENGTH = 2;
const USER_NAME_MAX_LENGTH = 60;

const NAME_MESSAGE = `El nombre debe tener de ${USER_NAME_MIN_LENGTH} a ${USER_NAME_MAX_LENGTH} caracteres.`;

const NameSchema = z.string().trim().min(USER_NAME_MIN_LENGTH, NAME_MESSAGE).max(USER_NAME_MAX_LENGTH, NAME_MESSAGE);
const EmailSchema = z.string().trim().max(254, 'El email no tiene un formato válido.').pipe(z.email('El email no tiene un formato válido.'));
const RoleSchema = z.enum(UserRoleSchema.options, { message: 'Elige el rol del usuario.' });
/** Kept exactly as typed, like the server does. */
const TemporaryPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH, NEW_PASSWORD_MESSAGE).max(PASSWORD_MAX_LENGTH, NEW_PASSWORD_MESSAGE);

export const EditUserFormSchema = z.object({ name: NameSchema, email: EmailSchema, role: RoleSchema });
export type EditUserFormData = z.infer<typeof EditUserFormSchema>;

export const CreateUserFormSchema = EditUserFormSchema.extend({ temporaryPassword: TemporaryPasswordSchema });
export type CreateUserFormData = z.infer<typeof CreateUserFormSchema>;

export const ResetPasswordFormSchema = z.object({ temporaryPassword: TemporaryPasswordSchema });
export type ResetPasswordFormData = z.infer<typeof ResetPasswordFormSchema>;

/** A new account starts with the role that can do the least. */
export const toUserFormData = (user: ManagedUser | null | undefined): EditUserFormData =>
  user ? { name: user.name, email: user.email, role: user.role } : { name: '', email: '', role: 'ASSISTANT_STATISTICIAN' };

/** Changed fields only (the server stores emails lowercase), or null when nothing changed. */
export function toUserPatch(user: ManagedUser, data: EditUserFormData): UserPatch | null {
  const patch: UserPatch = {};
  if (data.name !== user.name) patch.name = data.name;
  if (data.email.toLowerCase() !== user.email.toLowerCase()) patch.email = data.email;
  if (data.role !== user.role) patch.role = data.role;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Form field a server refusal belongs to; null closes the form with a notice. */
export function userRefusalField(reason: string | undefined): 'email' | null {
  return reason === 'EMAIL_TAKEN' ? 'email' : null;
}

export function resetPasswordMessage(user: Pick<ManagedUser, 'name'>, isOwnAccount: boolean): string {
  return isOwnAccount
    ? 'Es tu propia cuenta: se cerrarán todas tus sesiones, también esta, y tendrás que ingresar con la contraseña temporal y cambiarla.'
    : `${user.name} tendrá que ingresar con la contraseña temporal y cambiarla. Se cerrarán todas sus sesiones abiertas.`;
}

export function deactivateUserMessage(user: Pick<ManagedUser, 'name'>): string {
  return `${user.name} no podrá iniciar sesión y se cerrarán sus sesiones abiertas. La cuenta queda en la lista y se puede reactivar.`;
}
