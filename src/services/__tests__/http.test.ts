import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { AxiosInstance } from 'axios';

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');

  const instance: Pick<AxiosInstance, 'interceptors' | 'request'> = {
    interceptors: {
      request: {
        use: vi.fn(),
        eject: function (_id: number): void {
          throw new Error('Function not implemented.');
        },
        clear: function (): void {
          throw new Error('Function not implemented.');
        },
      },
      response: {
        use: vi.fn(),
        eject: function (_id: number): void {
          throw new Error('Function not implemented.');
        },
        clear: function (): void {
          throw new Error('Function not implemented.');
        },
      },
    },
    request: vi.fn(),
  };

  return {
    ...actual,
    default: {
      create: vi.fn(() => instance),
      AxiosError: actual.AxiosError,
    },
  };
});

vi.mock('../authRecovery', () => ({
  requireAuthRecovery: vi.fn(),
}));

describe('http interceptors', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    await import('../http'); // ensure interceptors register fresh for each test
  });

  test('attaches bearer token when getter is configured', async () => {
    const { setAuthTokenGetter } = await import('../http');
    setAuthTokenGetter(async () => 'test-token');

    const axios = await import('axios');
    const instance = (axios.default.create as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    const [requestInterceptor] = instance.interceptors.request.use.mock.calls[0];

    const config = { headers: {} } as Parameters<typeof requestInterceptor>[0];
    const result = await requestInterceptor(config);

    expect(result.headers.Authorization).toBe('Bearer test-token');
  });

  test('does not override Authorization header', async () => {
    const { setAuthTokenGetter } = await import('../http');
    setAuthTokenGetter(async () => 'test-token');

    const axios = await import('axios');
    const instance = (axios.default.create as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    const [requestInterceptor] = instance.interceptors.request.use.mock.calls[0];

    const config = { headers: { Authorization: 'Bearer existing' } } as Parameters<
      typeof requestInterceptor
    >[0];
    const result = await requestInterceptor(config);

    expect(result.headers.Authorization).toBe('Bearer existing');
  });

  test('passes through non-error responses', async () => {
    const axios = await import('axios');
    const instance = (axios.default.create as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    const [fulfilledInterceptor] = instance.interceptors.response.use.mock.calls[0];

    const mockResponse = { status: 201, data: 'ok', config: { url: '/mutate' } };

    const result = await fulfilledInterceptor(mockResponse);

    expect(result).toBe(mockResponse);
  });

  test('normalizes error responses', async () => {
    const axios = await import('axios');
    const instance = (axios.default.create as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    const [, errorInterceptor] = instance.interceptors.response.use.mock.calls[0];

    await expect(
      errorInterceptor({
        response: { status: 401, data: { message: 'Unauthorized' } },
        config: { url: '/secure', method: 'get' },
        message: 'Unauthorized',
      }),
    ).rejects.toEqual({
      status: 401,
      url: '/secure',
      method: 'GET',
      message: 'Unauthorized',
      details: { message: 'Unauthorized' },
    });
  });

  test('retries once with refreshed token on 401', async () => {
    const { setAuthTokenGetter } = await import('../http');
    setAuthTokenGetter(async (options) => (options?.skipCache ? 'fresh-token' : 'stale-token'));

    const axios = await import('axios');
    const instance = (axios.default.create as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    const [, errorInterceptor] = instance.interceptors.response.use.mock.calls[0];

    instance.request.mockResolvedValue({ status: 200, data: { ok: true } });

    const result = await errorInterceptor({
      response: { status: 401, data: { message: 'Unauthorized' } },
      config: { url: '/secure', method: 'get', headers: {} },
      message: 'Unauthorized',
    });

    expect(instance.request).toHaveBeenCalledWith(
      expect.objectContaining({
        _authRetry: true,
        headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
      }),
    );
    expect(result).toEqual({ status: 200, data: { ok: true } });
  });

  test('signals auth recovery when 401 persists with a token', async () => {
    const { setAuthTokenGetter } = await import('../http');
    const { requireAuthRecovery } = await import('../authRecovery');
    setAuthTokenGetter(async () => null);

    const axios = await import('axios');
    const instance = (axios.default.create as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    const [, errorInterceptor] = instance.interceptors.response.use.mock.calls[0];

    await expect(
      errorInterceptor({
        response: { status: 401, data: { message: 'Unauthorized' } },
        config: { url: '/secure', method: 'get', headers: {}, _authHadToken: true },
        message: 'Unauthorized',
      }),
    ).rejects.toEqual({
      status: 401,
      url: '/secure',
      method: 'GET',
      message: 'Unauthorized',
      details: { message: 'Unauthorized' },
    });

    expect(requireAuthRecovery).toHaveBeenCalledTimes(1);
  });
});
