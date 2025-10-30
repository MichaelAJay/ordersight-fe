import type { User } from '../../features/user/types';

/**
 * Creates a mock User fixture with full PII
 */
export function makeUser(overrides?: Partial<User>): User {
  return {
    subject_id: 'usr_2ZgX9KpQrY7NxMwV8BcTfH1LaEb',
    email: 'john@example.com',
    first_name: 'John',
    last_name: 'Doe',
    role: 'admin',
    is_owner: true,
    ...overrides,
  };
}

/**
 * Creates a User without PII (email omitted, first_name/last_name still present per OpenAPI spec)
 * Used for responses where email is not decrypted
 */
export function makeUserWithoutEmail(
  overrides?: Partial<Omit<User, 'email'>>,
): Omit<User, 'email'> {
  return {
    subject_id: 'usr_2ZgX9KpQrY7NxMwV8BcTfH1LaEb',
    first_name: 'John',
    last_name: 'Doe',
    role: 'admin',
    is_owner: true,
    ...overrides,
  };
}
