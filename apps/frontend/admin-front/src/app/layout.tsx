import type { Metadata } from 'next';
import './globals.css';
import { AuthGuard, AppLayout } from '@praxis/commons';

export const metadata: Metadata = {
  title: 'PRAXIS — Administración',
  description: 'Panel de control administrativo.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="bg-[#0D0F14] text-[#E8EAF0] antialiased">
        <AuthGuard>
          <AppLayout>{children}</AppLayout>
        </AuthGuard>
      </body>
    </html>
  );
}
