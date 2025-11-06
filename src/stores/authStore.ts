import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { checkSession, logout as logoutService } from '../services/auth';

interface AuthState {
  isAuthenticated: boolean;
  subjectId: string | null;
  isLoading: boolean;

  // Actions
  login: (sessionId: string, subjectId: string) => void;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // Initial state
      isAuthenticated: false,
      subjectId: null,
      isLoading: true,

      // Action: Update state after successful login
      login: (sessionId, subjectId) => {
        set({ isAuthenticated: true, subjectId, isLoading: false });
      },

      // Action: Logout and clear state
      logout: async () => {
        await logoutService();
        set({ isAuthenticated: false, subjectId: null });
      },

      // Action: Check if user has valid session on app load
      initialize: async () => {
        try {
          const result = await checkSession();
          set({
            isAuthenticated: result.authenticated,
            subjectId: result.subjectId ?? null,
            isLoading: false,
          });
        } catch {
          set({ isAuthenticated: false, subjectId: null, isLoading: false });
        }
      },
    }),
    {
      name: 'auth-storage', // localStorage key
      // Only persist these fields (not isLoading)
      partialize: ({ isAuthenticated, subjectId }) => ({ isAuthenticated, subjectId }),
    },
  ),
);

// Helper to initialize auth on app startup
export function initializeAuth() {
  return useAuthStore.getState().initialize();
}
