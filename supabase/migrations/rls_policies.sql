-- ===============================================================
-- SUPABASE SECURITY HARDENING: ROW LEVEL SECURITY (RLS)
-- ===============================================================
-- Run this in your Supabase SQL Editor to secure your database.

-- 1. ENSURE THE settings TABLE AND COLUMNS EXIST (Idempotent schema upgrade)
DO $$
BEGIN
    -- Create settings table if not exists
    CREATE TABLE IF NOT EXISTS public.settings (
        id TEXT PRIMARY KEY DEFAULT 'global',
        "globalMarginPercent" NUMERIC DEFAULT 20,
        "globalMarginFixed" NUMERIC DEFAULT 0,
        "maintenanceMode" BOOLEAN DEFAULT false,
        "themeBg" TEXT,
        "themeDarkBg" TEXT,
        "themeAccent" TEXT,
        "referralSignupBonus" NUMERIC DEFAULT 1.0,
        "referralDepositBonus" NUMERIC DEFAULT 5.0,
        "referralMinDeposit" NUMERIC DEFAULT 10.0,
        "isReferralSystemEnabled" BOOLEAN DEFAULT true
    );

    -- Ensure Render Backend URL & Landing Video URL columns exist with exact casing
    ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "renderBackendUrl" TEXT DEFAULT '';
    ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "landingVideoUrl" TEXT DEFAULT 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    
    -- Ensure other config columns exist
    ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "globalMarginPercent" NUMERIC DEFAULT 20;
    ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "globalMarginFixed" NUMERIC DEFAULT 0;
    ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "maintenanceMode" BOOLEAN DEFAULT false;
    ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "themeBg" TEXT;
    ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "themeDarkBg" TEXT;
    ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "themeAccent" TEXT;
    ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "referralSignupBonus" NUMERIC DEFAULT 1.0;
    ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "referralDepositBonus" NUMERIC DEFAULT 5.0;
    ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "referralMinDeposit" NUMERIC DEFAULT 10.0;
    ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "isReferralSystemEnabled" BOOLEAN DEFAULT true;

    -- Seed the default global settings row if not present
    INSERT INTO public.settings (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;
EXCEPTION
    WHEN OTHERS THEN 
        RAISE NOTICE 'Skipping setting column addition: %', SQLERRM;
END $$;

-- 2. CLEAN UP PREVIOUS POLICIES & FUNCTIONS TO PREVENT CONFLICTS
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

-- 3. ENABLE RLS ON ALL TABLES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- 4. HELPER FUNCTIONS
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

-- 5. USERS TABLE POLICIES
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

-- 6. ORDERS TABLE POLICIES
-- Users can view their own orders
CREATE POLICY "Users can view own orders" ON public.orders
FOR SELECT USING (auth.uid()::text = "userId"::text);

-- Users can create their own orders
CREATE POLICY "Users can create own orders" ON public.orders
FOR INSERT WITH CHECK (auth.uid()::text = "userId"::text);

-- Admins can do everything
CREATE POLICY "Admins have full access to orders" ON public.orders
FOR ALL USING (public.is_admin());

-- 7. TRANSACTIONS TABLE POLICIES
-- Users can view their own transactions
CREATE POLICY "Users can view own transactions" ON public.transactions
FOR SELECT USING (auth.uid()::text = "userId"::text);

-- Admins can do everything
CREATE POLICY "Admins have full access to transactions" ON public.transactions
FOR ALL USING (public.is_admin());

-- 8. SERVICES & CATEGORIES (Public Read, Admin Write)
CREATE POLICY "Public can view enabled services" ON public.services
FOR SELECT USING (isEnabled = true OR public.is_admin());

CREATE POLICY "Admins have full access to services" ON public.services
FOR ALL USING (public.is_admin());

CREATE POLICY "Public can view enabled categories" ON public.categories
FOR SELECT USING (isEnabled = true OR public.is_admin());

CREATE POLICY "Admins have full access to categories" ON public.categories
FOR ALL USING (public.is_admin());

-- 9. COUPONS (Public Read, Admin Write)
CREATE POLICY "Public can view enabled coupons" ON public.coupons
FOR SELECT USING (isEnabled = true OR public.is_admin());

CREATE POLICY "Admins have full access to coupons" ON public.coupons
FOR ALL USING (public.is_admin());

-- 10. SETTINGS (Public Read, Admin Write)
CREATE POLICY "Public can view settings" ON public.settings
FOR SELECT USING (TRUE);

CREATE POLICY "Admins have full access to settings" ON public.settings
FOR ALL USING (public.is_admin());
