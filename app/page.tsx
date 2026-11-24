import { ChessApp } from '@/components/ChessApp';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function HomePage() {
  return (
    <ErrorBoundary>
      <ChessApp />
    </ErrorBoundary>
  );
}
