/**
 * Authentication types based on go-auth backend analysis
 * Reference: /Users/michaeljay/go-dev/go-auth/docs/authenticate-return-analysis.md
 */

// ============================================================================
// Error Codes
// ============================================================================

export const AuthErrorCode = {
  // 401 Unauthorized - Wrong credentials or user not found
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  REGISTRATION_REQUIRED: 'REGISTRATION_REQUIRED',
  AUTH_RECORD_NOT_FOUND: 'AUTH_RECORD_NOT_FOUND',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // 403 Forbidden - User exists but cannot proceed
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  PROVIDER_DISABLED: 'PROVIDER_DISABLED',
  MFA_SETUP_REQUIRED: 'MFA_SETUP_REQUIRED',

  // 423 Locked - Temporary lockout
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',

  // 400 Bad Request - Client error
  INVALID_STATE: 'INVALID_STATE',
  UNSUPPORTED_PROVIDER: 'UNSUPPORTED_PROVIDER',

  // 409 Conflict - Data inconsistency
  OAUTH_SUBJECT_ID_MISMATCH: 'OAUTH_SUBJECT_ID_MISMATCH',

  // 500 Internal Server Error
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // 502 Bad Gateway - External provider issue
  TOKEN_EXCHANGE_FAILED: 'TOKEN_EXCHANGE_FAILED',
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

// ============================================================================
// Providers
// ============================================================================

export type AuthProvider = 'password' | 'google' | 'facebook' | 'magiclink';

// ============================================================================
// Backend Response Types
// ============================================================================

/**
 * Main authentication result from backend
 * Pattern 1 [Session scenario]: Success=true with SessionID -> Full auth complete
 * Pattern 2 [MFA challenge scenario]: Success=true with MFARequired=true -> Need MFA verification
 * Pattern 3 [Failure scenario]: Success=false with ErrorCode -> Auth failed with reason
 */
export interface AuthResult {
  success: boolean;
  sessionId?: string;
  expiresAt?: string; // ISO timestamp
  subjectId?: string;
  provider?: AuthProvider;
  attributes?: Record<string, unknown>;

  // MFA challenge scenario
  mfaRequired?: boolean;
  mfaToken?: string;

  // Failure scenario
  errorCode?: AuthErrorCode;
  message?: string;
}

/**
 * Backend error response (non-auth-specific errors)
 * These are returned when auth cannot proceed at all
 */
export interface BackendError {
  error: string;
  message: string;
  code?: string;
}

// ============================================================================
// Request Types
// ============================================================================

export interface PasswordLoginRequest {
  email: string;
  password: string;
}

export interface OAuthLoginRequest {
  provider: 'google' | 'facebook';
  code: string;
  state: string;
}

export interface MFAVerifyRequest {
  mfaToken: string;
  code: string;
}

// ============================================================================
// Frontend-Friendly Types (what our service layer returns)
// ============================================================================

/**
 * Tagged union type for frontend consumption
 * This makes it easier to handle different auth outcomes in React
 */
export type AuthOutcome = AuthOutcomeSuccess | AuthOutcomeMFARequired | AuthOutcomeError;

export interface AuthOutcomeSuccess {
  type: 'SUCCESS';
  sessionId: string;
  expiresAt: Date;
  subjectId: string;
  provider: AuthProvider;
  attributes?: Record<string, unknown>;
}

export interface AuthOutcomeMFARequired {
  type: 'MFA_REQUIRED';
  mfaToken: string;
  subjectId: string;
  provider: AuthProvider;
}

export interface AuthOutcomeError {
  type: 'ERROR';
  errorCode?: AuthErrorCode;
  message: string;
  httpStatus?: number;

  // Specific action hints for UI
  action?: AuthErrorAction;
}

/**
 * Actions the UI should take based on error codes
 * Reference: Section "Error Codes Requiring Further Action" in analysis doc
 */
export type AuthErrorAction =
  | 'SHOW_REGISTRATION_FORM'
  | 'SHOW_EMAIL_VERIFICATION_PROMPT'
  | 'SHOW_LOCKOUT_MESSAGE'
  | 'REDIRECT_TO_MFA_SETUP'
  | 'SHOW_GENERIC_ERROR'
  | 'CONTACT_SUPPORT';

// ============================================================================
// Helper Type Guards
// ============================================================================

export function isAuthSuccess(outcome: AuthOutcome): outcome is AuthOutcomeSuccess {
  return outcome.type === 'SUCCESS';
}

export function isAuthMFARequired(outcome: AuthOutcome): outcome is AuthOutcomeMFARequired {
  return outcome.type === 'MFA_REQUIRED';
}

export function isAuthError(outcome: AuthOutcome): outcome is AuthOutcomeError {
  return outcome.type === 'ERROR';
}

// ============================================================================
// Error Mapping Helpers
// ============================================================================

/**
 * Map backend error codes to user-facing messages and actions
 */
export function getErrorDetails(errorCode?: AuthErrorCode): {
  message: string;
  action: AuthErrorAction;
} {
  switch (errorCode) {
    case AuthErrorCode.INVALID_CREDENTIALS:
    case AuthErrorCode.AUTH_RECORD_NOT_FOUND:
      return {
        message: 'Invalid email or password. Please try again.',
        action: 'SHOW_GENERIC_ERROR',
      };

    case AuthErrorCode.REGISTRATION_REQUIRED:
      // todo - this needs updating, because it's not quite what REGISTRATION_REQUIRED means
      // recall - this can happen when oauth can authenticate a user, but the user's auth record can't be found
      return {
        message: 'No account found. Please sign up first.',
        action: 'SHOW_REGISTRATION_FORM',
      };

    case AuthErrorCode.EMAIL_NOT_VERIFIED:
      return {
        message: 'Please verify your email before logging in.',
        action: 'SHOW_EMAIL_VERIFICATION_PROMPT',
      };

    case AuthErrorCode.ACCOUNT_LOCKED:
      return {
        message:
          'Your account has been temporarily locked due to too many failed login attempts. Please try again later.',
        action: 'SHOW_LOCKOUT_MESSAGE',
      };

    case AuthErrorCode.ACCOUNT_DISABLED:
      return {
        message: 'Your account has been disabled. Please contact support.',
        action: 'CONTACT_SUPPORT',
      };

    case AuthErrorCode.MFA_SETUP_REQUIRED:
      return {
        message: 'Multi-factor authentication is required. Please set up MFA.',
        action: 'REDIRECT_TO_MFA_SETUP',
      };

    case AuthErrorCode.TOKEN_EXPIRED:
      return {
        message: 'Your login link has expired. Please request a new one.',
        action: 'SHOW_GENERIC_ERROR',
      };

    case AuthErrorCode.INTERNAL_ERROR:
    case AuthErrorCode.TOKEN_EXCHANGE_FAILED:
      return {
        message: 'Something went wrong. Please try again later.',
        action: 'SHOW_GENERIC_ERROR',
      };

    default:
      return {
        message: 'Login failed. Please try again.',
        action: 'SHOW_GENERIC_ERROR',
      };
  }
}
