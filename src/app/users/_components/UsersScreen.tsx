'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { CloudOff, KeyRound, Lock, Pencil, RefreshCw, TriangleAlert, UserCheck, UserPlus, UserX, UsersRound } from 'lucide-react';
import { USER_ROLE_LABELS } from '@/core/domain/entities/club.types';
import { can } from '@/core/domain/rules/permissions';
import { LOGIN_PATH } from '@/core/application/auth/auth-session';
import { useAuthStore } from '@/core/application/stores/useAuthStore';
import type { ManagedUser } from '@/core/application/users/user-admin';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { PageHeader } from '@/presentation/molecules/PageHeader/PageHeader';
import { EmptyState } from '@/presentation/molecules/EmptyState/EmptyState';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { confirm, notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { CreateUserModal } from '@/presentation/organisms/UserFormModal/CreateUserModal';
import { EditUserModal } from '@/presentation/organisms/UserFormModal/EditUserModal';
import { ResetPasswordModal } from '@/presentation/organisms/UserFormModal/ResetPasswordModal';
import { reportUserAdminFailure } from '@/presentation/organisms/UserFormModal/report-failure';
import { deactivateUserMessage } from '@/presentation/organisms/UserFormModal/user-form';
import { useEditModal } from '@/presentation/hooks/useEditModal';
import { accountFailureMessage } from '@/presentation/session/account-messages';
import { usersApi } from '@/presentation/session/sync-runtime';
import { useHydrated } from '@/presentation/session/useHydrated';
import styles from './UsersScreen.module.css';

type UsersLoad =
  | { status: 'loading' }
  | { status: 'ready'; users: ManagedUser[] }
  | { status: 'error'; offline: boolean; message: string };

/**
 * Accounts from `GET /api/users` (not club data: never synced or stored on the
 * device). `reload` keeps the list on screen while it refreshes; `retry` shows
 * the loading state again.
 */
function useManagedUsers(enabled: boolean) {
  const [load, setLoad] = useState<UsersLoad>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void usersApi.list().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setLoad({ status: 'ready', users: result.value });
        return;
      }
      // A lost session goes back to /login (SessionProvider).
      if (result.error === 'UNAUTHORIZED') useAuthStore.getState().clearUser();
      setLoad({
        status: 'error',
        offline: result.error === 'NETWORK',
        message: accountFailureMessage(result, 'El servidor no respondió como se esperaba. Inténtalo de nuevo en unos minutos.'),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setVersion((current) => current + 1);
  }, []);
  return { load, reload, retry };
}

const credentialsNotice = (user: ManagedUser, temporaryPassword: string) => (
  <>
    Entrégale a {user.name} su email <strong>{user.email}</strong> y la contraseña temporal{' '}
    <strong className={styles.password}>{temporaryPassword}</strong>. Al ingresar deberá cambiarla por una propia.
  </>
);

/** User administration (S1, S2, S4, S6): only the administrator (`MANAGE_USERS`) sees and changes accounts. */
export function UsersScreen() {
  const router = useRouter();
  const hydrated = useHydrated();
  const authUser = useAuthStore((state) => state.user);
  const knowsRole = hydrated && authUser !== null;
  const canManage = knowsRole && can(authUser.role, 'MANAGE_USERS');
  const { load, reload, retry } = useManagedUsers(canManage);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const editForm = useEditModal<ManagedUser>();
  const resetForm = useEditModal<ManagedUser>();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const isOwnAccount = (user: ManagedUser | null) => user !== null && user.id === authUser?.id;

  const handleCreated = (user: ManagedUser, temporaryPassword: string) => {
    reload();
    void notify({ title: 'Usuario creado', message: credentialsNotice(user, temporaryPassword), tone: 'success' });
  };

  const handleSaved = (user: ManagedUser) => {
    reload();
    const auth = useAuthStore.getState();
    // The own profile shows the new name and email at once (the role cannot change).
    if (auth.user?.id === user.id) auth.setUser({ ...auth.user, name: user.name, email: user.email, role: user.role });
  };

  const handleReset = (user: ManagedUser, temporaryPassword: string) => {
    if (isOwnAccount(user)) {
      // Every session of the account closed, this one too: log in again with the temporary password.
      router.replace(LOGIN_PATH);
      useAuthStore.getState().clearUser();
      void notify({
        title: 'Contraseña restablecida',
        message: 'Se cerraron todas tus sesiones. Ingresa con la contraseña temporal y luego elige una nueva.',
        tone: 'success',
      });
      return;
    }
    reload();
    void notify({ title: 'Contraseña restablecida', message: credentialsNotice(user, temporaryPassword), tone: 'success' });
  };

  const handleToggleActive = async (user: ManagedUser) => {
    const deactivating = user.active;
    const accepted = await confirm(
      deactivating
        ? { title: 'Desactivar usuario', message: deactivateUserMessage(user), confirmLabel: 'Desactivar', tone: 'danger' }
        : {
            title: 'Reactivar usuario',
            message: `${user.name} podrá volver a iniciar sesión con su contraseña.`,
            confirmLabel: 'Reactivar',
          }
    );
    if (!accepted) return;

    setBusyUserId(user.id);
    const result = await usersApi.update(user.id, { active: !deactivating });
    setBusyUserId(null);
    if (result.ok) {
      reload();
      return;
    }
    const title = deactivating ? 'No se pudo desactivar el usuario' : 'No se pudo reactivar el usuario';
    if (await reportUserAdminFailure(result, title)) reload();
  };

  const renderList = () => {
    if (load.status === 'loading') {
      return (
        <p className={styles.status} role="status">
          Cargando usuarios...
        </p>
      );
    }
    if (load.status === 'error') {
      return (
        <EmptyState
          icon={load.offline ? CloudOff : TriangleAlert}
          title={load.offline ? 'Sin conexión' : 'No se pudo cargar la lista de usuarios'}
          description={load.message}
          action={
            <TouchButton variant="secondary" leftIcon={<RefreshCw size={ICON_SIZE.md} />} onClick={retry}>
              Reintentar
            </TouchButton>
          }
        />
      );
    }
    if (load.users.length === 0) {
      return <EmptyState icon={UsersRound} title="Todavía no hay usuarios" description="Crea la primera cuenta con Nuevo usuario." />;
    }
    return (
      <ul className={styles.list}>
        {load.users.map((user) => {
          const own = isOwnAccount(user);
          const busy = busyUserId === user.id;
          return (
            <li key={user.id} className={clsx(styles.userCard, !user.active && styles.userCardInactive)} data-reveal>
              <div className={styles.cardTop}>
                <div className={styles.identity}>
                  <h2 className={styles.userName}>{user.name}</h2>
                  <p className={styles.userEmail}>{user.email}</p>
                </div>
                <span className={clsx(styles.roleTag, user.role !== 'ADMIN' && styles.roleTagMuted)}>
                  {USER_ROLE_LABELS[user.role]}
                </span>
              </div>

              {(own || !user.active || user.mustChangePassword) && (
                <ul className={styles.badges} aria-label="Estado de la cuenta">
                  {own && <li className={clsx(styles.badge, styles.badgeOwn)}>Tu cuenta</li>}
                  {!user.active && <li className={clsx(styles.badge, styles.badgeInactive)}>Inactiva</li>}
                  {user.mustChangePassword && (
                    <li className={clsx(styles.badge, styles.badgeWarning)}>Debe cambiar la contraseña</li>
                  )}
                </ul>
              )}

              <div className={styles.cardActions}>
                <TouchButton
                  variant="secondary"
                  leftIcon={<Pencil size={ICON_SIZE.md} />}
                  onClick={() => editForm.open(user)}
                  disabled={busy}
                >
                  Editar
                </TouchButton>
                <TouchButton
                  variant="secondary"
                  leftIcon={<KeyRound size={ICON_SIZE.md} />}
                  onClick={() => resetForm.open(user)}
                  disabled={busy}
                >
                  Restablecer contraseña
                </TouchButton>
                {!own &&
                  (user.active ? (
                    <TouchButton
                      variant="ghost"
                      className={styles.deactivateButton}
                      leftIcon={<UserX size={ICON_SIZE.md} />}
                      onClick={() => void handleToggleActive(user)}
                      disabled={busy}
                    >
                      Desactivar
                    </TouchButton>
                  ) : (
                    <TouchButton
                      variant="ghost"
                      leftIcon={<UserCheck size={ICON_SIZE.md} />}
                      onClick={() => void handleToggleActive(user)}
                      disabled={busy}
                    >
                      Reactivar
                    </TouchButton>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <TabletAppShell>
      <div className="page-container">
        <PageHeader
          title="Usuarios"
          subtitle="Cuentas que inician sesión en Hoop, con su rol. Las cuentas no se borran: se desactivan y se pueden reactivar."
          actions={
            canManage && (
              <TouchButton leftIcon={<UserPlus size={ICON_SIZE.md} />} onClick={() => setIsCreateOpen(true)}>
                Nuevo usuario
              </TouchButton>
            )
          }
        />

        {!knowsRole ? (
          <p className={styles.status} role="status">
            Cargando usuarios...
          </p>
        ) : canManage ? (
          renderList()
        ) : (
          <p className={styles.readOnlyNote}>
            <Lock size={ICON_SIZE.sm} aria-hidden="true" />
            Solo el administrador gestiona los usuarios.
          </p>
        )}
      </div>

      {canManage && (
        <>
          <CreateUserModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onCreated={handleCreated} />
          <EditUserModal
            isOpen={editForm.isOpen}
            onClose={editForm.close}
            user={editForm.item}
            isOwnAccount={isOwnAccount(editForm.item)}
            onSaved={handleSaved}
            onGone={reload}
          />
          <ResetPasswordModal
            isOpen={resetForm.isOpen}
            onClose={resetForm.close}
            user={resetForm.item}
            isOwnAccount={isOwnAccount(resetForm.item)}
            onReset={handleReset}
            onGone={reload}
          />
        </>
      )}
    </TabletAppShell>
  );
}
