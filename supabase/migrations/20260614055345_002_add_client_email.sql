/*
# Add email column to clients table

1. Modified Tables
- `clients`: Add `email` column (text, nullable)

2. Notes
- Email will be used for automatic invoice sending.
- Column is nullable for backward compatibility with existing rows.
*/

ALTER TABLE clients ADD COLUMN IF NOT EXISTS email text;

CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
