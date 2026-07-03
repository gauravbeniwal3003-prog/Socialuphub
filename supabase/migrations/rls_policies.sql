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
DROP POLICY IF EXISTS "Users can view own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
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
  auth.uid()::text = id::text AND (
    -- If already an admin, they have full access
    public.is_admin() OR (
      -- If a normal user, they are strictly prevented from changing critical fields
      role = 'USER' AND
      isBanned = (SELECT isBanned FROM public.users WHERE id = auth.uid()) AND
      balance = (SELECT balance FROM public.users WHERE id = auth.uid()) AND
      "totalSpent" = (SELECT "totalSpent" FROM public.users WHERE id = auth.uid()) AND
      referral_balance = (SELECT referral_balance FROM public.users WHERE id = auth.uid()) AND
      total_referral_earnings = (SELECT total_referral_earnings FROM public.users WHERE id = auth.uid())
    )
  )
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

-- 10. SECURE RPC FUNCTIONS FOR ATOMIC OPERATIONS
CREATE OR REPLACE FUNCTION public.increment_balance(user_id UUID, amount NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
  new_balance NUMERIC;
BEGIN
  UPDATE public.users
  SET balance = balance + amount
  WHERE id = user_id
  RETURNING balance INTO new_balance;
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.decrement_balance(user_id UUID, amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  UPDATE public.users
  SET balance = balance - amount,
      "totalSpent" = "totalSpent" + amount
  WHERE id = user_id AND balance >= amount;
  
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  
  RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.transfer_referral_balance(user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  transfer_amount NUMERIC;
BEGIN
  SELECT referral_balance INTO transfer_amount
  FROM public.users
  WHERE id = user_id
  FOR UPDATE;

  IF transfer_amount > 0 THEN
    UPDATE public.users
    SET balance = balance + transfer_amount,
        referral_balance = 0
    WHERE id = user_id;
  END IF;

  RETURN coalesce(transfer_amount, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.add_referral_commission(referrer_id UUID, commission NUMERIC)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.users
  SET referral_balance = referral_balance + commission,
      total_referral_earnings = total_referral_earnings + commission
  WHERE id = referrer_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. SECURITY HARDENING: ADD UNIQUE CONSTRAINT TO PREVENT DOUBLE SPENDING
DO $$
BEGIN
    ALTER TABLE public.transactions ADD CONSTRAINT unique_payment_id UNIQUE ("paymentId");
EXCEPTION
    WHEN duplicate_table THEN RAISE NOTICE 'Constraint already exists';
    WHEN duplicate_object THEN RAISE NOTICE 'Constraint already exists';
    WHEN OTHERS THEN RAISE NOTICE 'Skipping constraint addition: %', SQLERRM;
END $$;

-- 12. SECURE COUPON USAGE RPC
CREATE OR REPLACE FUNCTION public.use_coupon(coupon_code TEXT, user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  coupon_record RECORD;
BEGIN
  -- Lock the row for update
  SELECT * INTO coupon_record
  FROM public.coupons
  WHERE code = coupon_code
  FOR UPDATE;

  -- Validate coupon
  IF coupon_record IS NULL OR NOT coupon_record."isEnabled" THEN
    RETURN FALSE;
  END IF;

  -- Validate expiry
  IF coupon_record."expiryDate" IS NOT NULL AND coupon_record."expiryDate" < NOW() THEN
    RETURN FALSE;
  END IF;

  -- Validate usage limit
  IF coupon_record."usageLimit" > 0 AND array_length(coupon_record."usedBy", 1) >= coupon_record."usageLimit" THEN
    RETURN FALSE;
  END IF;

  -- Validate not already used
  IF coupon_record."usedBy" @> ARRAY[user_id] THEN
    RETURN FALSE;
  END IF;

  -- Add user to usedBy
  UPDATE public.coupons
  SET "usedBy" = array_append(COALESCE("usedBy", ARRAY[]::UUID[]), user_id)
  WHERE code = coupon_code;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. REVOKE PUBLIC EXECUTION OF SENSITIVE RPCS
REVOKE ALL ON FUNCTION public.increment_balance(UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_balance(UUID, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.increment_balance(UUID, NUMERIC) FROM authenticated;
-- Only service_role can execute
GRANT EXECUTE ON FUNCTION public.increment_balance(UUID, NUMERIC) TO service_role;

REVOKE ALL ON FUNCTION public.decrement_balance(UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_balance(UUID, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.decrement_balance(UUID, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_balance(UUID, NUMERIC) TO service_role;

REVOKE ALL ON FUNCTION public.add_referral_commission(UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_referral_commission(UUID, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.add_referral_commission(UUID, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_referral_commission(UUID, NUMERIC) TO service_role;

REVOKE ALL ON FUNCTION public.transfer_referral_balance(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_referral_balance(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.transfer_referral_balance(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_referral_balance(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.use_coupon(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.use_coupon(TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.use_coupon(TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.use_coupon(TEXT, UUID) TO service_role;
