import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '../context/AppContext';
import { NavShell } from '../components/NavShell';

export const metadata: Metadata = {
  title: 'NX — Notification Engine Dashboard',
  description:
    'Real-time monitoring dashboard for the NX scalable multi-tenant notification engine. Track notifications, delivery status, retry activity, and channel performance.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <NavShell>{children}</NavShell>
        </AppProvider>
      </body>
    </html>
  );
}
