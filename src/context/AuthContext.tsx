import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type UserRole = 'Admin' | 'Technicien' | 'Observateur' | 'Investisseur';

// ─────────────────────────────────────────────────────────
// BYPASS_AUTH — mettre à `false` pour réactiver la sécurité
const BYPASS_AUTH = false;
// ─────────────────────────────────────────────────────────

const OWNER_EMAIL = 'gbeffansylvain@gmail.com';
const PROFILE_FETCH_TIMEOUT_MS = 8000;

interface Profile {
  id: string;
  role: UserRole;
  full_name?: string | null;
  email?: string | null;
  is_active?: boolean | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  isPasswordRecovery: boolean;
  isDeactivated: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null; code?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
  canAccess: (page: string) => boolean;
  isReadOnly: boolean;
}

const PAGE_PERMISSIONS: Record<UserRole, string[]> = {
  Admin: ['dashboard', 'crm', 'stock', 'billing', 'installation', 'team', 'ai'],
  Technicien: ['dashboard', 'crm', 'stock', 'installation'],
  Observateur: ['dashboard'],
  Investisseur: ['dashboard', 'ai'],
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  role: null,
  loading: true,
  isPasswordRecovery: false,
  isDeactivated: false,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
  resetPassword: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  resendConfirmation: async () => ({ error: null }),
  canAccess: () => false,
  isReadOnly: true,
});

const BYPASS_PROFILE: Profile = {
  id: '3e12e6c4-9563-4449-a949-0501ee77bd42',
  role: 'Admin',
  full_name: 'BOUKOUMI AKOFE SYLVAIN GBEFFAN',
  is_active: true,
};

const BYPASS_USER = {
  id: '3e12e6c4-9563-4449-a949-0501ee77bd42',
  email: OWNER_EMAIL,
  app_metadata: {},
  user_metadata: { full_name: 'BOUKOUMI AKOFE SYLVAIN GBEFFAN' },
  aud: 'authenticated',
  created_at: '',
} as unknown as User;

const BYPASS_SESSION = { user: BYPASS_USER } as unknown as Session;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [isDeactivated, setIsDeactivated] = useState(false);

  // Guard against calling signOut inside fetchProfile (avoids re-entrant onAuthStateChange)
  const pendingSignOut = useRef(false);

  // ── BYPASS MODE ──────────────────────────────────────────
  // Quand BYPASS_AUTH = true, on simule un Admin connecté
  // sans passer par Supabase. Mettre BYPASS_AUTH = false
  // pour réactiver la sécurité complète.
  if (BYPASS_AUTH) {
    const canAccessBypass = (page: string) =>
      PAGE_PERMISSIONS['Admin'].includes(page);

    return (
      <AuthContext.Provider value={{
        session: BYPASS_SESSION,
        user: BYPASS_USER,
        profile: BYPASS_PROFILE,
        role: 'Admin',
        loading: false,
        isPasswordRecovery: false,
        isDeactivated: false,
        signIn: async () => ({ error: null }),
        signOut: async () => {},
        resetPassword: async () => ({ error: null }),
        updatePassword: async () => ({ error: null }),
        resendConfirmation: async () => ({ error: null }),
        canAccess: canAccessBypass,
        isReadOnly: false,
      }}>
        {children}
      </AuthContext.Provider>
    );
  }
  // ── FIN BYPASS ───────────────────────────────────────────

  // Returns true if the caller should sign the user out.
  async function fetchProfile(userId: string, userEmail?: string): Promise<boolean> {
    const isOwner = userEmail?.toLowerCase() === OWNER_EMAIL.toLowerCase();

    // Fallback profile is ONLY granted to the known owner email.
    // Any other user without a valid DB profile is denied access (signed out).
    const ownerFallback: Profile = {
      id: userId,
      role: 'Admin',
      full_name: 'Sylvain',
      is_active: true,
    };

    // Race the DB query against a timeout so it can never hang forever
    const queryPromise = supabase
      .from('profiles')
      .select('id, role, full_name, email, is_active')
      .eq('id', userId)
      .single();

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), PROFILE_FETCH_TIMEOUT_MS)
    );

    try {
      const result = await Promise.race([queryPromise, timeoutPromise]);

      if (result === null) {
        // Timeout
        if (isOwner) {
          console.warn('[AuthContext] fetchProfile timed out — owner fallback applied');
          setIsDeactivated(false);
          setProfile(ownerFallback);
          return false;
        }
        // Non-owner with no confirmed profile → deny access
        console.warn('[AuthContext] fetchProfile timed out — non-owner, signing out');
        setIsDeactivated(true);
        setProfile(null);
        return true;
      }

      const { data, error } = result;

      if (data) {
        console.log('[AuthContext] fetchProfile success:', data);
        if (data.is_active === false) {
          console.warn('[AuthContext] Account is deactivated:', userId);
          setIsDeactivated(true);
          setProfile(null);
          return true; // caller will sign out
        }
        setIsDeactivated(false);
        setProfile(data);
        return false;
      }

      if (error) {
        // No profile row found or DB error
        if (isOwner) {
          console.warn('[AuthContext] fetchProfile DB error — owner fallback applied:', error.code);
          setIsDeactivated(false);
          setProfile(ownerFallback);
          return false;
        }
        // Non-owner without a profile row → deny access
        console.warn('[AuthContext] fetchProfile DB error — non-owner, signing out:', error.code);
        setIsDeactivated(true);
        setProfile(null);
        return true;
      }

      // Unexpected: no data and no error
      if (isOwner) {
        setIsDeactivated(false);
        setProfile(ownerFallback);
        return false;
      }
      setIsDeactivated(true);
      setProfile(null);
      return true;
    } catch (err) {
      console.error('[AuthContext] fetchProfile exception:', err);
      if (isOwner) {
        setIsDeactivated(false);
        setProfile(ownerFallback);
        return false;
      }
      setIsDeactivated(true);
      setProfile(null);
      return true;
    }
  }

  useEffect(() => {
    console.log('[AuthContext] Initializing — getSession()');

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        console.log('[AuthContext] getSession result — session:', session ? 'found' : 'null');
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id, session.user.email)
            .then((deactivated) => {
              if (deactivated && !pendingSignOut.current) {
                pendingSignOut.current = true;
                supabase.auth.signOut().finally(() => { pendingSignOut.current = false; });
              }
            })
            .finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('[AuthContext] getSession error:', err);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthContext] onAuthStateChange — event:', event, '| session:', session ? 'present' : 'null');

      if (pendingSignOut.current) {
        console.log('[AuthContext] Skipping event during pendingSignOut:', event);
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        setIsDeactivated(false);
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        return;
      }

      if (event === 'USER_UPDATED') {
        setIsPasswordRecovery(false);
      }

      // Always sync session/user immediately so App.tsx can navigate
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        console.log('[AuthContext] User signed in:', session.user.email, '— fetching profile');
        fetchProfile(session.user.id, session.user.email)
          .then((deactivated) => {
            if (deactivated && !pendingSignOut.current) {
              pendingSignOut.current = true;
              supabase.auth.signOut().finally(() => { pendingSignOut.current = false; });
            }
          })
          .finally(() => setLoading(false));
      } else {
        console.log('[AuthContext] Session cleared (SIGNED_OUT or token expired)');
        setProfile(null);
        setIsPasswordRecovery(false);
        if (!pendingSignOut.current) {
          setIsDeactivated(false);
        }
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Déconnexion temps réel si le compte est désactivé ────────────────────
  // Souscription Realtime filtrée sur le profil de l'utilisateur courant.
  // Dès qu'un admin passe is_active = false, la session est fermée côté client
  // sans attendre un rechargement de page.
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`profile-active:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as { is_active?: boolean };
          console.log('[AuthContext] Realtime profile UPDATE:', updated);
          if (updated.is_active === false && !pendingSignOut.current) {
            console.log('[AuthContext] Account deactivated remotely — signing out');
            pendingSignOut.current = true;
            setIsDeactivated(true);
            supabase.auth.signOut().finally(() => { pendingSignOut.current = false; });
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  async function signIn(email: string, password: string) {
    console.log('[Auth] signIn attempt for:', email);
    setIsDeactivated(false);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        console.error('[Auth] signInWithPassword error:', error.message, '| code:', error.code);
        return { error: error.message, code: error.code ?? error.message };
      }
      console.log('[Auth] signInWithPassword success — user:', data.user?.email);
      return { error: null };
    } catch (err) {
      console.error('[Auth] signInWithPassword exception:', err);
      return { error: 'Erreur réseau. Vérifiez votre connexion.', code: 'network_error' };
    }
  }

  async function signOut() {
    setIsDeactivated(false);
    await supabase.auth.signOut();
  }

  async function resetPassword(email: string) {
    const trimmed = email.trim();
    try {
      // Try first WITH redirectTo (requires the URL to be whitelisted in Supabase)
      const { error: err1 } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/`,
      });
      if (!err1) return { error: null };

      console.warn('[Auth] resetPassword with redirectTo failed:', err1.message, '— retrying without redirectTo');

      // Fallback: send without redirectTo (always works even if URL not whitelisted)
      const { error: err2 } = await supabase.auth.resetPasswordForEmail(trimmed);
      if (err2) {
        console.error('[Auth] resetPassword fallback also failed:', err2.message);
        return { error: err2.message };
      }
      return { error: null };
    } catch (err) {
      console.error('[Auth] resetPassword exception:', err);
      return { error: 'Erreur réseau. Vérifiez votre connexion.' };
    }
  }

  async function updatePassword(newPassword: string) {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { error: error.message };
      setIsPasswordRecovery(false);
      return { error: null };
    } catch {
      return { error: 'Erreur réseau.' };
    }
  }

  async function resendConfirmation(email: string) {
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
      if (error) return { error: error.message };
      return { error: null };
    } catch {
      return { error: 'Erreur réseau.' };
    }
  }

  const role = profile?.role ?? null;
  const isReadOnly = role === 'Observateur' || role === 'Investisseur';

  function canAccess(page: string): boolean {
    if (!role) return false;
    return PAGE_PERMISSIONS[role]?.includes(page) ?? false;
  }

  return (
    <AuthContext.Provider value={{
      session, user, profile, role, loading,
      isPasswordRecovery, isDeactivated,
      signIn, signOut, resetPassword, updatePassword, resendConfirmation,
      canAccess, isReadOnly,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
