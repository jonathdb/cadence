/**
 * ErrorBoundary - Root error boundary wrapping the entire component tree.
 *
 * Catches unhandled JavaScript errors in child components and renders a
 * user-friendly crash screen with a "Retry" action. Logs errors to console
 * in development and outputs structured logs in production.
 *
 * React error boundaries require class components.
 *
 * Requirements: 19.1, 19.2, 19.3, 19.4
 */
import React from 'react';

import { AppCrashScreen } from '@/components/AppCrashScreen';
import { logError } from '@/lib/error-logger';

export interface ErrorBoundaryProps {
  /** Optional custom fallback component */
  fallback?: React.ComponentType<{ error: Error; onReset: () => void }>;
  /** Called when the boundary resets (e.g., for analytics or state cleanup) */
  onReset?: () => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logError(error, errorInfo);
  }

  handleReset = (): void => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      const FallbackComponent = this.props.fallback ?? AppCrashScreen;
      return <FallbackComponent error={this.state.error} onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}
