'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock, LogIn, Mail } from 'lucide-react';
import { safeNextPath } from '@/core/application/auth/auth-session';
import { useAuthStore } from '@/core/application/stores/useAuthStore';
import { CLUB_BRAND } from '@/presentation/brand';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { ClubCrest } from '@/presentation/atoms/ClubCrest/ClubCrest';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { MOTION, gsap } from '@/presentation/motion/motion';
import { useMotion } from '@/presentation/motion/useMotion';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { authApi } from '@/presentation/session/sync-runtime';
import { useHydrated } from '@/presentation/session/useHydrated';
import styles from './LoginScreen.module.css';

interface FieldErrors {
  email?: string;
  password?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = 'Ingresa tu email.';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'El email no tiene un formato válido.';
  if (!password) errors.password = 'Ingresa tu contraseña.';
  return errors;
}

/** CAMG-branded email + password login (S10.8). Errors are shown in modals. */
export function LoginScreen() {
  const router = useRouter();
  const hydrated = useHydrated();
  const cachedUser = useAuthStore((state) => state.user);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const screenRef = useRef<HTMLElement | null>(null);
  const crestRef = useRef<HTMLImageElement | null>(null);

  useMotion(
    () => {
      gsap
        .timeline()
        .fromTo(
          crestRef.current,
          { scale: 0.8, opacity: 0 },
          { scale: 1, opacity: 1, duration: MOTION.duration.slow, ease: MOTION.ease.pop }
        )
        .fromTo(
          '[data-login-reveal]',
          { opacity: 0, y: 16 },
          {
            opacity: 1,
            y: 0,
            duration: MOTION.duration.slow,
            stagger: MOTION.stagger,
            ease: MOTION.ease.out,
            clearProps: 'opacity,transform',
          },
          '-=0.2'
        );
    },
    { scope: screenRef }
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fieldErrors = validate(email, password);
    setErrors(fieldErrors);
    if (fieldErrors.email || fieldErrors.password) return;

    setIsSubmitting(true);
    const result = await authApi.login(email.trim(), password);
    setIsSubmitting(false);

    if (result.ok) {
      useAuthStore.getState().setUser(result.value);
      router.replace(safeNextPath(new URLSearchParams(window.location.search).get('next')));
      return;
    }

    setPassword('');
    if (result.error === 'NETWORK') {
      await notify({
        title: 'Sin conexión',
        message:
          'Para iniciar sesión necesitas conexión con el servidor del club. Si ya ingresaste antes en esta tablet, tu última sesión sigue disponible sin conexión.',
        tone: 'warning',
      });
    } else if (result.error === 'UNAUTHORIZED') {
      await notify({
        title: 'No pudimos iniciar sesión',
        message: result.message ?? 'Email o contraseña incorrectos',
        tone: 'danger',
      });
    } else {
      await notify({
        title: 'Error del servidor',
        message: result.message ?? 'El servidor no respondió como se esperaba. Inténtalo de nuevo en unos minutos.',
        tone: 'danger',
      });
    }
  };

  return (
    <main ref={screenRef} className={styles.screen}>
      <span className={styles.year} aria-hidden="true">
        {CLUB_BRAND.foundedYear}
      </span>

      <div className={styles.panel}>
        <header className={styles.brand}>
          <span className={styles.crestGlow} aria-hidden="true" />
          <ClubCrest ref={crestRef} size={112} eager className={styles.crest} />
          <p className={styles.eyebrow} data-login-reveal>
            {CLUB_BRAND.clubName}
          </p>
          <h1 className={styles.title} data-login-reveal>
            {CLUB_BRAND.productName}
          </h1>
          <p className={styles.subtitle} data-login-reveal>
            Básquet · Ingresa con tu cuenta del club
          </p>
        </header>

        <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate data-login-reveal>
          <TextField
            label="Email"
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nombre@camg.com.ar"
            leftIcon={<Mail size={ICON_SIZE.md} />}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={errors.email}
            required
          />
          <TextField
            label="Contraseña"
            type="password"
            name="password"
            autoComplete="current-password"
            leftIcon={<Lock size={ICON_SIZE.md} />}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            required
          />
          <TouchButton
            type="submit"
            size="lg"
            fullWidth
            disabled={isSubmitting}
            leftIcon={<LogIn size={ICON_SIZE.md} />}
          >
            {isSubmitting ? 'Ingresando...' : 'Ingresar'}
          </TouchButton>
        </form>

        {hydrated && cachedUser && (
          <div className={styles.cachedSession} data-login-reveal>
            <p className={styles.cachedText}>
              Ya hay una sesión guardada de <strong>{cachedUser.name}</strong> en esta tablet.
            </p>
            <LinkButton href="/" variant="secondary" fullWidth rightIcon={<ArrowRight size={ICON_SIZE.md} />}>
              Continuar como {cachedUser.name}
            </LinkButton>
          </div>
        )}

        <p className={styles.slogan} data-login-reveal>
          {CLUB_BRAND.slogan}
        </p>
      </div>
    </main>
  );
}
