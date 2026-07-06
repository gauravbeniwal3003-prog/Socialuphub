-- 🚨 EMERGENCY SECURITY FIX: RLS ENABLING AND POLICIES 🚨
-- Run this entire script in your Supabase SQL Editor

-- 1. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to start fresh (if any exist)
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can read own data" ON public.users;
    DROP POLICY IF EXISTS "Users can read own orders" ON public.orders;
    DROP POLICY IF EXISTS "Users can read own transactions" ON public.transactions;
    DROP POLICY IF EXISTS "Public read categories" ON public.categories;
    DROP POLICY IF EXISTS "Public read services" ON public.services;
    DROP POLICY IF EXISTS "Public read settings" ON public.settings;
    DROP POLICY IF EXISTS "Admin full access users" ON public.users;
    DROP POLICY IF EXISTS "Admin full access orders" ON public.orders;
    DROP POLICY IF EXISTS "Admin full access transactions" ON public.transactions;
    DROP POLICY IF EXISTS "Admin full access coupons" ON public.coupons;
    DROP POLICY IF EXISTS "Admin full access categories" ON public.categories;
    DROP POLICY IF EXISTS "Admin full access services" ON public.services;
    DROP POLICY IF EXISTS "Admin full access settings" ON public.settings;
EXCEPTION WHEN others THEN END $$;

-- 3. Create Strict Policies for Normal Users
-- NOTE: We cast both sides to text (::text) to prevent UUID vs TEXT type mismatch errors.

-- USERS TABLE: Users can only see their OWN basic data.
CREATE POLICY "Users can read own data" ON public.users FOR SELECT USING (auth.uid()::text = id::text);

-- ORDERS & TRANSACTIONS: Users can only see their own history
CREATE POLICY "Users can read own orders" ON public.orders FOR SELECT USING (auth.uid()::text = "userId"::text);
CREATE POLICY "Users can read own transactions" ON public.transactions FOR SELECT USING (auth.uid()::text = "userId"::text);

-- PUBLIC DATA: Everyone can read services and categories
CREATE POLICY "Public read categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Public read services" ON public.services FOR SELECT USING (true);
CREATE POLICY "Public read settings" ON public.settings FOR SELECT USING (true);

-- 4. Create Master Admin Function & Bypass
-- This securely identifies the master admin by checking the tamper-proof JWT token
CREATE OR REPLACE FUNCTION public.is_master_admin() RETURNS boolean AS $$
BEGIN
  RETURN auth.jwt() ->> 'email' = 'gauravbeniwal3003@gmail.com';
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant Master Admin full access to everything
CREATE POLICY "Admin full access users" ON public.users FOR ALL USING (public.is_master_admin());
CREATE POLICY "Admin full access orders" ON public.orders FOR ALL USING (public.is_master_admin());
CREATE POLICY "Admin full access transactions" ON public.transactions FOR ALL USING (public.is_master_admin());
CREATE POLICY "Admin full access coupons" ON public.coupons FOR ALL USING (public.is_master_admin());
CREATE POLICY "Admin full access categories" ON public.categories FOR ALL USING (public.is_master_admin());
CREATE POLICY "Admin full access services" ON public.services FOR ALL USING (public.is_master_admin());
CREATE POLICY "Admin full access settings" ON public.settings FOR ALL USING (public.is_master_admin());

-- 5. CLEAN UP SUSPICIOUS DATABASE TRIGGERS
-- Drop any triggers on public.users that might lock down roles or restrict fields
DO $$
DECLARE
    trig RECORD;
BEGIN
    FOR trig IN 
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_schema = 'public' 
          AND event_object_table = 'users'
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(trig.trigger_name) || ' ON public.users;';
    END LOOP;
END $$;

-- 6. RESTORE REAL OWNER ACCESS IN DATABASE
-- Change the email of the real owner back to their original email and force role to ADMIN
UPDATE public.users 
SET email = 'gauravbeniwal3003@gmail.com', 
    role = 'ADMIN',
    name = 'Gaurav'
WHERE id = 'b1ca7f01-02f7-471d-88c4-f2c58b101b3e';

-- Ensure the hacker account is demoted and banned
UPDATE public.users
SET email = 'gauravbeniwal30003_banned@gmail.com',
    role = 'USER',
    isBanned = true,
    "banReason" = 'Hacker Account / Typo Squatted Admin'
WHERE id = 'd4606f17-ce0b-4035-8b42-58f251f137c8';

