import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { AxiosInstance, AxiosResponse } from 'axios';

const requestMock = vi.fn();
const getMock = vi.fn();

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');

  const instance: Pick<AxiosInstance, 'get' | 'post' | 'request' | 'interceptors'> = {
    get: getMock,
    post: vi.fn(),
    request: requestMock,
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
  };

  return {
    ...actual,
    default: {
      create: vi.fn(() => instance),
      AxiosError: actual.AxiosError,
    },
  };
});

describe('http interceptors', () => {
  beforeEach(async () => {
    requestMock.mockReset();
    getMock.mockReset();
    vi.resetModules();
    await import('../http'); // ensure interceptors register fresh for each test
  });

  test('calls onUnauthorized handler on 401', async () => {
    const { setOnUnauthorized } = await import('../http');
    const handler = vi.fn();
    setOnUnauthorized(handler);

    const axios = await import('axios');
    const instance = (axios.default.create as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    const [, errorInterceptor] = instance.interceptors.response.use.mock.calls[0];

    await errorInterceptor({
      response: { status: 401 },
      config: { url: '/secure', method: 'get' },
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('retries once on CSRF 403', async () => {
    requestMock.mockResolvedValueOnce({ data: 'ok' } as AxiosResponse);
    const axios = await import('axios');
    const instance = (axios.default.create as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    const [, errorInterceptor] = instance.interceptors.response.use.mock.calls[0];

    const retry = errorInterceptor({
      response: { status: 403 },
      config: { url: '/mutate', method: 'post' },
    });

    await expect(retry).resolves.toEqual({ data: 'ok' });
    expect(requestMock).toHaveBeenCalledTimes(1);
  });
});
