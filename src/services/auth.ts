/**
 * Authentication service
 * Handles all auth-related API calls and transforms backend responses
 * into frontend-friendly types
 */

import { postJSON } from './http';
import {
  AuthOutcome,
  AuthResult,
  PasswordLoginRequest,
  OAuthLoginRequest,
  getErrorDetails,
  AuthErrorCode,
  // AuthProvider,
} from '../types/auth';
import type { HttpError } from './http';

const AUTH_BASE = '/auth';

// ============================================================================
// Core Auth Methods
// ============================================================================

/**
 * Authenticate with email/password
 */
export async function loginWithPassword(email: string, password: string): Promise<AuthOutcome> {
  try {
    const result = await postJSON<PasswordLoginRequest, AuthResult>(`${AUTH_BASE}/login`, {
      email,
      password,
    });

    return transformAuthResult(result);
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * Complete OAuth login flow
 * This is called after OAuth provider redirects back with code
 */
export async function loginWithOAuth(
  provider: 'google' | 'facebook',
  code: string,
  state: string,
): Promise<AuthOutcome> {
  try {
    const result = await postJSON<OAuthLoginRequest, AuthResult>(`${AUTH_BASE}/oauth/callback`, {
      provider,
      code,
      state,
    });

    return transformAuthResult(result);
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * Verify MFA code
 */
export async function verifyMFA(mfaToken: string, code: string): Promise<AuthOutcome> {
  try {
    const result = await postJSON<{ mfaToken: string; code: string }, AuthResult>(
      `${AUTH_BASE}/mfa/verify`,
      { mfaToken, code },
    );

    return transformAuthResult(result);
  } catch (error) {
    return handleAuthError(error);
  }
}

// ============================================================================
// OAuth Helper Methods (Stubs for now)
// ============================================================================

/**
 * Get OAuth authorization URL to redirect user to provider
 * In production, this would call your backend to generate the URL with proper state
 */
export function getOAuthLoginUrl(provider: 'google' | 'facebook'): string {
  // TODO: Call backend to generate proper OAuth URL with CSRF state
  // For now, return a stub that points to your backend's OAuth initiation endpoint
  return `${AUTH_BASE}/oauth/${provider}/login`;
}

/**
 * Initialize OAuth login by redirecting to provider
 * This is what you'd call when user clicks "Sign in with Google"
 */
export function initiateOAuthLogin(provider: 'google' | 'facebook'): void {
  const authUrl = getOAuthLoginUrl(provider);
  // In a real implementation, the backend would redirect to the OAuth provider
  window.location.href = authUrl;
}

// ============================================================================
// Response Transformation
// ============================================================================

/**
 * Transform backend AuthResult into frontend AuthOutcome
 * This is where we normalize the backend response for easy consumption
 */
function transformAuthResult(result: AuthResult): AuthOutcome {
  // Pattern 1: Full authentication success
  if (result.success && result.sessionId) {
    return {
      type: 'SUCCESS',
      sessionId: result.sessionId,
      expiresAt: new Date(result.expiresAt!),
      subjectId: result.subjectId!,
      provider: result.provider!,
      attributes: result.attributes,
    };
  }

  // Pattern 2: MFA challenge required
  else if (result.success && result.mfaRequired && result.mfaToken) {
    return {
      type: 'MFA_REQUIRED',
      mfaToken: result.mfaToken,
      subjectId: result.subjectId!,
      provider: result.provider!,
    };
  }

  // Pattern 3: Authentication failed with error code
  else if (!result.success && result.errorCode) {
    const { message, action } = getErrorDetails(result.errorCode);
    return {
      type: 'ERROR',
      errorCode: result.errorCode,
      message: result.message || message,
      action,
    };
  }

  // Fallback: Unexpected response format
  else
    return {
      type: 'ERROR',
      message: 'Unexpected response from server',
      action: 'SHOW_GENERIC_ERROR',
    };
}

/**
 * Handle HTTP errors and network failures
 * These are errors that prevented auth from even being attempted
 */
function handleAuthError(error: unknown): AuthOutcome {
  // HTTP error from our interceptor
  if (isHttpError(error)) {
    // Check if backend sent an error code in the response
    const details = error.details as { errorCode?: AuthErrorCode; message?: string };

    if (details?.errorCode) {
      const { message, action } = getErrorDetails(details.errorCode);
      return {
        type: 'ERROR',
        errorCode: details.errorCode,
        message: details.message || message,
        httpStatus: error.status,
        action,
      };
    }

    // Generic HTTP error
    return {
      type: 'ERROR',
      message: error.message || 'Network error. Please try again.',
      httpStatus: error.status,
      action: 'SHOW_GENERIC_ERROR',
    };
  }

  // Unknown error
  console.error('Unexpected auth error:', error);
  return {
    type: 'ERROR',
    message: 'An unexpected error occurred. Please try again.',
    action: 'SHOW_GENERIC_ERROR',
  };
}

// Type guard for HttpError
function isHttpError(error: unknown): error is HttpError {
  return typeof (error as { message?: unknown })?.message === 'string';
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Logout current user
 */
export async function logout(): Promise<void> {
  try {
    await postJSON(`${AUTH_BASE}/logout`, {});
  } catch (error) {
    // Log but don't throw - logout should always succeed locally
    console.error('Logout failed:', error);
  }
}

/**
 * Check if user is currently authenticated
 * This would typically call a /me or /session endpoint
 */
export async function checkSession(): Promise<{
  authenticated: boolean;
  subjectId?: string;
}> {
  try {
    const result = await postJSON<void, { authenticated: boolean; subjectId?: string }>(
      `${AUTH_BASE}/session`,
      undefined,
    );
    return result;
  } catch {
    return { authenticated: false };
  }
}

// ============================================================================
// Export helpers for external use
// ============================================================================

export type { AuthOutcome } from '../types/auth';
export { isAuthSuccess, isAuthMFARequired, isAuthError } from '../types/auth';
