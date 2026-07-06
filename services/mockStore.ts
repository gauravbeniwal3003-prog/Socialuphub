
/* 
   DATABASE UPDATE REQUIRED:
   Run the following SQL in your Supabase SQL Editor to enable API Integration and Premium features:
   
   -- 1. Enable developer API Keys on Users
   alter table users add column if not exists "api_key" text unique;
   create index if not exists idx_users_api_key on users("api_key");
   
   -- 2. Add API discounts config rate on Settings
   alter table settings add column if not exists "apiDiscountPercent" numeric default 0;

   -- 3. Add API tracing/flag columns on Orders (Declaring api_user_id as TEXT for raw UUID/text cross-compatibility)
   alter table orders add column if not exists "placed_via_api" boolean default false;
   alter table orders add column if not exists "api_user_id" text;

   -- 4. Premium Services (Previous setup)
   alter table services add column if not exists "isPremium" boolean default false;
   alter table services add column if not exists "description" text;

   -- 5. Strict API Security Constraint Trigger (Prevents changing or regenerating the key once set per account)
   create or replace function lock_user_api_key()
   returns trigger as $$
   begin
       if old.api_key is not null and new.api_key is not null and old.api_key <> new.api_key then
           raise exception 'SMM API key is permanently locked and cannot be changed or regenerated for security reasons.';
       end if;
       return new;
   end;
   $$ language plpgsql;

   drop trigger if exists tr_lock_user_api_key on users;
   create trigger tr_lock_user_api_key
   before update on users
   for each row
   execute function lock_user_api_key();
*/

import { User, Service, Order, Transaction, Coupon, GlobalConfig, UserRole, OrderStatus, Category, PaymentSession, ReferralReward } from '../types';
import { SMM_API_URL, CURRENCY_SYMBOL, RAZORPAY_KEY_ID } from '../constants';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'; // Use Supabase DB & Auth
import { useEffect, useState } from 'react';

// --- UTILS & RATE LIMITING ---
const actionTimestamps: Record<string, number> = {};
const RATE_LIMIT_MS = 500; 

const checkRateLimit = (actionKey: string) => { return; };

const safeFloat = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
const isValidUrl = (s: string) => { try { const u = new URL(s); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } };
const getNumber = (val: any) => { const n = parseFloat(val); return isNaN(n) ? 0 : n; };

const handleSupabaseError = (error: any) => {
    console.error("Supabase Op Error:", error);
    throw new Error(error.message || "Database Error");
};

// Robust helper to parse and validate JSON responses from the backend proxy/services
async function handleJsonResponse(response: Response, defaultErrorMsg: string): Promise<any> {
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        try {
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || defaultErrorMsg);
            }
            return data;
        } catch (err: any) {
            if (!response.ok) {
                throw new Error(err.message || defaultErrorMsg);
            }
            throw new Error("Invalid server response format");
        }
    } else {
        // Non-JSON response, typically HTML from gateway, proxy, or server spinning up
        const text = await response.text().catch(() => "");
        if (!response.ok) {
            if (response.status === 502 || response.status === 503 || response.status === 504 || text.includes("Render") || text.includes("Spinning up")) {
                throw new Error("Secure backend server is starting up or waking up from sleep. Please wait 15-30 seconds and try again.");
            }
            throw new Error(`${defaultErrorMsg} (Server returned HTTP ${response.status}: ${response.statusText || 'Error'})`);
        }
        throw new Error("Expected JSON response but received HTML or text from server.");
    }
}

// Helper for IST time (India Standard Time)
const getISTTime = (): string => {
    const nowMs = Date.now();
    const istMs = nowMs + 19800000;
    const istDate = new Date(istMs);
    return istDate.toISOString().replace('Z', '+05:30');
};

const cleanSmmText = (text: string | null | undefined): string => {
    if (!text) return '';
    let cleaned = text;
    // Case-insensitive removal of "safe smm panel"
    cleaned = cleaned.replace(/safe smm panel/gi, '');
    
    // Removal of specific image/span tag provided by user
    const specificSnippet = '<img src="https://images.superrental.xyz/js/nicedit/upload/864642395 - Flag Off.gif" alt="" width="100%" height="100%" /></span>';
    cleaned = cleaned.split(specificSnippet).join('');
    
    return cleaned.trim();
};

// --- DATA RETENTION & CLEANUP HELPER ---
const cleanupUserHistory = async (table: string, userId: string, dateField: string, limit: number) => {
    try {
        const data = await dbReadProxy(table, { userId }, { order: `${dateField}.desc`, limit: 1000 });
        const itemsToRemove = data ? data.slice(limit) : []; 
        
        if (itemsToRemove && itemsToRemove.length > 0) {
            const ids = itemsToRemove.map(i => i.id);
            await adminDbProxy({ table, action: 'delete', match: { id: { in: ids.join(',') } } });
        }
    } catch (e) {
        console.warn(`Cleanup failed for ${table}:`, e);
    }
};

export const performSystemCleanup = async () => {
    try {
        const now = Date.now();
        const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
        const inactiveUsers = await dbReadProxy('users', { lastLogin: { lt: sixtyDaysAgo } });
        
        if (inactiveUsers && inactiveUsers.length > 0) {
            const ids = inactiveUsers.map(u => u.id);
            await adminDbProxy({ table: 'orders', action: 'delete', match: { userId: { in: ids.join(',') } } });
            await adminDbProxy({ table: 'transactions', action: 'delete', match: { userId: { in: ids.join(',') } } });
            await adminDbProxy({ table: 'users', action: 'delete', match: { id: { in: ids.join(',') } } });
        }

        const nowISO = new Date().toISOString();
        const expiredCoupons = await dbReadProxy('coupons', { expiryDate: { lt: nowISO }, isEnabled: true });
        if (expiredCoupons && expiredCoupons.length > 0) {
             const codes = expiredCoupons.map(c => c.code);
             await adminDbProxy({ table: 'coupons', action: 'update', payload: { isEnabled: false }, match: { code: { in: codes.join(',') } } });
             invalidateCache(['suh_cache_coupons']);
        }
    } catch (e) { console.error("System Cleanup Failed", e); }
};

// --- PRICE CALCULATOR HELPER ---
export const calculateFinalPrice = (service: Service, config: GlobalConfig): number => {
    let price = parseFloat(service.rate as any) || 0;
    const marginPercent = service.customMarginPercent !== undefined && service.customMarginPercent !== null ? parseFloat(service.customMarginPercent as any) : parseFloat((config?.globalMarginPercent as any) || 0);
    const marginFixed = service.customMarginFixed !== undefined && service.customMarginFixed !== null ? parseFloat(service.customMarginFixed as any) : parseFloat((config?.globalMarginFixed as any) || 0);

    if (marginPercent) price += price * (marginPercent / 100);
    if (marginFixed) price += marginFixed;
    return price; // Do NOT round the rate, it causes discrepancy with backend
};

// --- SECURITY CHECKS ---
const checkUserSecurity = async (userId: string): Promise<User> => {
    const data = await dbReadProxy('users', { id: userId }); const user = data?.[0]; const error = null;
    if (error || !user) throw new Error("User validation failed");
    
    if (user.isBanned) {
        if (!user.banExpires || new Date() < new Date(user.banExpires)) {
            throw new Error(`ACCOUNT BLOCKED: ${user.banReason || 'Security Violation'}`);
        } else {
             await adminDbProxy({ table: 'users', action: 'update', payload: { isBanned: false, banExpires: null }, match: { id: userId } });
        }
    }
    return user as User;
};

const initialConfig: GlobalConfig = { 
    globalMarginPercent: 20, 
    globalMarginFixed: 0, 
    maintenanceMode: false,
    referralSignupBonus: 1.0,
    referralDepositBonus: 5.0, // Default 5%
    referralMinDeposit: 10.0,
    isReferralSystemEnabled: true,
    landingVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    renderBackendUrl: ""
};

// --- CACHING SYSTEM ---
function getFromCacheSync<T>(key: string): T | null {
    try {
        const item = localStorage.getItem(key);
        if (!item) return null;
        const { data } = JSON.parse(item);
        return data; 
    } catch { return null; }
}

function saveToCache(key: string, data: any) {
    try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch (e) { console.warn("Cache write fail", e); }
}

const triggerStoreUpdate = (keys: string[]) => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('suh_data_update', { detail: keys }));
};

function invalidateCache(keys: string[]) {
    keys.forEach(k => localStorage.removeItem(k));
    triggerStoreUpdate(keys);
}

// --- NEW FRESH FETCH ---
async function fetchFresh<T>(tableName: string, cacheKey: string, orderByField: string = 'createdAt', limitCount: number = 100): Promise<T[]> {
    try {
        const options: any = { order: `${orderByField}.desc` };
        if (tableName !== 'categories' && tableName !== 'services' && tableName !== 'coupons') {
            options.limit = limitCount;
        }
        const data = await dbReadProxy(tableName, {}, options);
        
        saveToCache(cacheKey, data);
        return data as unknown as T[];
    } catch (e: any) {
        return getFromCacheSync<T[]>(cacheKey) || [];
    }
}

const KEY_TO_TABLE: Record<string, string> = {
    'suh_services': 'services',
    'suh_categories': 'categories',
    'suh_coupons': 'coupons',
    'suh_orders': 'orders',
    'suh_transactions': 'transactions',
    'suh_users': 'users',
    'suh_config': 'settings'
};

// --- DATA HOOK ---
export const useStore = <T>(key: string, getter: () => T) => {
  const [data, setData] = useState<T>(() => {
     const cacheKey = key.replace('suh_', 'suh_cache_');
     const cached = getFromCacheSync<T>(cacheKey);
     return cached || getter();
  });

  useEffect(() => {
    let active = true;
    const cacheKey = key.replace('suh_', 'suh_cache_');
    const tableName = KEY_TO_TABLE[key];

    const load = async () => {
        if (key === 'suh_services') {
            const items = await fetchFresh<Service>('services', cacheKey, 'sortOrder', 1000);
            
            // --- AUTO HEAL START ---
            if (items.length === 0) {
                console.warn("No services found. Attempting auto-sync from API...");
                syncServicesFromProvider().then(() => {
                    // Trigger a reload after sync
                    invalidateCache(['suh_cache_services', 'suh_cache_categories']);
                }).catch(console.error);
            }
            // --- AUTO HEAL END ---

            items.sort((a, b) => (a.sortOrder||9999) - (b.sortOrder||9999));
            if(active) setData(items as any);
        }
        else if (key === 'suh_categories') {
            const items = await fetchFresh<Category>('categories', cacheKey, 'sortOrder', 1000);
            
            if (items.length === 0) {
                 // Trigger sync if categories missing too, though services check usually catches this
                 console.warn("No categories found. Attempting auto-sync...");
                 syncServicesFromProvider().catch(console.error);
            }

            items.sort((a, b) => (a.sortOrder||9999) - (b.sortOrder||9999));
            if(active) setData(items as any);
        }
        else if (key === 'suh_coupons') {
            const items = await fetchFresh<Coupon>('coupons', cacheKey, 'code', 100);
            if(active) setData(items as any);
        }
        else if (key === 'suh_orders') {
            const items = await fetchFresh<Order>('orders', cacheKey, 'date', 100);
            if(active) setData(items as any);
        }
        else if (key === 'suh_transactions') {
            const items = await fetchFresh<Transaction>('transactions', cacheKey, 'date', 100);
            if(active) setData(items as any);
        }
        else if (key === 'suh_users') {
             const items = await fetchFresh<User>('users', cacheKey, 'createdAt', 200);
             if (active) setData(items as any);
        }
        else if (key === 'suh_config') {
            const resData = await dbReadProxy('settings', { id: 'global' }); const data = resData?.[0];
            if (active) {
                const merged = {
                    ...initialConfig,
                    ...(data || {}),
                    renderBackendUrl: data?.renderBackendUrl?.trim() || initialConfig.renderBackendUrl,
                    landingVideoUrl: data?.landingVideoUrl?.trim() || initialConfig.landingVideoUrl
                };
                saveToCache(cacheKey, merged);
                setData(merged as any);
            }
        }
    };
    
    load();

    let subscription: any;
    if (tableName && tableName !== 'settings') {
        subscription = supabase.channel(`realtime_${key}`).on('postgres_changes', { event: '*', schema: 'public', table: tableName }, () => { if (active) load(); }).subscribe();
    }

    const handleUpdate = (e: any) => { if (!e.detail || e.detail.includes(cacheKey)) load(); };
    window.addEventListener('suh_data_update', handleUpdate);
    return () => { active = false; if (subscription) supabase.removeChannel(subscription); window.removeEventListener('suh_data_update', handleUpdate); };
  }, [key]);

  return data;
};

// --- REFERRAL LOGIC ---

export const transferReferralBalance = async (userId: string) => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

         
        const urlObj = `${getBaseApiUrl()}/api/users/transfer-referral`;
        
        const response = await fetch(urlObj, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        
        const data = await handleJsonResponse(response, "Transfer failed");

        invalidateCache(['suh_cache_users', 'suh_cache_transactions']);
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('force_balance_update', { detail: { balance: data.newBalance } }));

        return data.newBalance;
    } catch (e: any) { throw new Error(e.message); }
};

export const getReferralStats = async (userId: string) => {
    try {
        // Get referrals
        const refUsers = await dbReadProxy('users', { referred_by: userId }); const totalReferrals = refUsers.length;
        
        // Get commission earnings from transactions
        // Note: total_referral_earnings column in users table is the single source of truth for cumulative
        const uData = await dbReadProxy('users', { id: userId }); const user = uData?.[0];
        
        // Count active spenders
        const depUsers = await dbReadProxy('users', { referred_by: userId, totalSpent: { gt: 0 } }); const depositCount = depUsers.length;

        // Get list of referred users for the table - LIMIT TO LAST 5 ONLY
        const referredUsers = await dbReadProxy('users', { referred_by: userId }, { order: 'created_at.desc', limit: 5 });

        return {
            totalReferrals: totalReferrals || 0,
            signupCount: totalReferrals || 0, // In this model, signup count is same as referral count
            depositCount: depositCount || 0,
            referredUsers: referredUsers || [],
            totalEarnings: user?.total_referral_earnings || 0
        };
    } catch {
        return { totalReferrals: 0, signupCount: 0, depositCount: 0, referredUsers: [], totalEarnings: 0 };
    }
};


// --- ACTIONS ---

export const updateConfig = async (newConfig: Partial<GlobalConfig>) => {
    try { await adminDbProxy({ table: 'settings', action: 'upsert', payload: { id: 'global', ...newConfig } }); invalidateCache(['suh_cache_config']); } catch (e) { handleSupabaseError(e); }
};

// Helper to dynamically get Render Backend URL from local cache
const getRenderBackendUrl = (): string => {
    const defaultBackend = 'https://socialuphub-backend.onrender.com';
    
    // Check local storage cache for a user-configured backend URL
    try {
        const cached = getFromCacheSync<GlobalConfig>('suh_cache_config');
        if (cached && typeof cached.renderBackendUrl === 'string') {
            const trimmed = cached.renderBackendUrl.trim();
            if (trimmed !== '' && trimmed !== '/' && trimmed.startsWith('http')) {
                // If it is a valid remote URL and not the same as current static origin
                if (typeof window !== 'undefined' && trimmed !== window.location.origin) {
                    return trimmed;
                }
                if (typeof window === 'undefined') {
                    return trimmed;
                }
            }
        }
    } catch (e) {
        console.warn("Could not retrieve cached backend URL:", e);
    }

    // Dynamic environment fallback
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname.toLowerCase();
        
        // Check if we are running in local dev server or AI Studio preview
        const isLocalOrPreview = 
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '0.0.0.0' ||
            hostname.includes('asia-east1.run.app') || // AI Studio previews
            hostname.includes('.local') ||
            hostname.includes('gitpod.io') ||
            hostname.includes('github.dev');

        if (isLocalOrPreview) {
            // In local development or AI Studio preview, the API server runs on the same origin (port 3000)
            return window.location.origin;
        }
    }

    // When running in production static hosting (e.g., Firebase Hosting), we must route to the remote Render backend
    return defaultBackend;
};

// Helper to get the base API URL dynamically (supporting Admin Panel configuration)


export async function dbReadProxy(table: string, match?: any, options?: any) {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    const url = `${getBaseApiUrl()}/api/db-read`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ table, match, ...options })
    });
    let result;
    let textBody = '';
    try {
        textBody = await res.text();
        result = textBody ? JSON.parse(textBody) : {};
    } catch (e) {
        throw new Error(`DB Read Proxy Parse Error: HTTP ${res.status} - ${res.statusText}. Body: ${textBody.substring(0, 100)}`);
    }
    if (!res.ok || result.error) throw new Error(result.error || "DB Read Proxy Error");
    return result.data || [];
};

export async function adminDbProxy(payload: any) {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) throw new Error("No session");
    
    const url = `${getBaseApiUrl()}/api/admin/db-proxy`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
        });
    let result;
    let textBody = '';
    try {
        textBody = await res.text();
        result = textBody ? JSON.parse(textBody) : {};
    } catch (e) {
        throw new Error(`DB Proxy Parse Error: HTTP ${res.status} - ${res.statusText}. Body: ${textBody.substring(0, 100)}`);
    }
    if (!res.ok || result.error) throw new Error(result.error || "DB Proxy Error");
    return result;
};

export function getBaseApiUrl(): string {
    if (typeof window !== 'undefined') {
        const hn = window.location.hostname;
        if (hn !== 'socialuphub.in' && hn !== 'socialuphub-smm.web.app' && hn !== 'socialuphub-smm.firebaseapp.com') {
            return window.location.origin;
        }
    }
    if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL.replace(/\/$/, "");
    }
    return getRenderBackendUrl().replace(/\/$/, "");
};

// --- UPDATED API CALLER USING SECURE BACKEND PROXY ---
const callSmmApi = async (params: URLSearchParams, retries = 2): Promise<any> => {
    try {
        const body: Record<string, string> = {};
        params.forEach((value, key) => {
            body[key] = value;
        });

        const urlObj = `${getBaseApiUrl()}/api/smm`;

        const response = await fetch(urlObj, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(body),
        });

        const text = await response.text();
        let data: any;

        try {
            data = JSON.parse(text);
        } catch (e) {
            // If we got HTML (starts with <!DOCTYPE or <html), the proxy/server failed with a generic error page
            if (text.trim().startsWith('<')) {
                throw new Error("Provider server is currently busy or offline (Server Error 502/504). Please wait 10 seconds.");
            }
            throw new Error(`Unexpected provider response: ${text.substring(0, 40)}...`);
        }

        const bodyStr = JSON.stringify(data).toLowerCase();
        const hasErrorInBody = bodyStr.includes("error") || bodyStr.includes("invalid") || bodyStr.includes("something went wrong");

        if (!response.ok || hasErrorInBody) {
            const errorMsg = data.message || data.error || (data.errors && Array.isArray(data.errors) ? data.errors.join(', ') : null) || "Failed to connect to provider via proxy";
            const errorDetail = data.details ? ` (${data.details})` : "";
            throw new Error(`${errorMsg}${errorDetail}`);
        }

        return data;
    } catch (error: any) {
        // Only retry on actual network/fetch errors, not on 4xx/5xx responses from our proxy
        const isNetworkError = error.message.includes("fetch") || error.message.includes("Network") || error.message.includes("Failed to fetch") || error.message.includes("busy or offline");
        
        if (retries > 0 && isNetworkError) {
            console.warn(`[API Retry] ${error.message}. Retries left: ${retries}`);
            await new Promise(r => setTimeout(r, 1500));
            return callSmmApi(params, retries - 1);
        }
        
        console.error("SMM Proxy Call Failed:", error.message);
        throw error;
    }
};

// --- RAZORPAY ORDERS API ---

export const createRazorpayOrder = async (amount: number, userId: string, couponCode?: string) => {
    const receipt = `rcpt_${Date.now()}_${userId.substring(0,4)}`;
    
    // 1. Try Express backend first (includes pre-creation of PENDING transaction & custom notes tracking)
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            const response = await fetch(`${getBaseApiUrl()}/api/payments/create-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ 
                    amount: amount,
                    couponCode: couponCode
                })
            });
            const data = await handleJsonResponse(response, "Razorpay order creation failed");
            if (data && (data.id || data.fallback)) {
                console.log("[Payment] Created Razorpay order via secure Express server.");
                return data;
            }
        }
    } catch (err: any) {
        console.warn("Express order creation failed, falling back to Edge Function:", err.message);
    }

    // 2. Fallback to older Edge Function
    const baseUrl = SUPABASE_URL.replace(/\/$/, "");
    const functionUrl = `${baseUrl}/functions/v1/razorpay`;
    
    try {
        const response = await fetch(functionUrl, {
            method: 'POST',
            credentials: 'omit', // Crucial for ignoring cookie policies on some browsers
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ 
                action: 'create_order',
                amount: amount,
                receipt: receipt
            })
        });

        if (!response.ok) {
             const text = await response.text();
             throw new Error(`Server Error: ${text}`);
        }
        
        const data = await response.json();
        
        if (!data || !data.id) {
             throw new Error("No Order ID returned from backend.");
        }
        
        return data;
    } catch (e: any) {
        // FALLBACK MODE
        console.warn("API Order Creation Failed. Switching to Client-Side Fallback.", e.message);
        
        return {
            id: null,
            amount: Math.round(amount * 100), // paise
            currency: "INR",
            receipt: receipt,
            fallback: true
        };
    }
};

export const getGlobalStats = async () => {
    try {
        const oData = await dbReadProxy('orders'); const oCount = oData.length;
        const uData = await dbReadProxy('users'); const uCount = uData.length;
        return { orders: oCount || 14000, users: uCount || 1200 };
    } catch { return { orders: 14000, users: 1200 }; }
};

// --- BACKGROUND ORDER PROCESSOR ---
// Global Queue Lock to prevent overlapping runs during slow network calls
let isQueueProcessing = false;

export const processOrderQueue = async () => {
    // Automation is fully offloaded to the server-side hosted backend thread (forward_pending_orders_loop).
    // This frontend stub prevents arbitrary client-side order processing and enforces backend security.
    return;
};

export const placeOrder = async (userId: string, serviceId: string, serviceName: string, link: string, quantity: number, originalCost: number, couponCode?: string) => {
  checkRateLimit('place_order');
  if (!isValidUrl(link)) throw new Error("Invalid Link.");

  try {
      const user = await checkUserSecurity(userId);

      const { data: { session } } = await supabase.auth.getSession();
      const urlObj = `${getBaseApiUrl()}/api/orders/place`;
      
      const response = await fetch(urlObj, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ userId, serviceId, serviceName, link, quantity, originalCost, couponCode })
        });
      
      const resData = await handleJsonResponse(response, "Order placement failed");
      invalidateCache(['suh_cache_orders', 'suh_cache_users']);
      
      // Auto processing logic to queue the SMM api call
      if (typeof window !== 'undefined') {
          setTimeout(() => {
              processOrderQueue().catch(console.error);
          }, 100);
      }
      return resData;
  } catch (e: any) {
      console.error(`Order Failed: ${serviceId}`, e.message);
      throw e;
  }
};
export const handleRazorpaySuccess = async (userId: string, amount: number, paymentId: string, orderId?: string, signature?: string, couponCode?: string) => {
    try {
        const user = await checkUserSecurity(userId);

        if (orderId && signature) {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Authentication required for payment verification");

            const urlObj = `${getBaseApiUrl()}/api/payments/verify`;

            const response = await fetch(urlObj, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    razorpay_order_id: orderId,
                    razorpay_payment_id: paymentId,
                    razorpay_signature: signature,
                    amount: amount,
                    couponCode: couponCode
                })
            });

            await handleJsonResponse(response, "Payment verification failed");
        } else {
           throw new Error("Missing payment verification data from Razorpay.");
        }
        
        invalidateCache(['suh_cache_users', 'suh_cache_transactions']);
        return "SUCCESS";
    } catch (e: any) { 
        console.error(`Razorpay Error ${userId}`, e.message);
        throw new Error(e.message); 
    }
};

// ... Rest of the exports are simple wrappers ...
export const addCategory = async (name: string, sort: number) => { await adminDbProxy({ table: 'categories', action: 'insert', payload: { id: `cat_${Date.now()}`, name, sortOrder: sort, isEnabled: true } }); invalidateCache(['suh_cache_categories']); };
export const updateCategory = async (id: string, data: any) => { await adminDbProxy({ table: 'categories', action: 'update', payload: data, match: { id: id } }); invalidateCache(['suh_cache_categories']); };
export const deleteCategory = async (id: string) => { await adminDbProxy({ table: 'categories', action: 'delete', match: { id: id } }); invalidateCache(['suh_cache_categories']); };
export const toggleCategoryWithServices = async (catId: string, catName: string, status: boolean) => {
    await Promise.all([
        adminDbProxy({ table: 'categories', action: 'update', payload: { isEnabled: status }, match: { id: catId } }),
        adminDbProxy({ table: 'services', action: 'update', payload: { isEnabled: status }, match: { category: catName } })
    ]);
    invalidateCache(['suh_cache_categories', 'suh_cache_services']);
};
export const disableAllCategories = async () => {
    await adminDbProxy({ table: 'categories', action: 'update', payload: { isEnabled: false }, match: { id: { neq: 'PLACEHOLDER' } } });
    await adminDbProxy({ table: 'services', action: 'update', payload: { isEnabled: false }, match: { service: { neq: 'PLACEHOLDER' } } });
    invalidateCache(['suh_cache_categories', 'suh_cache_services']);
};
export const enableAllCategories = async () => {
    await adminDbProxy({ table: 'categories', action: 'update', payload: { isEnabled: true }, match: { id: { neq: 'PLACEHOLDER' } } });
    await adminDbProxy({ table: 'services', action: 'update', payload: { isEnabled: true }, match: { service: { neq: 'PLACEHOLDER' } } });
    invalidateCache(['suh_cache_categories', 'suh_cache_services']);
};
export const addService = async (s: Partial<Service>) => { 
    const { error } = await adminDbProxy({ table: 'services', action: 'insert', payload: {
        service: s.service || `man_${Date.now()}`,
        name: cleanSmmText(s.name),
        category: s.category,
        rate: s.rate || 0,
        min: s.min || 10,
        max: s.max || 10000,
        type: s.type || 'Default',
        description: cleanSmmText(s.description),
        isEnabled: true,
        sortOrder: s.sortOrder || 0,
        isPremium: s.isPremium || false
    } });
    if (error) throw error;
    invalidateCache(['suh_cache_services']); 
};
export const updateService = async (s: Service) => { 
    const cleaned = {
        ...s,
        name: cleanSmmText(s.name),
        description: cleanSmmText(s.description)
    };
    await adminDbProxy({ table: 'services', action: 'update', payload: cleaned, match: { service: s.service } }); 
    invalidateCache(['suh_cache_services']); 
};
export const updateUser = async (u: User) => { const { balance, totalSpent, ...safeUpdate } = u; await adminDbProxy({ table: 'users', action: 'update', payload: safeUpdate, match: { id: u.id } }); invalidateCache(['suh_cache_users']); };
export const deleteUser = async (uid: string) => { await adminDbProxy({ table: 'users', action: 'delete', match: { id: uid } }); invalidateCache(['suh_cache_users']); };

// --- ROBUST ORDER SYNC LOGIC ---
const normalizeStatus = (status: string): OrderStatus | null => {
    if (!status) return null;
    const s = status.toLowerCase().trim();
    if (s === 'completed' || s === 'success' || s === 'complete') return OrderStatus.COMPLETED;
    if (s === 'processing' || s === 'in progress' || s === 'active') return OrderStatus.PROCESSING;
    if (s === 'pending') return OrderStatus.PENDING;
    if (s === 'canceled' || s === 'cancelled') return OrderStatus.CANCELED;
    if (s === 'partial' || s === 'partially completed') return OrderStatus.PARTIAL;
    if (s === 'failed' || s === 'fail' || s === 'error') return OrderStatus.FAILED;
    return OrderStatus.PROCESSING; // Fallback for unknown active statuses to keep syncing
};

export const syncOrderStatuses = async () => { 
    // This runs automatically every 30 seconds. 
    // We iterate over Pending/Processing orders that HAVE an externalId and check status.
    // The `.in` filter ensures we STOP syncing once status becomes Completed/Canceled.
    try {
        const activeOrders = await dbReadProxy('orders', { status: { in: ['Pending', 'Processing'] }, externalId: { not_null: true }, limit: 20 });

        if (!activeOrders || activeOrders.length === 0) return;

        for (const order of activeOrders) {
            if (order.externalId) {
                try {
                    const params = new URLSearchParams({ action: 'status', order: order.externalId });
                    const res = await callSmmApi(params);
                    
                    // Provider API usually returns { status: "Completed", remains: "0", ... }
                    if (res.status) {
                        const normalizedStatus = normalizeStatus(res.status);
                        
                        // Only update if status is valid and different
                        if (normalizedStatus && normalizedStatus !== order.status) {
                            const updates: any = { status: normalizedStatus };
                            if (res.remains) updates.remains = res.remains;
                            if (res.start_count) updates.start_count = res.start_count;
                            await adminDbProxy({ table: 'orders', action: 'update', payload: updates, match: { id: order.id } });
                        }
                    }
                } catch (e) { 
                    // Silent fail for status sync, retry next cycle
                }
            }
        }
        invalidateCache(['suh_cache_orders']);
    } catch (e) { console.error("Auto-sync error", e); }
};

export const createCoupon = async (c: Coupon) => { 
    await adminDbProxy({ table: 'coupons', action: 'insert', payload: c }); const error = null; 
    if (error) throw new Error(error.message);
    invalidateCache(['suh_cache_coupons']); 
};
export const deleteCoupon = async (code: string) => { 
    await adminDbProxy({ table: 'coupons', action: 'delete', match: { code } }); const error = null; 
    if (error) throw new Error(error.message);
    invalidateCache(['suh_cache_coupons']); 
};
export const toggleCouponStatus = async (code: string, s: boolean) => { 
    await adminDbProxy({ table: 'coupons', action: 'update', payload: { isEnabled: !s }, match: { code } }); const error = null; 
    if (error) throw new Error(error.message);
    invalidateCache(['suh_cache_coupons']); 
};

// Global lock for service sync
let isServiceSyncing = false;

// This function is now for MANUAL sync of structure (services/categories) from the admin panel.
export const syncServicesFromProvider = async () => {
    if (isServiceSyncing) return 0; // Prevent concurrent syncs
    isServiceSyncing = true;
    try {
        const params = new URLSearchParams({ action: 'services' });
        const data = await callSmmApi(params);
        if(Array.isArray(data)) {
            // 1. Categories - Robust Select-then-Insert Strategy
            const uniqueCategoryNames = Array.from(new Set(data.map((s: any) => s.category))) as string[];
            
            const existingCats = await dbReadProxy('categories', {}, { limit: 1000 }); const fetchErr = null;
            
            if (fetchErr) {
                console.error("Failed to fetch existing categories for sync check", fetchErr);
                return 0;
            }

            const existingNames = new Set(existingCats?.map(c => c.name));

            const newCats = uniqueCategoryNames
                .filter(name => !existingNames.has(name))
                .map((catName, index) => ({
                    id: `cat_auto_${catName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}_${index}`,
                    name: catName,
                    sortOrder: (existingNames.size + index + 1) * 10, 
                    isEnabled: true
                }));

            if (newCats.length > 0) {
                for (let c of newCats) await adminDbProxy({ table: 'categories', action: 'upsert', payload: c, match: { name: c.name } });
                
            }

            // 2. Services
            const upserts = data.map((s: any) => ({ 
                service: s.service, 
                name: cleanSmmText(s.name), 
                category: s.category, 
                rate: parseFloat(s.rate), 
                min: parseInt(s.min), 
                max: parseInt(s.max), 
                type: s.type, 
                description: cleanSmmText(s.description),
                isEnabled: true 
            }));
            
            for (let s of upserts) await adminDbProxy({ table: 'services', action: 'upsert', payload: s, match: { service: s.service } });
            
            invalidateCache(['suh_cache_services', 'suh_cache_categories']);
            return upserts.length;
        }
        return 0;
    } catch (e: any) { throw e; }
    finally { isServiceSyncing = false; }
};

// New function for automatic background price sync
export const syncPricesFromProvider = async () => {
    try {
        const params = new URLSearchParams({ action: 'services' });
        const providerServices = await callSmmApi(params);
        if (!Array.isArray(providerServices) || providerServices.length === 0) {
            console.warn("[Price Sync] Provider API returned no services.");
            return;
        }

        const localServices = await dbReadProxy('services'); const error = null;
        if (error || !localServices) {
            console.error("[Price Sync] Could not fetch local services.", error);
            return;
        }

        const providerPriceMap = new Map<string, number>();
        for (const service of providerServices) {
            providerPriceMap.set(String(service.service), parseFloat(service.rate));
        }

        const servicesToUpdate = [];
        for (const localService of localServices) {
            const providerRate = providerPriceMap.get(localService.service);
            if (providerRate !== undefined && providerRate !== localService.rate) {
                servicesToUpdate.push({ service: localService.service, rate: providerRate });
            }
        }
        
        if (servicesToUpdate.length > 0) {
            try {
                for (let s of servicesToUpdate) await adminDbProxy({ table: 'services', action: 'upsert', payload: s, match: { service: s.service } });
                console.log(`[Price Sync] Updated ${servicesToUpdate.length} service prices.`);
                invalidateCache(['suh_cache_services']);
            } catch (updateError) {
                console.error("[Price Sync] Failed to update prices:", updateError);
            }
        }
    } catch (e) {
        console.debug("[Price Sync] Price sync failed. Will retry on next cycle.", e);
    }
};

export const importServiceFromApi = async (serviceId: string) => {
    const params = new URLSearchParams({ action: 'services' });
    const allServices = await callSmmApi(params);
    
    const target = allServices.find((s: any) => s.service === serviceId);
    if (!target) throw new Error(`Service ID ${serviceId} not found in provider API.`);

    const catData = await dbReadProxy('categories', { name: target.category }); const cat = catData?.[0];
    if (!cat) {
        await adminDbProxy({ table: 'categories', action: 'upsert', payload: {
            id: `cat_auto_${target.category.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`,
            name: target.category,
            sortOrder: 999,
            isEnabled: true
        } });
    }

    const s: Service = {
        service: target.service,
        name: cleanSmmText(target.name),
        category: target.category,
        rate: parseFloat(target.rate),
        min: parseInt(target.min),
        max: parseInt(target.max),
        type: target.type,
        description: cleanSmmText(target.description),
        isEnabled: true
    };
    
    await adminDbProxy({ table: 'services', action: 'upsert', payload: s, match: { service: s.service } });
    invalidateCache(['suh_cache_services', 'suh_cache_categories']);
    return s;
};

export const hardResyncServices = async () => {
    try {
        console.log("Starting Hard Sync: Fetching data...");
        const params = new URLSearchParams({ action: 'services' });
        const data = await callSmmApi(params);
        
        if(!Array.isArray(data) || data.length === 0) {
            throw new Error("API returned empty or invalid data. Aborting sync to protect local data.");
        }

        console.log(`Fetched ${data.length} services. Clearing DB...`);

        await adminDbProxy({ table: 'services', action: 'delete', match: { service: { neq: 'PLACEHOLDER_SAFEGUARD' } } }); 
        await adminDbProxy({ table: 'categories', action: 'delete', match: { id: { neq: 'PLACEHOLDER_SAFEGUARD' } } });
        
        const uniqueCategories = Array.from(new Set(data.map((s: any) => s.category))) as string[];
        const categoryInserts = uniqueCategories.map((catName, index) => ({
            id: `cat_${Date.now()}_${index}`,
            name: catName,
            sortOrder: (index + 1) * 10,
            isEnabled: true
        }));
        await adminDbProxy({ table: 'categories', action: 'insert', payload: categoryInserts });

        const serviceInserts = data.map((s: any) => ({ 
            service: s.service, 
            name: cleanSmmText(s.name), 
            category: s.category, 
            rate: parseFloat(s.rate), 
            min: parseInt(s.min), 
            max: parseInt(s.max), 
            type: s.type, 
            description: cleanSmmText(s.description),
            isEnabled: true,
            isPremium: false
        }));
        
        const chunkSize = 100;
        for (let i = 0; i < serviceInserts.length; i += chunkSize) {
            const chunk = serviceInserts.slice(i, i + chunkSize);
            for (let c of chunk) await adminDbProxy({ table: 'services', action: 'insert', payload: c });
        }
        
        invalidateCache(['suh_cache_services', 'suh_cache_categories']);
        return serviceInserts.length;
    } catch (e: any) { 
        console.error("Hard Sync Failed:", e);
        throw e; 
    }
};

export const hardResyncCategories = async () => {
    try {
        console.log("Starting Category Hard Sync: Fetching data...");
        const params = new URLSearchParams({ action: 'services' });
        const data = await callSmmApi(params);
        
        if(!Array.isArray(data) || data.length === 0) {
            throw new Error("API returned empty or invalid data. Aborting sync.");
        }

        console.log(`Fetched service data. Clearing categories table...`);

        await adminDbProxy({ table: 'categories', action: 'delete', match: { id: { neq: 'PLACEHOLDER_SAFEGUARD' } } });
        
        const uniqueCategories = Array.from(new Set(data.map((s: any) => s.category))) as string[];
        const categoryInserts = uniqueCategories.map((catName, index) => ({
            id: `cat_${Date.now()}_${index}`,
            name: catName,
            sortOrder: (index + 1) * 10,
            isEnabled: true,
            isPinned: false
        }));
        await adminDbProxy({ table: 'categories', action: 'insert', payload: categoryInserts });
        
        invalidateCache(['suh_cache_categories']);
        return categoryInserts.length;
    } catch (e: any) { 
        console.error("Category Hard Sync Failed:", e);
        throw e; 
    }
};

export const getProviderServices = async () => { try { const params = new URLSearchParams({ action: 'services' }); return await callSmmApi(params); } catch { return []; } };
export const checkSingleOrderApiStatus = async (oid: string) => { 
    const oData = await dbReadProxy('orders', { id: oid }); const order = oData?.[0];
    if(!order?.externalId) return "No External ID";
    const params = new URLSearchParams({ action: 'status', order: order.externalId });
    const res = await callSmmApi(params);
    if(res.status) {
        await updateOrderStatus(oid, res.status);
        if(res.remains) await adminDbProxy({ table: 'orders', action: 'update', payload: { remains: res.remains }, match: { id: oid } });
        return res.status;
    }
    return "Error";
};
export const updateUserPassword = async (oldP: string, newP: string) => { const { error } = await supabase.auth.updateUser({ password: newP }); if (error) throw new Error(error.message); };
export const updateUserEmailSafe = async (oldE: string, newE: string) => { const { error } = await supabase.auth.updateUser({ email: newE }); if (error) throw new Error(error.message); /* Safe email update enforced by RLS. DB trigger handles table sync. */ };
export const fetchServices = (): Service[] => []; 
export const fetchUsers = (): User[] => []; 
export const fetchOrders = (): Order[] => []; 
export const fetchTransactions = (): Transaction[] => []; 
export const fetchCoupons = (): Coupon[] => []; 
export const fetchCategories = (): Category[] => [];
export const fetchPaymentSessions = (): PaymentSession[] => [];
export const getConfig = (): GlobalConfig => initialConfig;
export const updateOrderExternalId = async (oid: string, eid: string) => { await adminDbProxy({ table: 'orders', action: 'update', payload: { externalId: eid }, match: { id: oid } }); invalidateCache(['suh_cache_orders']); };
export const updateOrderDetails = async (oid: string, updates: Partial<Order>) => { await adminDbProxy({ table: 'orders', action: 'update', payload: updates, match: { id: oid } }); invalidateCache(['suh_cache_orders']); };
export const updateOrderStatus = async (oid: string, s: OrderStatus) => { await adminDbProxy({ table: 'orders', action: 'update', payload: { status: s }, match: { id: oid } }); invalidateCache(['suh_cache_orders']); };
export const disableAllServices = async () => { await adminDbProxy({ table: 'services', action: 'update', payload: { isEnabled: false }, match: { service: { neq: '0' } } }); invalidateCache(['suh_cache_services']); };
export const enableAllServices = async () => { await adminDbProxy({ table: 'services', action: 'update', payload: { isEnabled: true }, match: { service: { neq: '0' } } }); invalidateCache(['suh_cache_services']); };
export const deleteService = async (id: string) => { await adminDbProxy({ table: 'services', action: 'delete', match: { service: id } }); invalidateCache(['suh_cache_services']); };
export const activateServiceById = async (id: string) => { await adminDbProxy({ table: 'services', action: 'update', payload: { isEnabled: true }, match: { service: id } }); invalidateCache(['suh_cache_services']); };
export const syncCategoriesFromDB = async () => 0;

export const startAutoSync = () => { 
    // Automation is fully offloaded to the server-side hosted backend.
    return () => {}; 
}
export const checkUsernameUnique = async (n: string) => { 
    try {
         
        const urlObj = `${getBaseApiUrl()}/api/auth/lookup`;
        const response = await fetch(urlObj, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'checkUsernameUnique', value: n })
        });
        const resData = await handleJsonResponse(response, "Username lookup failed");
        return resData.unique ?? true;
    } catch (e) {
        return true; // Assume unique on error to let DB handle it
    }
};
export const checkMobileUnique = async (m: string) => { 
    if (!m) return true;
    try {
         
        const urlObj = `${getBaseApiUrl()}/api/auth/lookup`;
        const response = await fetch(urlObj, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'checkMobileUnique', value: m })
        });
        const resData = await handleJsonResponse(response, "Mobile lookup failed");
        return resData.unique ?? true;
    } catch (e) {
        return true;
    }
};
export const getEmailByMobile = async (m: string) => { 
    try {
         
        const urlObj = `${getBaseApiUrl()}/api/auth/lookup`;
        const response = await fetch(urlObj, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'getEmailByMobile', value: m })
        });
        const resData = await handleJsonResponse(response, "Get email lookup failed");
        return resData.email;
    } catch (e) {
        console.warn("getEmailByMobile server lookup failed, attempting direct Supabase query fallback:", e);
        try {
            const data = await dbReadProxy('users', { mobile: m });
            return data?.[0]?.email || null;
        } catch (fallbackError) {
            console.error("Client-side fallback lookup failed:", fallbackError);
            return null;
        }
    }
};

// FIXED CREATE USER DOC FUNCTION
// This function is now a "Sync/Update Profile" function.
// It relies on the Database Trigger to create the initial user row.
// It only updates specific fields if they are different, or falls back to insert if trigger failed.
export const createUserDoc = async (uid: string, email: string, name: string, mobile: string, referredByCode?: string) => { 
    
    const existData = await dbReadProxy('users', { id: uid }); const existingUser = existData?.[0];

    if (existingUser) {
        // Only update if name/mobile is provided (e.g. from a manual register step)
        const updates: any = { lastLogin: getISTTime() };
        if (name && !existingUser.name) updates.name = name;
        if (mobile && !existingUser.mobile) updates.mobile = mobile;

        await adminDbProxy({ table: 'users', action: 'update', payload: updates, match: { id: uid } });
        invalidateCache(['suh_cache_users']);
        return;
    }

    console.warn("User doc not found. Creating profile for:", email);

    const referralCode = `U${uid.substring(0,4)}${Math.floor(Math.random()*99999)}`.toUpperCase();
    let referrerId = null;

    if (referredByCode) {
        const refData = await dbReadProxy('users', { referral_code: referredByCode.toUpperCase() }); const refUser = refData?.[0];
        if (refUser) referrerId = refUser.id;
    }

    let finalName = name || email.split('@')[0] || "User";
    try {
        const nameData = await dbReadProxy('users', { name: finalName }); const nameCheck = nameData?.[0];
        if (nameCheck && nameCheck.id !== uid) {
            finalName = `${finalName}_${Math.floor(1000 + Math.random() * 9000)}`;
        }
    } catch (err) {
        // Ignore if not found or query error
    }

    const u: User = { 
        id: uid, 
        email, 
        name: finalName, 
        mobile: mobile || undefined, 
        role: UserRole.USER, 
        balance: 0, 
        totalSpent: 0, 
        isBanned: false, 
        createdAt: getISTTime(), 
        lastLogin: getISTTime(),
        referral_code: referralCode, 
        referred_by: referrerId || undefined, 
        referral_balance: 0, 
        total_referral_earnings: 0,
    }; 

    // Replaced with proxy
const { data: upsertData } = await adminDbProxy({ table: 'users', action: 'insert', payload: u }); const error = null; 
    
    if (error) {
        console.error("User Creation Error:", error);
        if (error.code === '23505') {
            // Handle unique constraint violations if they happen during upsert
            if (error.message.includes('mobile')) throw new Error("Mobile number already in use.");
            if (error.message.includes('name')) throw new Error("Username already in use.");
        }
        throw new Error("Failed to initialize user profile.");
    }

    invalidateCache(['suh_cache_users']); 
};

export const fetchUserHistory = async (userId: string) => {
    try {
        const orders = await dbReadProxy('orders', { userId }, { order: 'date.desc', limit: 50 });
        const txns = await dbReadProxy('transactions', { userId }, { order: 'date.desc', limit: 50 });
        return { orders: orders || [], transactions: txns || [] };
    } catch { return { orders: [], transactions: [] }; }
};
export const adminCancelOrder = async (orderId: string) => { 
     const oData = await dbReadProxy('orders', { id: orderId }); const o = oData?.[0]; 
     if(!o) throw new Error("Order not found"); 
     const uDataO = await dbReadProxy('users', { id: o.userId }); const u = uDataO?.[0];
    if(u) await adminDbProxy({ table: 'users', action: 'update', payload: { balance: safeFloat(u.balance + o.charge) }, match: { id: o.userId } });
    await adminDbProxy({ table: 'orders', action: 'update', payload: { status: OrderStatus.CANCELED }, match: { id: orderId } });
    await adminDbProxy({ table: 'transactions', action: 'insert', payload: { id: `ref_${Date.now()}`, userId: o.userId, amount: o.charge, type: 'REFUND', status: 'SUCCESS', method: 'ADMIN', date: getISTTime() } });
     invalidateCache(['suh_cache_orders', 'suh_cache_users']); 
};
export const manualFundUpdate = async (uid: string, amt: number, type: 'ADD'|'DEDUCT', reason: string): Promise<User> => { 
    const uData = await dbReadProxy('users', { id: uid }); const u = uData?.[0]; 
    if(!u) throw new Error("User not found"); 
    let newBal = type === 'ADD' ? u.balance + amt : u.balance - amt;
    const { data: updatedData } = await adminDbProxy({ table: 'users', action: 'update', payload: { balance: safeFloat(newBal) }, match: { id: uid } }); 
    await adminDbProxy({ table: 'transactions', action: 'insert', payload: { id: `adm_${Date.now()}`, userId: uid, amount: amt, type: type === 'ADD' ? 'DEPOSIT' : 'ADJUSTMENT', status: 'SUCCESS', method: 'ADMIN', utr: reason, date: getISTTime() } }); 
    invalidateCache(['suh_cache_users', 'suh_cache_transactions']); 
    return updatedData![0] as User;
};
export const revertTransaction = async (txId: string) => { 
    const txnData = await dbReadProxy('transactions', { id: txId }); const txn = txnData?.[0]; 
    if (!txn || txn.status !== 'SUCCESS') throw new Error("Invalid Txn");
    const uDataTxn = await dbReadProxy('users', { id: txn.userId }); const u = uDataTxn?.[0]; 
    if (txn.type === 'DEPOSIT') await adminDbProxy({ table: 'users', action: 'update', payload: { balance: safeFloat(u.balance - txn.amount) }, match: { id: txn.userId } });
    await adminDbProxy({ table: 'transactions', action: 'update', payload: { status: 'REVERTED' }, match: { id: txId } });
    invalidateCache(['suh_cache_users', 'suh_cache_transactions']); 
};