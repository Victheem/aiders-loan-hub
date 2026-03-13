import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

type AppRole = 'super_admin' | 'loan_officer' | 'staff';

interface AppUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  officerId?: string; // loan_officers.id if role is loan_officer
}

interface AuthContextType {
  user: AppUser | null;
  session: Session | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function fetchAppUser(supaUser: SupabaseUser): Promise<AppUser | null> {
  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', supaUser.id)
    .single();

  // Fetch role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', supaUser.id)
    .single();

  // Fetch officer id if loan_officer
  let officerId: string | undefined;
  if (roleData?.role === 'loan_officer') {
    const { data: officer } = await supabase
      .from('loan_officers')
      .select('id')
      .eq('user_id', supaUser.id)
      .single();
    officerId = officer?.id;
  }

  return {
    id: supaUser.id,
    name: profile?.name || supaUser.email || '',
    email: profile?.email || supaUser.email || '',
    role: (roleData?.role as AppRole) || 'staff',
    officerId,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sess) => {
      setSession(sess);
      if (sess?.user) {
        // Use setTimeout to avoid Supabase deadlock
        setTimeout(async () => {
          const appUser = await fetchAppUser(sess.user);
          setUser(appUser);
          setLoading(false);
        }, 0);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      if (sess?.user) {
        fetchAppUser(sess.user).then(appUser => {
          setUser(appUser);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };

    // Log audit
    await supabase.from('audit_logs').insert({
      action: 'Logged in',
      user_name: email,
    });

    return { success: true };
  };

  const signup = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { name },
      },
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, login, signup, logout, isAuthenticated: !!user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
