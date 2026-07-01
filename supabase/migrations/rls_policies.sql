-- ===============================================================
-- SUPABASE SECURITY HARDENING: ROW LEVEL SECURITY (RLS)
-- ===============================================================
-- Run this in your Supabase SQL Editor to secure your database.

-- 1. CLEAN UP PREVIOUS POLICIES & FUNCTIONS TO PREVENT CONFLICTS
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Admins have full access to users" ON public.users;

DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins have full access to orders" ON public.orders;

DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins have full access to transactions" ON public.transactions;

DROP POLICY IF EXISTS "Public can view enabled services" ON public.services;
DROP POLICY IF EXISTS "Admins have full access to services" ON public.services;

DROP POLICY IF EXISTS "Public can view enabled categories" ON public.categories;
DROP POLICY IF EXISTS "Admins have full access to categories" ON public.categories;

DROP POLICY IF EXISTS "Public can view enabled coupons" ON public.coupons;
DROP POLICY IF EXISTS "Admins have full access to coupons" ON public.coupons;

DROP POLICY IF EXISTS "Public can view settings" ON public.settings;
DROP POLICY IF EXISTS "Admins have full access to settings" ON public.settings;

DROP FUNCTION IF EXISTS is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;

-- 2. ENABLE RLS ON ALL TABLES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- 3. HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_admin() 
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.users 
    WHERE id::text = auth.uid()::text AND role = 'ADMIN'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. USERS TABLE POLICIES
-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON public.users
FOR SELECT USING (auth.uid()::text = id::text);

-- Users can update their own profile (limited fields)
CREATE POLICY "Users can update own profile" ON public.users
FOR UPDATE USING (auth.uid()::text = id::text)
WITH CHECK (
  auth.uid()::text = id::text AND 
  (CASE WHEN public.is_admin() THEN TRUE ELSE (role = 'USER' AND balance = balance AND "totalSpent" = "totalSpent") END)
);

-- Admins can do everything
CREATE POLICY "Admins have full access to users" ON public.users
FOR ALL USING (public.is_admin());

-- 5. ORDERS TABLE POLICIES
-- Users can view their own orders
CREATE POLICY "Users can view own orders" ON public.orders
FOR SELECT USING (auth.uid()::text = "userId"::text);

-- Users can create their own orders
CREATE POLICY "Users can create own orders" ON public.orders
FOR INSERT WITH CHECK (auth.uid()::text = "userId"::text);

-- Admins can do everything
CREATE POLICY "Admins have full access to orders" ON public.orders
FOR ALL USING (public.is_admin());

-- 6. TRANSACTIONS TABLE POLICIES
-- Users can view their own transactions
CREATE POLICY "Users can view own transactions" ON public.transactions
FOR SELECT USING (auth.uid()::text = "userId"::text);

-- Admins can do everything
CREATE POLICY "Admins have full access to transactions" ON public.transactions
FOR ALL USING (public.is_admin());

-- 7. SERVICES & CATEGORIES (Public Read, Admin Write)
CREATE POLICY "Public can view enabled services" ON public.services
FOR SELECT USING (isEnabled = true OR public.is_admin());

CREATE POLICY "Admins have full access to services" ON public.services
FOR ALL USING (public.is_admin());

CREATE POLICY "Public can view enabled categories" ON public.categories
FOR SELECT USING (isEnabled = true OR public.is_admin());

CREATE POLICY "Admins have full access to categories" ON public.categories
FOR ALL USING (public.is_admin());

-- 8. COUPONS (Public Read, Admin Write)
CREATE POLICY "Public can view enabled coupons" ON public.coupons
FOR SELECT USING (isEnabled = true OR public.is_admin());

CREATE POLICY "Admins have full access to coupons" ON public.coupons
FOR ALL USING (public.is_admin());

-- 9. SETTINGS (Public Read, Admin Write)
CREATE POLICY "Public can view settings" ON public.settings
FOR SELECT USING (TRUE);

CREATE POLICY "Admins have full access to settings" ON public.settings
FOR ALL USING (public.is_admin());
