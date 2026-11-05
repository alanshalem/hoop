'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Lock, LogOut } from 'lucide-react';
import { afterPasswordChangePath } from '@/core/application/auth/auth-session';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validatePasswordChange,
  type PasswordChangeErrors,
  type PasswordChangeInput,
} from '@/core/application/auth/password-rules';
import { useAuthStore } from '@/core/application/stores/useAuthStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { ClubCrest } from '@/presentation/atoms/ClubCrest/ClubCrest';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { PageHeader } from '@/presentation/molecules/PageHeader/PageHeader';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { accountFailureMessage, SERVER_FALLBACK_MESSAGE } from '@/presentation/session/account-messages';
import { TOO_MANY_ATTEMPTS_MESSAGE } from '@/presentation/session/login-notice';
import { logoutWithConfirmation } from '@/presentation/session/logout';
import { authApi } from '@/presentation/session/sync-runtime';
import { useHydrated } from '@/presentation/session/useHydrated';
import styles from './PasswordChangeScreen.module.css';

const EMPTY_FORM: PasswordChangeInput = { currentPassword: '', newPassword: '', repeatPassword: '' };

const SUCCESS_NOTICE = {
  title: 'Contraseña actualizada',
  message: 'Tu nueva contraseña ya está activa. Se cerraron tus sesiones en otros dispositivos; esta sigue abierta.',
  tone: 'success',
} as const;

/**
 * Own password change (S5). While the account must replace a temporary password
 * (S3) the screen stands alone: no navigation, only the change or logging out,
 * and afterwards the user continues to `next`.
 */
export function PasswordChangeScreen() {
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useAuthStore((state) => state.user);
  const [values, setValues] = useState<PasswordChangeInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<PasswordChangeErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Keeps the standalone layout while leaving, after the flag has cleared.
  const [isLeaving, setIsLeaving] = useState(false);

  const forced = isLeaving || (hydrated && (user?.mustChangePassword ?? false));

  const setField = (field: keyof PasswordChangeInput) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fieldErrors = validatePasswordChange(values);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setIsSubmitting(true);
    const result = await authApi.changePassword(values.currentPassword, values.newPassword);
    setIsSubmitting(false);

    if (result.ok) {
      setValues(EMPTY_FORM);
      if (forced) {
        setIsLeaving(true);
        useAuthStore.getState().setUser(result.value);
        router.replace(afterPasswordChangePath(new URLSearchParams(window.location.search).get('next')));
      } else {
        useAuthStore.getState().setUser(result.value);
      }
      await notify(SUCCESS_NOTICE);
      return;
    }

    if (result.reason === 'WRONG_CURRENT_PASSWORD') {
      setValues((current) => ({ ...current, currentPassword: '' }));
      setErrors({ currentPassword: accountFailureMessage(result, 'La contraseña actual no es correcta.') });
      return;
    }
    if (result.reason === 'TOO_MANY_ATTEMPTS') {
      setValues((current) => ({ ...current, currentPassword: '' }));
      await notify({
        title: 'Demasiados intentos',
        message: accountFailureMessage(result, TOO_MANY_ATTEMPTS_MESSAGE),
        tone: 'warning',
      });
      return;
    }
    if (result.error === 'UNAUTHORIZED') {
      await notify({
        title: 'Tu sesión terminó',
        message: 'Inicia sesión de nuevo para cambiar la contraseña.',
        tone: 'warning',
      });
      useAuthStore.getState().clearUser();
      return;
    }
    await notify({
      title: result.error === 'NETWORK' ? 'Sin conexión' : 'No se pudo cambiar la contraseña',
      message: accountFailureMessage(result, SERVER_FALLBACK_MESSAGE),
      tone: result.error === 'NETWORK' ? 'warning' : 'danger',
    });
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logoutWithConfirmation((path) => router.replace(path));
    } finally {
      setIsLoggingOut(false);
    }
  };

  const form = (
    <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
      {/* Lets password managers file the new password under this account. */}
      <input type="text" name="username" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
      <TextField
        label={forced ? 'Contraseña temporal' : 'Contraseña actual'}
        type="password"
        name="current-password"
        autoComplete="current-password"
        leftIcon={<Lock size={ICON_SIZE.md} />}
        value={values.currentPassword}
        onChange={setField('currentPassword')}
        error={errors.currentPassword}
        required
      />
      <TextField
        label="Nueva contraseña"
        type="password"
        name="new-password"
        autoComplete="new-password"
        hint={`De ${PASSWORD_MIN_LENGTH} a ${PASSWORD_MAX_LENGTH} caracteres.`}
        leftIcon={<KeyRound size={ICON_SIZE.md} />}
        value={values.newPassword}
        onChange={setField('newPassword')}
        error={errors.newPassword}
        required
      />
      <TextField
        label="Repetir nueva contraseña"
        type="password"
        name="repeat-password"
        autoComplete="new-password"
        leftIcon={<KeyRound size={ICON_SIZE.md} />}
        value={values.repeatPassword}
        onChange={setField('repeatPassword')}
        error={errors.repeatPassword}
        required
      />
      <TouchButton type="submit" size="lg" fullWidth disabled={isSubmitting} leftIcon={<KeyRound size={ICON_SIZE.md} />}>
        {isSubmitting ? 'Guardando...' : 'Cambiar contraseña'}
      </TouchButton>
    </form>
  );

  if (forced) {
    return (
      <main className={styles.screen}>
        <div className={styles.panel}>
          <header className={styles.brand}>
            <ClubCrest size={72} eager />
            <h1 className={styles.title}>Elige tu contraseña</h1>
            <p className={styles.subtitle}>
              {user ? `Hola, ${user.name}. ` : ''}Ingresaste con una contraseña temporal que te dio el administrador.
              Para seguir, reemplázala por una contraseña propia que solo tú conozcas.
            </p>
          </header>
          {form}
          <TouchButton
            variant="ghost"
            fullWidth
            leftIcon={<LogOut size={ICON_SIZE.md} />}
            onClick={() => void handleLogout()}
            disabled={isLoggingOut || isLeaving}
          >
            {isLoggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
          </TouchButton>
        </div>
      </main>
    );
  }

  return (
    <TabletAppShell>
      <div className="page-container">
        <PageHeader
          title="Cambiar contraseña"
          subtitle="Escribe tu contraseña actual y la nueva dos veces. Tus otras sesiones abiertas se cerrarán; esta sigue activa."
        />
        <section className={styles.card} aria-label="Cambiar contraseña">
          {form}
        </section>
      </div>
    </TabletAppShell>
  );
}
