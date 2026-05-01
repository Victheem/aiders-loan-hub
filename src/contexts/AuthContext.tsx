import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";

type AppRole = "super_admin" | "loan_officer" | "staff";

interface AppUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  officerId?: string;
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

// ✅ SAFE USER FETCHER
async function fetchAppUser(supaUser: SupabaseUser): Promise<AppUser | null> {
  try {
    const [{ data: profile }, { data: roleData }] = await Promise.all([
      supabase.from("profiles").select("name, email").eq("id", supaUser.id).single(),
      supabase.from("user_roles").select("role").eq("user_id", supaUser.id).single(),
    ]);

    let officerId: string | undefined;

    if (roleData?.role === "loan_officer") {
      const { data: officer } = await supabase
        .from("loan_officers")
        .select("id")
        .eq("user_id", supaUser.id)
        .single();

      officerId = officer?.id;
    }

    return {
      id: supaUser.id,
      name: profile?.name || supaUser.email || "",
      email: profile?.email || supaUser.email || "",
      role: (roleData?.role as AppRole) || "staff",
      officerId,
    };
  } catch (err) {
    console.error("fetchAppUser error:", err);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // ✅ INITIAL SESSION LOAD (CRITICAL)
    const init = async () => {
      const { data } = await supabase.auth.getSession();

      if (!isMounted) return;

      setSession(data.session);

      if (data.session?.user) {
        const appUser = await fetchAppUser(data.session.user);
        if (isMounted) setUser(appUser);
      }

      setLoading(false);
    };

    init();

    // ✅ AUTH LISTENER (NO async directly)
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, sess) => {
        setSession(sess);

        if (sess?.user) {
          fetchAppUser(sess.user).then((appUser) => {
            if (isMounted) setUser(appUser);
          });
        } else {
          setUser(null);
        }
      }
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // ✅ LOGIN
  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) return { success: false, error: error.message };

    await supabase.from("audit_logs").insert({
      action: "Logged in",
      user_name: email,
    });

    return { success: true };
  };

  // ✅ SIGNUP
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

  // ✅ LOGOUT (FIXED)
  const logout = async () => {
    await supabase.auth.signOut();

    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        login,
        signup,
        logout,
        isAuthenticated: !!user,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ✅ HOOK
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}