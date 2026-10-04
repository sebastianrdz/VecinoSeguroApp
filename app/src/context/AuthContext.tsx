import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { TABLES, type Profile } from '../types/database';

interface SignUpParams {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}

interface AuthContextValue {
  /** null while the initial session restore is in flight. */
  session: Session | null;
  profile: Profile | null;
  /** True only during the initial bootstrap (session + first profile fetch). */
  initializing: boolean;
  /** True while a profile refetch is in flight after bootstrap. */
  refreshingProfile: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (params: SignUpParams) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [refreshingProfile, setRefreshingProfile] = useState(false);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from(TABLES.profiles)
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      // A missing profile row (e.g. still being created by a DB trigger) is
      // not fatal — surface null and let the caller retry.
      setProfile(null);
      return;
    }
    setProfile(data as Profile);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user.id) return;
    setRefreshingProfile(true);
    try {
      await fetchProfile(session.user.id);
    } finally {
      setRefreshingProfile(false);
    }
  }, [session?.user.id, fetchProfile]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user.id) {
        await fetchProfile(data.session.user.id);
      }
      setInitializing(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mounted) return;
        setSession(newSession);
        if (newSession?.user.id) {
          await fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async ({ fullName, email, password, phone }: SignUpParams) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone: phone ?? null },
      },
    });
    if (error) {
      return { error: error.message };
    }
    // If a DB trigger creates the profiles row from auth metadata, make sure
    // full_name/phone land there even when the trigger only copies `id`.
    if (data.user?.id) {
      await supabase
        .from(TABLES.profiles)
        .update({ full_name: fullName, phone: phone ?? null })
        .eq('id', data.user.id);
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      initializing,
      refreshingProfile,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [session, profile, initializing, refreshingProfile, signIn, signUp, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
