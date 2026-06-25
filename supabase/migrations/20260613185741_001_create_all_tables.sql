/*
# Suivi 229+ - Complete Database Schema

1. New Tables (in dependency order)
- `clients`: Customer info (name, phone, city)
- `stock`: Inventory of trackers and SIM cards
- `vehicles`: Vehicles linked to clients
- `subscriptions`: Annual tracker subscriptions linked to vehicles + stock
- `invoices`: Billing documents with auto-generated unique numbers
- `invoice_lines`: Line items for each invoice
- `transactions`: Financial entries (income/expenses)

2. Security
- Single-tenant app (no auth). RLS with anon+authenticated full access.
*/

-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  city text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_full_clients" ON clients;
CREATE POLICY "anon_full_clients" ON clients FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_clients" ON clients;
CREATE POLICY "anon_insert_clients" ON clients FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_clients" ON clients;
CREATE POLICY "anon_update_clients" ON clients FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_clients" ON clients;
CREATE POLICY "anon_delete_clients" ON clients FOR DELETE TO anon, authenticated USING (true);

-- Stock (before subscriptions due to FK)
CREATE TABLE IF NOT EXISTS stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL,
  serial_number text NOT NULL,
  status text NOT NULL DEFAULT 'En Stock' CHECK (status IN ('En Stock', 'Installé', 'Défectueux')),
  installed_client_name text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_full_stock" ON stock;
CREATE POLICY "anon_full_stock" ON stock FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_stock" ON stock;
CREATE POLICY "anon_insert_stock" ON stock FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_stock" ON stock;
CREATE POLICY "anon_update_stock" ON stock FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_stock" ON stock;
CREATE POLICY "anon_delete_stock" ON stock FOR DELETE TO anon, authenticated USING (true);

-- Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  registration text NOT NULL,
  make_model text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_full_vehicles" ON vehicles;
CREATE POLICY "anon_full_vehicles" ON vehicles FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_vehicles" ON vehicles;
CREATE POLICY "anon_insert_vehicles" ON vehicles FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_vehicles" ON vehicles;
CREATE POLICY "anon_update_vehicles" ON vehicles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_vehicles" ON vehicles;
CREATE POLICY "anon_delete_vehicles" ON vehicles FOR DELETE TO anon, authenticated USING (true);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  tracker_type text NOT NULL,
  start_date date NOT NULL DEFAULT current_date,
  end_date date NOT NULL DEFAULT (current_date + interval '1 year'),
  status text NOT NULL DEFAULT 'Actif' CHECK (status IN ('Actif', 'Expiré', 'Relance')),
  annual_price numeric NOT NULL DEFAULT 0,
  tracker_id uuid REFERENCES stock(id),
  sim_id uuid REFERENCES stock(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_full_subscriptions" ON subscriptions;
CREATE POLICY "anon_full_subscriptions" ON subscriptions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_subscriptions" ON subscriptions;
CREATE POLICY "anon_insert_subscriptions" ON subscriptions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_subscriptions" ON subscriptions;
CREATE POLICY "anon_update_subscriptions" ON subscriptions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_subscriptions" ON subscriptions;
CREATE POLICY "anon_delete_subscriptions" ON subscriptions FOR DELETE TO anon, authenticated USING (true);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  invoice_date date NOT NULL DEFAULT current_date,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'En attente' CHECK (status IN ('Payée', 'En attente', 'Annulée')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_full_invoices" ON invoices;
CREATE POLICY "anon_full_invoices" ON invoices FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_invoices" ON invoices;
CREATE POLICY "anon_insert_invoices" ON invoices FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_invoices" ON invoices;
CREATE POLICY "anon_update_invoices" ON invoices FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_invoices" ON invoices;
CREATE POLICY "anon_delete_invoices" ON invoices FOR DELETE TO anon, authenticated USING (true);

-- Invoice Lines
CREATE TABLE IF NOT EXISTS invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0
);
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_full_invoice_lines" ON invoice_lines;
CREATE POLICY "anon_full_invoice_lines" ON invoice_lines FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_invoice_lines" ON invoice_lines;
CREATE POLICY "anon_insert_invoice_lines" ON invoice_lines FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_invoice_lines" ON invoice_lines;
CREATE POLICY "anon_update_invoice_lines" ON invoice_lines FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_invoice_lines" ON invoice_lines;
CREATE POLICY "anon_delete_invoice_lines" ON invoice_lines FOR DELETE TO anon, authenticated USING (true);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL CHECK (transaction_type IN ('Entrée', 'Sortie')),
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  invoice_id uuid REFERENCES invoices(id),
  transaction_date date NOT NULL DEFAULT current_date,
  category text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_full_transactions" ON transactions;
CREATE POLICY "anon_full_transactions" ON transactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
CREATE POLICY "anon_insert_transactions" ON transactions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_transactions" ON transactions;
CREATE POLICY "anon_update_transactions" ON transactions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_transactions" ON transactions;
CREATE POLICY "anon_delete_transactions" ON transactions FOR DELETE TO anon, authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_client_id ON vehicles(client_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_vehicle_id ON subscriptions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id ON invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice_id ON transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_stock_status ON stock(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);