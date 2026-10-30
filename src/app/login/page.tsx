import type { Metadata } from 'next';
import { LoginScreen } from './_components/LoginScreen';

export const metadata: Metadata = {
  title: 'Ingresar',
};

export default function LoginPage() {
  return <LoginScreen />;
}
