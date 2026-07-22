-- Traçabilité : qui a créé le client et qui a réalisé l'installation
-- À exécuter dans le SQL Editor du Dashboard Supabase

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS created_by text;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS installed_by text;
