import { makeUser } from './user';
import type { User } from '../../features/user/types';

export interface CreateAccountRequest {
  account_name: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export interface CreateAccountResponse {
  account_id: string;
  user_id: string;
  session_id: string;
  expires_at: number;
  user: User;
}

/**
 * Creates a mock signup request payload
 */
export function makeSignupPayload(overrides?: Partial<CreateAccountRequest>): CreateAccountRequest {
  return {
    account_name: 'Acme Corporation',
    email: 'john@example.com',
    password: 'securePassword123',
    first_name: 'John',
    last_name: 'Doe',
    ...overrides,
  };
}

/**
 * Creates a mock signup success response
 */
export function makeSignupSuccessResponse(
  overrides?: Partial<CreateAccountResponse>,
): CreateAccountResponse {
  return {
    account_id: '123e4567-e89b-12d3-a456-426614174000',
    user_id: 'usr_2ZgX9KpQrY7NxMwV8BcTfH1LaEb',
    session_id: 'ses_4CiZ2MrStA9PzOxX0DeVjJ3NcGd',
    expires_at: 1737120000,
    user: makeUser({
      subject_id: 'usr_2ZgX9KpQrY7NxMwV8BcTfH1LaEb',
      email: 'john@example.com',
      first_name: 'John',
      last_name: 'Doe',
      role: 'admin',
      is_owner: true,
    }),
    ...overrides,
  };
}

// Error response types based on OpenAPI spec

export interface ErrorResponse {
  error: string;
  code: string;
}

export interface ErrorResponseWithDetails extends ErrorResponse {
  details: string;
}

/**
 * Creates a mock invalid request error (400 - binding error)
 */
export function makeSignupInvalidRequestError(
  overrides?: Partial<ErrorResponseWithDetails>,
): ErrorResponseWithDetails {
  return {
    error: 'Invalid request data',
    code: 'INVALID_REQUEST',
    details:
      "Key: 'CreateAccountRequest.Email' Error:Field validation for 'Email' failed on the 'required' tag",
    ...overrides,
  };
}

/**
 * Creates a mock validation error (400 - service validation)
 */
export function makeSignupValidationError(overrides?: Partial<ErrorResponse>): ErrorResponse {
  return {
    error: 'password must be at least 8 characters',
    code: 'VALIDATION_ERROR',
    ...overrides,
  };
}

/**
 * Creates a mock creation failed error (400 - email exists, generic message)
 */
export function makeSignupCreationFailedError(overrides?: Partial<ErrorResponse>): ErrorResponse {
  return {
    error: 'Account creation failed',
    code: 'CREATION_FAILED',
    ...overrides,
  };
}

/**
 * Creates a mock internal server error (500)
 */
export function makeSignupInternalServerError(overrides?: Partial<ErrorResponse>): ErrorResponse {
  return {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...overrides,
  };
}
