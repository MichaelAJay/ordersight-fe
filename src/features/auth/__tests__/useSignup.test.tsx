import { ReactNode } from 'react';
import { describe, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as api from '../api';
import { useSignup } from '../useSignup';
import { makeSignupPayload, makeSignupSuccessResponse } from '@/test/fixtures/auth';

describe('useSignup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('success', () => {
    test('calls signup api and resolves data', async () => {
      const payload = makeSignupPayload();

      const apiMock = vi.spyOn(api, 'signup').mockResolvedValue(makeSignupSuccessResponse());

      const queryClient = new QueryClient();
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useSignup(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync(payload);
      });

      expect(apiMock).toHaveBeenCalledWith(payload);
    });
  });

  describe('error states', () => {
    test('exposes error when API rejects', async () => {
      const payload = makeSignupPayload();
      const rejection = new Error('Account creation failed');
      vi.spyOn(api, 'signup').mockRejectedValueOnce(rejection);

      const client = new QueryClient();
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useSignup(), { wrapper });

      await expect(act(() => result.current.mutateAsync(payload))).rejects.toThrow(rejection);

      expect(result.current.error).toBe(rejection);
      expect(result.current.isError).toBe(true);
    });
  });
});
