import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isPremium: boolean;
  subscriptionEnd: string | null;
  hasLifetimeTranslator: boolean;
  translatorUsesRemaining: number | null;
  translatorUsesLimit: number;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  checkSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isAdmin: false,
    isPremium: false,
    subscriptionEnd: null,
    hasLifetimeTranslator: false,
    translatorUsesRemaining: null,
    translatorUsesLimit: 11,
    loading: true,
  });

  const checkSubscription = useCallback(async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.warn("No valid session for subscription check");
        setState((prev) => ({
          ...prev,
          user: null,
          session: null,
          isAdmin: false,
          isPremium: false,
          subscriptionEnd: null,
          hasLifetimeTranslator: false,
          translatorUsesRemaining: null,
          loading: false,
        }));
        return;
      }

      const { data: hasAdminRole, error: roleError } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "admin",
      });
      if (roleError) console.error("Admin role check error:", roleError);
      const adminRole = Boolean(hasAdminRole);

      const { data, error } = await supabase.functions.invoke("check-subscription", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) {
        console.error("Subscription check error:", error);
        setState((prev) => ({
          ...prev,
          user: session.user,
          session,
          isAdmin: adminRole,
          isPremium: adminRole,
          subscriptionEnd: null,
          loading: false,
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        user: session.user,
        session,
        isPremium: data?.subscribed || data?.isAdmin || adminRole || false,
        isAdmin: data?.isAdmin || adminRole || false,
        subscriptionEnd: data?.subscription_end || null,
        hasLifetimeTranslator: Boolean(data?.hasLifetimeTranslator),
        translatorUsesRemaining: typeof data?.translatorUsesRemaining === "number"
          ? data.translatorUsesRemaining
          : null,
        translatorUsesLimit: typeof data?.translatorUsesLimit === "number"
          ? data.translatorUsesLimit
          : 11,
        loading: false,
      }));
    } catch (err) {
      console.error("Failed to check subscription:", err);
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setState((prev) => ({
            ...prev,
            user: session.user,
            session,
            loading: true,
          }));
          setTimeout(() => void checkSubscription(), 0);
        } else {
          setState((prev) => ({
            ...prev,
            user: null,
            session: null,
            isAdmin: false,
            isPremium: false,
            subscriptionEnd: null,
            hasLifetimeTranslator: false,
            translatorUsesRemaining: null,
            loading: false,
          }));
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setState((prev) => ({ ...prev, user: session.user, session, loading: true }));
        void checkSubscription();
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    });

    // Refresh subscription every 60s
    const interval = setInterval(() => {
      void checkSubscription();
    }, 60000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [checkSubscription]);

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ ...state, signUp, signIn, signOut, checkSubscription }}>
      {children}
    </AuthContext.Provider>
  );
};
