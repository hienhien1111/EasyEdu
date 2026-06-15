import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserRole = "ADMIN" | "TEACHER" | "STUDENT";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  fullName?: string;
  avatarUrl?: string;
}

interface AuthState {
  user: AuthUser | null;
  hasHydrated: boolean;
  /** Store user info after successful login (token is in httpOnly cookie, not JS-accessible) */
  setAuth: (user: AuthUser) => void;
  /** Clear user state (backend handles cookie clearing via /auth/logout) */
  clearAuth: () => void;
  isAuthenticated: () => boolean;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      hasHydrated: false,
      setAuth: (user) => set({ user }),
      clearAuth: () => set({ user: null }),
      isAuthenticated: () => !!get().user,
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "easyedu-auth",
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
