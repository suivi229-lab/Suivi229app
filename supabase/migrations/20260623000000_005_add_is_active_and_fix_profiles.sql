-- Migration 005: Add is_active to profiles + disable email confirmation requirement
-- Run this in your Supabase SQL Editor

-- 1. Add is_active column (safe if already exists)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Make sure all existing profiles are active
UPDATE public.profiles SET is_active = true WHERE is_active IS NULL;

-- 3. Add email column if missing
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

-- 4. Create or replace the trigger that auto-creates a profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, email, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'Technicien',
    NEW.email,
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 5. Attach trigger to auth.users if not already present
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. IMPORTANT: Disable email confirmation so users can log in immediately
--    Run this in Supabase Dashboard > Authentication > Settings:
--    "Enable email confirmations" → OFF
--    OR execute via SQL (requires superuser / service role):
-- UPDATE auth.config SET email_confirmations_required = false;

-- 7. Confirm the owner account manually if it exists
--    (replaces needing to click a confirmation email)
UPDATE auth.users
  SET email_confirmed_at = NOW(),
      confirmed_at       = NOW()
WHERE email = 'gbeffansylvain@gmail.com'
  AND email_confirmed_at IS NULL;
