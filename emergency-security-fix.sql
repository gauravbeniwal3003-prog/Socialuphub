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
  RETURN auth.jwt() ->> 'email' = 'gauravbeniwal30003@gmail.com';
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
