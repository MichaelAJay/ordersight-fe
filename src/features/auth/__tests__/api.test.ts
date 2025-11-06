import { describe, expect, test, vi } from 'vitest';
import { makeSignupPayload, makeSignupSuccessResponse } from '../../../test/fixtures/auth';
import { signup } from '@/features/auth/api';
import * as http from '@/services/http';

describe('signup API', () => {
  test('posts to /auth/signup/account with payload', async () => {
    const payload = makeSignupPayload();
    const response = makeSignupSuccessResponse();
    const postSpy = vi.spyOn(http, 'postJSON').mockResolvedValueOnce(response);

    const result = await signup(payload);

    expect(postSpy).toHaveBeenCalledWith('/auth/signup/account', payload);
    expect(result).toEqual(response);
  });
});
