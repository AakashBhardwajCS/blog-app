import './globals.css';
import { Header } from '../components/Header';

export const metadata = { title: 'goBlog', description: 'A simple publishing platform' };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="mx-auto min-h-[calc(100vh-73px)] max-w-6xl px-5 py-10 sm:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
