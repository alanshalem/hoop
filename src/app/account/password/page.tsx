import type { Metadata } from 'next';
import { PasswordChangeScreen } from './_components/PasswordChangeScreen';

export const metadata: Metadata = {
  title: 'Cambiar contraseña',
};

export default function PasswordChangePage() {
  return <PasswordChangeScreen />;
}
