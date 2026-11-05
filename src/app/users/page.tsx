import type { Metadata } from 'next';
import { UsersScreen } from './_components/UsersScreen';

export const metadata: Metadata = {
  title: 'Usuarios',
};

export default function UsersPage() {
  return <UsersScreen />;
}
