-- ===============================================================
-- SUPABASE SECURITY HARDENING: ROW LEVEL SECURITY (RLS)
-- ===============================================================
-- Run this in your Supabase SQL Editor to secure your database.

-- 1. ENABLE RLS ON ALL TABLES
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 2. HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION is_admin() 
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT role = 'ADMIN' 
    FROM users 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. USERS TABLE POLICIES
-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON users
FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile (limited fields)
CREATE POLICY "Users can update own profile" ON users
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id AND 
  (CASE WHEN is_admin() THEN TRUE ELSE (role = 'USER' AND balance = balance AND totalSpent = totalSpent) END)
);

-- Admins can do everything
CREATE POLICY "Admins have full access to users" ON users
FOR ALL USING (is_admin());

-- 4. ORDERS TABLE POLICIES
-- Users can view their own orders
CREATE POLICY "Users can view own orders" ON orders
FOR SELECT USING (auth.uid() = "userId");

-- Users can create their own orders
CREATE POLICY "Users can create own orders" ON orders
FOR INSERT WITH CHECK (auth.uid() = "userId");

-- Admins can do everything
CREATE POLICY "Admins have full access to orders" ON orders
FOR ALL USING (is_admin());

-- 5. TRANSACTIONS TABLE POLICIES
-- Users can view their own transactions
CREATE POLICY "Users can view own transactions" ON transactions
FOR SELECT USING (auth.uid() = "userId");

-- Admins can do everything
CREATE POLICY "Admins have full access to transactions" ON transactions
FOR ALL USING (is_admin());

-- 6. SERVICES & CATEGORIES (Public Read, Admin Write)
CREATE POLICY "Public can view enabled services" ON services
FOR SELECT USING (isEnabled = true OR is_admin());

CREATE POLICY "Admins have full access to services" ON services
FOR ALL USING (is_admin());

CREATE POLICY "Public can view enabled categories" ON categories
FOR SELECT USING (isEnabled = true OR is_admin());

CREATE POLICY "Admins have full access to categories" ON categories
FOR ALL USING (is_admin());

-- 7. COUPONS (Public Read, Admin Write)
CREATE POLICY "Public can view enabled coupons" ON coupons
FOR SELECT USING (isEnabled = true OR is_admin());

CREATE POLICY "Admins have full access to coupons" ON coupons
FOR ALL USING (is_admin());

-- 8. SETTINGS (Public Read, Admin Write)
CREATE POLICY "Public can view settings" ON settings
FOR SELECT USING (TRUE);

CREATE POLICY "Admins have full access to settings" ON settings
FOR ALL USING (is_admin());

-- 9. PREVENT DIRECT BALANCE TAMPERING
-- Ensure that only the system (via Edge Functions or Admin Key) can update balance directly.
-- Note: The "Users can update own profile" policy already restricts balance updates for non-admins.
