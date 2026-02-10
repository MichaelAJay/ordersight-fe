import { useSyncExternalStore } from 'react';
import { getAuthRecoveryRequired, subscribeAuthRecovery } from '@/services/authRecovery';

export function useAuthRecoveryRequired() {
  return useSyncExternalStore(
    subscribeAuthRecovery,
    getAuthRecoveryRequired,
    getAuthRecoveryRequired,
  );
}
