import { supabase } from '@/utils/supabase';
import { Session, User } from '@supabase/supabase-js';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';

/** Generic error message returned on auth failure to prevent email enumeration. */
const GENERIC_AUTH_ERROR = 'Invalid credentials. Please try again.';

export interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
}

export interface AuthContextValue extends AuthState {
  /** Whether the current user has verified their email. */
  isEmailVerified: boolean;
  /** Sign up with email and password. Returns an error message on failure. */
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Sign in with email and password. Returns an error message on failure. */
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Sign out the current user. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch the initial session on mount.
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);
    });

    // Listen for auth state changes (sign in, sign out, token refresh).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        console.error('[Auth] signUp error:', error.message, error.status);
        return { error: GENERIC_AUTH_ERROR };
      }
      return { error: null };
    },
    []
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('[Auth] signIn error:', error.message, error.status);
        return { error: GENERIC_AUTH_ERROR };
      }
      return { error: null };
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const isEmailVerified = useMemo(() => {
    if (!user) return false;
    return user.email_confirmed_at != null;
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      isEmailVerified,
      signUp,
      signIn,
      signOut,
    }),
    [user, session, isLoading, isEmailVerified, signUp, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access the auth context. Must be used within an AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
