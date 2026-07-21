---
name: Supabase signUp session hijack
description: supabase.auth.signUp() from an authenticated client replaces the current session; fix is a separate isolated client.
---

## Rule
Never call `supabase.auth.signUp()` on the shared Supabase client when an admin is logged in. It auto-logs in the new user and replaces the admin's session, causing `onAuthStateChange` race conditions that sign the admin out.

**Why:** The shared client persists its session to localStorage. `signUp` writes the new user's tokens there, evicting the admin's tokens. Attempts to restore with `setSession` or `signOut`+`setSession` fail due to AuthContext race conditions.

**How to apply:** Create a throw-away Supabase client with `persistSession: false` specifically for the `signUp` call:

```typescript
const supabaseSignup = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const { data, error } = await supabaseSignup.auth.signUp({ email, password, options });
// Main supabase client session is untouched; upsert/queries run as admin normally.
```
