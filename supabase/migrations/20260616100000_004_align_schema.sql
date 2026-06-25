/*
# Suivi 229+ - Schema alignment

Drops the old tables (old column names) and recreates everything
to match the application code exactly.
Run this once in Supabase SQL Editor.

IMPORTANT: This will delete any existing data in clients, stock, subscriptions.
Only run if you have no real data yet, or back up first.
*/

-- 1. Drop old tables (order matters for FK constraints)
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.stock CASCADE;

-- 2. Recreate clients (uuid, name/phone/email/city)
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  city text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_all" ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Create vehicles (linked to clients)
CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  registration text NOT NULL,
  make_model text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicles_all" ON public.vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Recreate stock (uuid, item_type/serial_number/status/installed_client_name)
CREATE TABLE public.stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL,
  serial_number text NOT NULL,
  status text NOT NULL DEFAULT 'En Stock' CHECK (status IN ('En Stock', 'Installé', 'Défectueux')),
  installed_client_name text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_all" ON public.stock FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Recreate subscriptions (linked to vehicles + stock)
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  tracker_type text NOT NULL,
  start_date date NOT NULL DEFAULT current_date,
  end_date date NOT NULL DEFAULT (current_date + interval '1 year'),
  status text NOT NULL DEFAULT 'Actif' CHECK (status IN ('Actif', 'Expiré', 'Relance')),
  annual_price numeric NOT NULL DEFAULT 0,
  tracker_id uuid REFERENCES public.stock(id),
  sim_id uuid REFERENCES public.stock(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_all" ON public.subscriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Create invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  invoice_date date NOT NULL DEFAULT current_date,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'En attente' CHECK (status IN ('Payée', 'En attente', 'Annulée')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_all" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. Create invoice_lines
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0
);
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_lines_all" ON public.invoice_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. Create transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL CHECK (transaction_type IN ('Entrée', 'Sortie')),
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  invoice_id uuid REFERENCES public.invoices(id),
  transaction_date date NOT NULL DEFAULT current_date,
  category text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions_all" ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. Update profiles: change default role to Admin (more practical for single-tenant app)
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'Admin';

-- 10. Useful indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_client_id ON public.vehicles(client_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_vehicle_id ON public.subscriptions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON public.subscriptions(end_date);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id ON public.invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice_id ON public.transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_stock_status ON public.stock(status);
