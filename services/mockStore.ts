
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

const checkRateLimit = (actionKey: string) => {
    const now = Date.now();
    if (now - (actionTimestamps[actionKey] || 0) < RATE_LIMIT_MS) throw new Error("Please wait a moment.");
    actionTimestamps[actionKey] = now;
};

const safeFloat = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
const isValidUrl = (s: string) => { try { const u = new URL(s); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } };
const getNumber = (val: any) => { const n = parseFloat(val); return isNaN(n) ? 0 : n; };

const handleSupabaseError = (error: any) => {
    console.error("Supabase Op Error:", error);
    throw new Error(error.message || "Database Error");
};

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
        const { data: itemsToRemove } = await supabase
            .from(table)
            .select('id')
            .eq('userId', userId)
            .order(dateField, { ascending: false })
            .range(limit, 1000); 
        
        if (itemsToRemove && itemsToRemove.length > 0) {
            const ids = itemsToRemove.map(i => i.id);
            await supabase.from(table).delete().in('id', ids);
        }
    } catch (e) {
        console.warn(`Cleanup failed for ${table}:`, e);
    }
};

export const performSystemCleanup = async () => {
    try {
        const now = Date.now();
        const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
        const { data: inactiveUsers } = await supabase.from('users').select('id').lt('lastLogin', sixtyDaysAgo);
        
        if (inactiveUsers && inactiveUsers.length > 0) {
            const ids = inactiveUsers.map(u => u.id);
            await supabase.from('orders').delete().in('userId', ids);
            await supabase.from('transactions').delete().in('userId', ids);
            await supabase.from('users').delete().in('id', ids);
        }

        const nowISO = new Date().toISOString();
        const { data: expiredCoupons } = await supabase.from('coupons').select('code').lt('expiryDate', nowISO).eq('isEnabled', true);
        if (expiredCoupons && expiredCoupons.length > 0) {
             const codes = expiredCoupons.map(c => c.code);
             await supabase.from('coupons').update({ isEnabled: false }).in('code', codes);
             invalidateCache(['suh_cache_coupons']);
        }
    } catch (e) { console.error("System Cleanup Failed", e); }
};

// --- PRICE CALCULATOR HELPER ---
export const calculateFinalPrice = (service: Service, config: GlobalConfig): number => {
    let price = service.rate;
    const marginPercent = service.customMarginPercent !== undefined && service.customMarginPercent !== null ? service.customMarginPercent : (config?.globalMarginPercent || 0);
    const marginFixed = service.customMarginFixed !== undefined && service.customMarginFixed !== null ? service.customMarginFixed : (config?.globalMarginFixed || 0);

    if (marginPercent) price += price * (marginPercent / 100);
    if (marginFixed) price += marginFixed;
    return safeFloat(price);
};

// --- SECURITY CHECKS ---
const checkUserSecurity = async (userId: string): Promise<User> => {
    const { data: user, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if (error || !user) throw new Error("User validation failed");
    
    if (user.isBanned) {
        if (!user.banExpires || new Date() < new Date(user.banExpires)) {
            throw new Error(`ACCOUNT BLOCKED: ${user.banReason || 'Security Violation'}`);
        } else {
             await supabase.from('users').update({ isBanned: false, banExpires: null }).eq('id', userId);
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
        let query = supabase.from(tableName).select('*');
        if (orderByField) query = query.order(orderByField, { ascending: false });
        if (tableName !== 'categories' && tableName !== 'services' && tableName !== 'coupons') query = query.limit(limitCount);

        const { data, error } = await query;
        if (error) throw error;
        
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
            const items = await fetchFresh<Coupon>('coupons', cacheKey, 'created_at', 100);
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
            const { data } = await supabase.from('settings').select('*').eq('id', 'global').single();
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

        const backendBase = getRenderBackendUrl();
        const urlObj = backendBase ? `${backendBase.replace(/\/$/, "")}/api/users/transfer-referral` : "/api/users/transfer-referral";
        
        const response = await fetch(urlObj, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Transfer failed");

        invalidateCache(['suh_cache_users', 'suh_cache_transactions']);
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('force_balance_update', { detail: { balance: data.newBalance } }));

        return data.newBalance;
    } catch (e: any) { throw new Error(e.message); }
};

export const getReferralStats = async (userId: string) => {
    try {
        // Get referrals
        const { count: totalReferrals } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('referred_by', userId);
        
        // Get commission earnings from transactions
        // Note: total_referral_earnings column in users table is the single source of truth for cumulative
        const { data: user } = await supabase.from('users').select('total_referral_earnings').eq('id', userId).single();
        
        // Count active spenders
        const { count: depositCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('referred_by', userId).gt('totalSpent', 0);

        // Get list of referred users for the table - LIMIT TO LAST 5 ONLY
        const { data: referredUsers } = await supabase
            .from('users')
            .select('id, name, created_at')
            .eq('referred_by', userId)
            .order('created_at', { ascending: false })
            .limit(5);

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
    try { await supabase.from('settings').upsert({ id: 'global', ...newConfig }); invalidateCache(['suh_cache_config']); } catch (e) { handleSupabaseError(e); }
};

// Helper to dynamically get Render Backend URL from local cache
const getRenderBackendUrl = (): string => {
    try {
        const cached = getFromCacheSync<GlobalConfig>('suh_cache_config');
        if (cached && cached.renderBackendUrl && cached.renderBackendUrl.trim() !== '') {
            return cached.renderBackendUrl.trim();
        }
    } catch (e) {
        console.warn("Could not retrieve cached backend URL:", e);
    }
    if (typeof window !== 'undefined') {
        const origin = window.location.origin.toLowerCase();
        if (origin.includes('socialuphub.in') || origin.includes('socialuphub-smm.web.app')) {
            return 'https://socialuphub-backend.onrender.com';
        }
        return window.location.origin;
    }
    return 'https://socialuphub-backend.onrender.com';
};

// --- UPDATED API CALLER USING SECURE BACKEND PROXY ---
const callSmmApi = async (params: URLSearchParams, retries = 2): Promise<any> => {
    try {
        const body: Record<string, string> = {};
        params.forEach((value, key) => {
            body[key] = value;
        });

        const backendBase = getRenderBackendUrl();
        const urlObj = backendBase ? `${backendBase.replace(/\/$/, "")}/api/smm` : "/api/smm";

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

export const createRazorpayOrder = async (amount: number, userId: string) => {
    const receipt = `rcpt_${Date.now()}_${userId.substring(0,4)}`;
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
        const { count: oCount } = await supabase.from('orders').select('*', { count: 'exact', head: true });
        const { count: uCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
        return { orders: oCount || 14000, users: uCount || 1200 };
    } catch { return { orders: 14000, users: 1200 }; }
};

// --- BACKGROUND ORDER PROCESSOR ---
// Global Queue Lock to prevent overlapping runs during slow network calls
let isQueueProcessing = false;

export const processOrderQueue = async () => {
    if (isQueueProcessing) return;
    isQueueProcessing = true;

    try {
        // 1. Fetch pending orders that have NOT been sent to provider (externalId is null)
        // We also skip orders that have a fatal error already logged
        const { data: pendingOrders } = await supabase.from('orders')
            .select('*')
            .eq('status', 'Pending')
            .is('externalId', null) 
            .is('error', null) // Only pick up orders that haven't failed yet
            .limit(5);

        if (!pendingOrders || pendingOrders.length === 0) {
            isQueueProcessing = false;
            return;
        }

        for (const order of pendingOrders) {
            try {
                // 2. Prepare API params
                const params = new URLSearchParams();
                params.append('action', 'add'); 
                params.append('service', order.serviceId); 
                params.append('link', order.link); 
                params.append('quantity', order.quantity.toString());

                // 3. Call API
                const res = await callSmmApi(params);

                // 4. Handle Result
                const providerOrderId = res.order || res.order_id;

                if (providerOrderId) {
                    await supabase.from('orders').update({ 
                        externalId: String(providerOrderId),
                        error: null // Clear any previous error
                    }).eq('id', order.id);
                } else if (res.error || res.errors) {
                    const errorMsg = String(res.error || (Array.isArray(res.errors) ? res.errors.join(', ') : res.errors)).toLowerCase();
                    
                    // SMART FIX: If provider says it's a duplicate, it might have been placed but we missed the ID
                    if (errorMsg.includes('duplicate') || errorMsg.includes('already exists')) {
                        console.log(`[Queue] Order ${order.id} reported as duplicate by provider. Attempting to find ID...`);
                        try {
                            const statusParams = new URLSearchParams({ action: 'orders' });
                            const providerOrders = await callSmmApi(statusParams);
                            
                            if (Array.isArray(providerOrders)) {
                                const match = providerOrders.find((po: any) => 
                                    String(po.link).trim() === String(order.link).trim() && 
                                    String(po.service) === String(order.serviceId)
                                );
                                
                                if (match && match.order) {
                                    console.log(`[Queue] Found matching provider order ${match.order} for duplicate ${order.id}`);
                                    await supabase.from('orders').update({ 
                                        externalId: String(match.order),
                                        status: normalizeStatus(match.status) || OrderStatus.PROCESSING,
                                        error: null
                                    }).eq('id', order.id);
                                    continue; 
                                }
                            }
                        } catch (e) {
                            console.warn("[Queue] Failed to auto-resolve duplicate order ID:", e);
                        }
                    }

                    // Handle fatal errors by keeping in pending for manual review
                    const isFatal = errorMsg.includes('link') || 
                                    errorMsg.includes('service') || 
                                    errorMsg.includes('quantity') || 
                                    errorMsg.includes('disabled') || 
                                    errorMsg.includes('not found') ||
                                    errorMsg.includes('invalid') ||
                                    errorMsg.includes('something went wrong');
                    
                    if (isFatal) {
                        console.warn(`[Queue] Order ${order.id} failed forwarding (Fatal): ${errorMsg}. Logging error for manual review.`);
                        await supabase.from('orders').update({ error: errorMsg }).eq('id', order.id);
                    } else {
                        // Temporary Error (e.g. balance, maintenance): Log it but don't set 'error' field so it retries
                        console.debug(`[Queue] Order ${order.id} waiting for provider: ${errorMsg}`);
                    }
                } else {
                    console.debug(`[Queue] Order ${order.id} waiting for provider acceptance.`);
                }
            } catch (e: any) {
                console.debug(`[Queue] Order ${order.id} network/proxy retry: ${e.message}`);
            }
        }
    } catch (err) {
        console.error("Queue processing error:", err);
    } finally {
        isQueueProcessing = false;
    }
};

export const placeOrder = async (userId: string, serviceId: string, serviceName: string, link: string, quantity: number, originalCost: number, couponCode?: string) => {
  checkRateLimit('place_order');
  if (!isValidUrl(link)) throw new Error("Invalid Link.");

  try {
      const user = await checkUserSecurity(userId);

      const { data: { session } } = await supabase.auth.getSession();
      const backendBase = getRenderBackendUrl();
      const urlObj = backendBase ? `${backendBase.replace(/\/$/, "")}/api/orders/place` : "/api/orders/place";
      
      const response = await fetch(urlObj, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ userId, serviceId, serviceName, link, quantity, originalCost, couponCode })
      });
      
      if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Order placement failed");
      }
      
      invalidateCache(['suh_cache_orders', 'suh_cache_users']);
      
      // Auto processing logic to queue the SMM api call
      if (typeof window !== 'undefined') {
          setTimeout(() => {
              processOrderQueue().catch(console.error);
          }, 100);
      }
  } catch (e: any) {
      console.error(`Order Failed: ${serviceId}`, e.message);
      throw e;
  }
};
export const handleRazorpaySuccess = async (userId: string, amount: number, paymentId: string, orderId?: string, signature?: string) => {
    try {
        const user = await checkUserSecurity(userId);

        if (orderId && signature) {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Authentication required for payment verification");

            const backendBase = getRenderBackendUrl();
            const urlObj = backendBase ? `${backendBase.replace(/\/$/, "")}/api/payments/verify` : "/api/payments/verify";

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
                    amount: amount
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Payment verification failed");
            }
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
export const addCategory = async (name: string, sort: number) => { await supabase.from('categories').insert({ id: `cat_${Date.now()}`, name, sortOrder: sort, isEnabled: true }); invalidateCache(['suh_cache_categories']); };
export const updateCategory = async (id: string, data: any) => { await supabase.from('categories').update(data).eq('id', id); invalidateCache(['suh_cache_categories']); };
export const deleteCategory = async (id: string) => { await supabase.from('categories').delete().eq('id', id); invalidateCache(['suh_cache_categories']); };
export const toggleCategoryWithServices = async (catId: string, catName: string, status: boolean) => {
    await Promise.all([
        supabase.from('categories').update({ isEnabled: status }).eq('id', catId),
        supabase.from('services').update({ isEnabled: status }).eq('category', catName)
    ]);
    invalidateCache(['suh_cache_categories', 'suh_cache_services']);
};
export const disableAllCategories = async () => {
    await supabase.from('categories').update({ isEnabled: false }).neq('id', 'PLACEHOLDER');
    await supabase.from('services').update({ isEnabled: false }).neq('service', 'PLACEHOLDER');
    invalidateCache(['suh_cache_categories', 'suh_cache_services']);
};
export const enableAllCategories = async () => {
    await supabase.from('categories').update({ isEnabled: true }).neq('id', 'PLACEHOLDER');
    await supabase.from('services').update({ isEnabled: true }).neq('service', 'PLACEHOLDER');
    invalidateCache(['suh_cache_categories', 'suh_cache_services']);
};
export const addService = async (s: Partial<Service>) => { 
    const { error } = await supabase.from('services').insert({
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
    });
    if (error) throw error;
    invalidateCache(['suh_cache_services']); 
};
export const updateService = async (s: Service) => { 
    const cleaned = {
        ...s,
        name: cleanSmmText(s.name),
        description: cleanSmmText(s.description)
    };
    await supabase.from('services').update(cleaned).eq('service', s.service); 
    invalidateCache(['suh_cache_services']); 
};
export const updateUser = async (u: User) => { const { balance, totalSpent, ...safeUpdate } = u; await supabase.from('users').update(safeUpdate).eq('id', u.id); invalidateCache(['suh_cache_users']); };
export const deleteUser = async (uid: string) => { await supabase.from('users').delete().eq('id', uid); invalidateCache(['suh_cache_users']); };

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
        const { data: activeOrders } = await supabase.from('orders')
            .select('*')
            .in('status', ['Pending', 'Processing']) // Only check unfinished orders
            .not('externalId', 'is', null) // Only check if provider ID exists (prevent repeat placement issues)
            .limit(20);

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
                            await supabase.from('orders').update(updates).eq('id', order.id);
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

export const createCoupon = async (c: Coupon) => { await supabase.from('coupons').insert(c); invalidateCache(['suh_cache_coupons']); };
export const deleteCoupon = async (code: string) => { await supabase.from('coupons').delete().eq('code', code); invalidateCache(['suh_cache_coupons']); };
export const toggleCouponStatus = async (code: string, s: boolean) => { await supabase.from('coupons').update({ isEnabled: !s }).eq('code', code); invalidateCache(['suh_cache_coupons']); };

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
            
            const { data: existingCats, error: fetchErr } = await supabase.from('categories').select('name').limit(1000);
            
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
                const { error: catError } = await supabase.from('categories').upsert(newCats, { onConflict: 'name', ignoreDuplicates: true });
                if(catError) console.error("Category Insert Error:", catError);
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
            
            await supabase.from('services').upsert(upserts, { onConflict: 'service' });
            
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

        const { data: localServices, error } = await supabase.from('services').select('service, rate');
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
            const { error: updateError } = await supabase.from('services').upsert(servicesToUpdate, { onConflict: 'service' });
            if (updateError) {
                console.error("[Price Sync] Failed to update prices:", updateError);
            } else {
                console.log(`[Price Sync] Updated ${servicesToUpdate.length} service prices.`);
                invalidateCache(['suh_cache_services']);
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

    const { data: cat } = await supabase.from('categories').select('*').eq('name', target.category).single();
    if (!cat) {
        await supabase.from('categories').upsert({
            id: `cat_auto_${target.category.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`,
            name: target.category,
            sortOrder: 999,
            isEnabled: true
        }, { onConflict: 'name', ignoreDuplicates: true });
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
    
    await supabase.from('services').upsert(s, { onConflict: 'service' });
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

        await supabase.from('services').delete().neq('service', 'PLACEHOLDER_SAFEGUARD'); 
        await supabase.from('categories').delete().neq('id', 'PLACEHOLDER_SAFEGUARD');
        
        const uniqueCategories = Array.from(new Set(data.map((s: any) => s.category))) as string[];
        const categoryInserts = uniqueCategories.map((catName, index) => ({
            id: `cat_${Date.now()}_${index}`,
            name: catName,
            sortOrder: (index + 1) * 10,
            isEnabled: true
        }));
        await supabase.from('categories').insert(categoryInserts);

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
            await supabase.from('services').insert(chunk);
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

        await supabase.from('categories').delete().neq('id', 'PLACEHOLDER_SAFEGUARD');
        
        const uniqueCategories = Array.from(new Set(data.map((s: any) => s.category))) as string[];
        const categoryInserts = uniqueCategories.map((catName, index) => ({
            id: `cat_${Date.now()}_${index}`,
            name: catName,
            sortOrder: (index + 1) * 10,
            isEnabled: true,
            isPinned: false
        }));
        await supabase.from('categories').insert(categoryInserts);
        
        invalidateCache(['suh_cache_categories']);
        return categoryInserts.length;
    } catch (e: any) { 
        console.error("Category Hard Sync Failed:", e);
        throw e; 
    }
};

export const getProviderServices = async () => { try { const params = new URLSearchParams({ action: 'services' }); return await callSmmApi(params); } catch { return []; } };
export const checkSingleOrderApiStatus = async (oid: string) => { 
    const { data: order } = await supabase.from('orders').select('externalId').eq('id', oid).single();
    if(!order?.externalId) return "No External ID";
    const params = new URLSearchParams({ action: 'status', order: order.externalId });
    const res = await callSmmApi(params);
    if(res.status) {
        await updateOrderStatus(oid, res.status);
        if(res.remains) await supabase.from('orders').update({ remains: res.remains }).eq('id', oid);
        return res.status;
    }
    return "Error";
};
export const updateUserPassword = async (oldP: string, newP: string) => { const { error } = await supabase.auth.updateUser({ password: newP }); if (error) throw new Error(error.message); };
export const updateUserEmailSafe = async (oldE: string, newE: string) => { const { error } = await supabase.auth.updateUser({ email: newE }); if (error) throw new Error(error.message); await supabase.from('users').update({ email: newE }).eq('email', oldE); };
export const fetchServices = (): Service[] => []; 
export const fetchUsers = (): User[] => []; 
export const fetchOrders = (): Order[] => []; 
export const fetchTransactions = (): Transaction[] => []; 
export const fetchCoupons = (): Coupon[] => []; 
export const fetchCategories = (): Category[] => [];
export const fetchPaymentSessions = (): PaymentSession[] => [];
export const getConfig = (): GlobalConfig => initialConfig;
export const updateOrderExternalId = async (oid: string, eid: string) => { await supabase.from('orders').update({ externalId: eid }).eq('id', oid); invalidateCache(['suh_cache_orders']); };
export const updateOrderDetails = async (oid: string, updates: Partial<Order>) => { await supabase.from('orders').update(updates).eq('id', oid); invalidateCache(['suh_cache_orders']); };
export const updateOrderStatus = async (oid: string, s: OrderStatus) => { await supabase.from('orders').update({ status: s }).eq('id', oid); invalidateCache(['suh_cache_orders']); };
export const disableAllServices = async () => { await supabase.from('services').update({ isEnabled: false }).neq('service', '0'); invalidateCache(['suh_cache_services']); };
export const enableAllServices = async () => { await supabase.from('services').update({ isEnabled: true }).neq('service', '0'); invalidateCache(['suh_cache_services']); };
export const deleteService = async (id: string) => { await supabase.from('services').delete().eq('service', id); invalidateCache(['suh_cache_services']); };
export const activateServiceById = async (id: string) => { await supabase.from('services').update({ isEnabled: true }).eq('service', id); invalidateCache(['suh_cache_services']); };
export const syncCategoriesFromDB = async () => 0;

export const startAutoSync = () => { 
    // Automation is fully offloaded to the server-side hosted backend.
    return () => {}; 
}
export const checkUsernameUnique = async (n: string) => { 
    try {
        const backendBase = getRenderBackendUrl();
        const urlObj = `${backendBase.replace(/\/$/, "")}/api/auth/lookup`;
        const response = await fetch(urlObj, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'checkUsernameUnique', value: n })
        });
        if (!response.ok) return true;
        const resData = await response.json();
        return resData.unique ?? true;
    } catch (e) {
        return true; // Assume unique on error to let DB handle it
    }
};
export const checkMobileUnique = async (m: string) => { 
    if (!m) return true;
    try {
        const backendBase = getRenderBackendUrl();
        const urlObj = `${backendBase.replace(/\/$/, "")}/api/auth/lookup`;
        const response = await fetch(urlObj, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'checkMobileUnique', value: m })
        });
        if (!response.ok) return true;
        const resData = await response.json();
        return resData.unique ?? true;
    } catch (e) {
        return true;
    }
};
export const getEmailByMobile = async (m: string) => { 
    try {
        const backendBase = getRenderBackendUrl();
        const urlObj = `${backendBase.replace(/\/$/, "")}/api/auth/lookup`;
        const response = await fetch(urlObj, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'getEmailByMobile', value: m })
        });
        if (!response.ok) return null;
        const resData = await response.json();
        return resData.email;
    } catch (e) {
        console.error("getEmailByMobile failed:", e);
        return null;
    }
};

// FIXED CREATE USER DOC FUNCTION
// This function is now a "Sync/Update Profile" function.
// It relies on the Database Trigger to create the initial user row.
// It only updates specific fields if they are different, or falls back to insert if trigger failed.
export const createUserDoc = async (uid: string, email: string, name: string, mobile: string, referredByCode?: string) => { 
    
    const { data: existingUser } = await supabase.from('users').select('*').eq('id', uid).single();

    if (existingUser) {
        // Only update if name/mobile is provided (e.g. from a manual register step)
        const updates: any = { lastLogin: getISTTime() };
        if (name && !existingUser.name) updates.name = name;
        if (mobile && !existingUser.mobile) updates.mobile = mobile;

        await supabase.from('users').update(updates).eq('id', uid);
        invalidateCache(['suh_cache_users']);
        return;
    }

    console.warn("User doc not found. Creating profile for:", email);

    const referralCode = `U${uid.substring(0,4)}${Math.floor(Math.random()*99999)}`.toUpperCase();
    let referrerId = null;

    if (referredByCode) {
        const { data: refUser } = await supabase.from('users').select('id').eq('referral_code', referredByCode.toUpperCase()).single();
        if (refUser) referrerId = refUser.id;
    }

    let finalName = name || email.split('@')[0] || "User";
    try {
        const { data: nameCheck } = await supabase.from('users').select('id').eq('name', finalName).single();
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

    const { error } = await supabase.from('users').upsert(u, { onConflict: 'id' }); 
    
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
        const { data: orders } = await supabase.from('orders').select('*').eq('userId', userId).order('date', {ascending: false}).limit(50);
        const { data: txns } = await supabase.from('transactions').select('*').eq('userId', userId).order('date', {ascending: false}).limit(50);
        return { orders: orders || [], transactions: txns || [] };
    } catch { return { orders: [], transactions: [] }; }
};
export const adminCancelOrder = async (orderId: string) => { 
    const { data: o } = await supabase.from('orders').select('*').eq('id', orderId).single(); 
    if(!o) throw new Error("Order not found"); 
    const { data: u } = await supabase.from('users').select('*').eq('id', o.userId).single();
    if(u) await supabase.from('users').update({ balance: safeFloat(u.balance + o.charge) }).eq('id', o.userId);
    await supabase.from('orders').update({ status: OrderStatus.CANCELED }).eq('id', orderId); 
    await supabase.from('transactions').insert({ id: `ref_${Date.now()}`, userId: o.userId, amount: o.charge, type: 'REFUND', status: 'SUCCESS', method: 'ADMIN', date: getISTTime() }); 
    invalidateCache(['suh_cache_orders', 'suh_cache_users']); 
};
export const manualFundUpdate = async (uid: string, amt: number, type: 'ADD'|'DEDUCT', reason: string): Promise<User> => { 
    const { data: u } = await supabase.from('users').select('*').eq('id', uid).single(); 
    if(!u) throw new Error("User not found"); 
    let newBal = type === 'ADD' ? u.balance + amt : u.balance - amt;
    const { data: updatedData } = await supabase.from('users').update({ balance: safeFloat(newBal) }).eq('id', uid).select(); 
    await supabase.from('transactions').insert({ id: `adm_${Date.now()}`, userId: uid, amount: amt, type: type === 'ADD' ? 'DEPOSIT' : 'ADJUSTMENT', status: 'SUCCESS', method: 'ADMIN', utr: reason, date: getISTTime() }); 
    invalidateCache(['suh_cache_users', 'suh_cache_transactions']); 
    return updatedData![0] as User;
};
export const revertTransaction = async (txId: string) => { 
    const { data: txn } = await supabase.from('transactions').select('*').eq('id', txId).single(); 
    if (!txn || txn.status !== 'SUCCESS') throw new Error("Invalid Txn");
    const { data: u } = await supabase.from('users').select('*').eq('id', txn.userId).single(); 
    if (txn.type === 'DEPOSIT') await supabase.from('users').update({ balance: safeFloat(u.balance - txn.amount) }).eq('id', txn.userId);
    await supabase.from('transactions').update({ status: 'REVERTED' }).eq('id', txId);
    invalidateCache(['suh_cache_users', 'suh_cache_transactions']); 
};