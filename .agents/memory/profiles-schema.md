---
name: Schéma profiles et pièges connus
description: Colonnes réelles de la table profiles + leçons apprises sur les erreurs silencieuses Supabase
---

# Table profiles — colonnes réelles

`id`, `role`, `full_name`, `created_at`, `is_active`, `email`

**`updated_at` n'existe PAS** dans la table. Ne pas l'inclure dans un SELECT.

**Why:** Supabase/PostgREST retourne `data: null` (sans lever d'exception JS) quand une colonne sélectionnée n'existe pas → la liste affiche 0 éléments sans message d'erreur visible.

**How to apply:** Toujours destructurer `{ data, error }` et logger `error` dans loadMembers / toute query critique, afin de détecter ce type d'échec silencieux immédiatement.

# RLS profiles

- SELECT : `FOR SELECT TO authenticated USING (true)` — tout utilisateur authentifié peut lire tous les profils.
- INSERT/UPDATE : limité à son propre `id`.
- La service_role bypasse tout (utilisée dans server.js).

# Trigger handle_new_user

Crée automatiquement un profil `Technicien` à chaque inscription via `auth.users`. L'admin owner (gbeffansylvain@gmail.com) n'a pas forcément de profil si créé avant le trigger — l'endpoint `/api/ensure-profile` le crée à la volée.
