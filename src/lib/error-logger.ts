/**
 * Error Logger - Environment-aware error logging for error boundaries.
 *
 * In development (__DEV__ = true): logs to console with full stack trace.
 * In production: outputs structured JSON logs suitable for log aggregation services
 * and forwards errors to Sentry with metadata.
 *
 * Requirements: 19.4, 3.4, 3.5
 */
import { captureException } from '@/lib/sentry';
import React from 'react';

export interface StructuredErrorLog {
  level: 'error';
  message: string;
  timestamp: string;
  context?: string;
  componentStack?: string;
  stack?: string;
}

/**
 * Log a caught error from an error boundary.
 *
 * @param error - The error that was caught
 * @param errorInfo - React error info with component stack
 * @param context - Optional context string (e.g., tab name)
 */
export function logError(
  error: Error,
  errorInfo: React.ErrorInfo,
  context?: string,
): void {
  if (__DEV__) {
    // Development: verbose console output for easy debugging
    console.error('[ErrorBoundary]', context ? `[${context}]` : '', error);
    if (errorInfo.componentStack) {
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    }
  } else {
    // Production: structured log for aggregation/monitoring
    const structuredLog: StructuredErrorLog = {
      level: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
      context: context ?? 'root',
      componentStack: errorInfo.componentStack ?? undefined,
      stack: error.stack ?? undefined,
    };

    // Output as structured JSON - can be picked up by log aggregation tools
    console.error(JSON.stringify(structuredLog));

    // Forward to Sentry with metadata for production error monitoring
    captureException(error, {
      componentStack: errorInfo.componentStack ?? undefined,
      route: context ?? 'unknown',
      context: context ?? 'root',
    });
  }
}
