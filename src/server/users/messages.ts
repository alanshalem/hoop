import 'server-only';

/** User-facing user administration messages (Spanish UI copy). */
export const USER_MESSAGES = {
  forbidden: 'Solo el administrador puede gestionar usuarios.',
  invalidCreateBody:
    'Revisa los datos: nombre de 2 a 60 caracteres, un email válido, un rol y una contraseña temporal de 8 a 256 caracteres.',
  invalidUpdateBody: 'Revisa los datos: nombre de 2 a 60 caracteres, un email válido, un rol y un estado válidos.',
  invalidResetBody: 'La contraseña temporal debe tener entre 8 y 256 caracteres.',
  emailTaken: 'Ya existe un usuario con ese email.',
  userNotFound: 'El usuario no existe.',
  selfDeactivation: 'No puedes desactivar tu propia cuenta.',
  selfRoleChange: 'No puedes cambiar el rol de tu propia cuenta.',
  lastAdmin: 'Debe quedar al menos un administrador activo: no puedes desactivar ni cambiar el rol del último.',
} as const;
