import './globals.css';
import { Header } from '../components/Header';
import { RagAssistant } from '../components/RagAssistant';

export const metadata = {
  title: 'CrownStack Blog',
  description: 'Publish blogs, articles and new findings',
};

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
        <RagAssistant />
      </body>
    </html>
  );
}
