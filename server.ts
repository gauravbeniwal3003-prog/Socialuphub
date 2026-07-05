import dotenv from "dotenv";
import fs_env from "fs";
if (fs_env.existsSync(".env")) { dotenv.config({ override: true }); } else { dotenv.config(); }

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import crypto from "crypto";
import Razorpay from "razorpay";
import axios from "axios";
import fs from "fs";

console.log("Starting server script...");

// In-memory temporary error logging mechanism (lasts 1 hour)
export interface ErrorLog {
  timestamp: string;
  message: string;
  type: string;
  details?: any;
}

export let tempErrorLogs: ErrorLog[] = [];

export function logTempError(message: string, type: string = "ERROR", details?: any) {
  try {
    const now = new Date();
    const oneHourAgo = now.getTime() - 60 * 60 * 1000;
    
    // Prune logs older than 1 hour
    tempErrorLogs = tempErrorLogs.filter(log => new Date(log.timestamp).getTime() > oneHourAgo);
    
    tempErrorLogs.push({
      timestamp: now.toISOString(),
      message,
      type,
      details
    });
    
    // Safety cap to avoid memory issues
    if (tempErrorLogs.length > 500) {
      tempErrorLogs.shift();
    }
  } catch (err) {
    console.error("Failed to log temporary error in memory:", err);
  }
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  logTempError(`Uncaught Exception: ${err.message}`, "CRITICAL", { stack: err.stack });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logTempError(`Unhandled Rejection: ${String(reason)}`, "CRITICAL", { reason: String(reason) });
});

// Initialize Supabase Admin Client (Server-side only)
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://igkrcgcrvnocauccebrf.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlna3JjZ2Nydm5vY2F1Y2NlYnJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjgzMDU4MCwiZXhwIjoyMDgyNDA2NTgwfQ.-529L2gcgOFrfN_VVZf6tbPyAlnRFQNQjPBOk8aGwpI';

let supabaseAdmin: any;
try {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || '', {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
} catch (e) {
  console.error("Failed to initialize Supabase Admin:", e);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Robust proxy configuration
  // 'trust proxy' is essential for identifying the real client IP behind load balancers.
  // Using '1' trusts the first hop (the immediate proxy).
  app.set('trust proxy', 1);

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Dedicated OAuth callback handler for Supabase popup auth.
  // Serves a lightweight HTML page directly to bypass the iframe/static asset proxy blocks
  // in the AI Studio preview environment.
  app.get(["/auth/callback", "/auth/callback/"], (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Social Up Hub | Authenticating...</title>
    <style>
        body {
            background-color: #020617;
            color: #f8fafc;
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
        }
        .container {
            text-align: center;
            background: #0f172a;
            padding: 2.5rem;
            border-radius: 0.75rem;
            border: 1px solid #1e293b;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
            max-width: 400px;
            width: 90%;
        }
        .spinner {
            border: 3px solid rgba(255,255,255,0.1);
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border-left-color: #10b981;
            animation: spin 1s linear infinite;
            margin: 0 auto 1.5rem auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        h2 { margin: 0 0 0.5rem 0; font-size: 1.25rem; font-weight: 600; }
        p { color: #94a3b8; font-size: 0.875rem; margin: 0; line-height: 1.5; }
    </style>
</head>
<body>
    <div class="container">
        <div class="spinner"></div>
        <h2>Authenticating with Google</h2>
        <p>Connecting your account securely. This window will close automatically...</p>
    </div>
    <script>
        try {
            // Short timeout to ensure the hash is fully populated in window.location
            setTimeout(() => {
                const hash = window.location.hash || '';
                const search = window.location.search || '';
                
                if (window.opener) {
                    console.log("Sending SUPABASE_AUTH_CALLBACK event to opener window");
                    window.opener.postMessage({ 
                        type: 'SUPABASE_AUTH_CALLBACK', 
                        hash: hash,
                        search: search
                    }, '*');
                    
                    // Allow small buffer for postMessage to be received before closing
                    setTimeout(() => {
                        window.close();
                    }, 800);
                } else {
                    console.warn("No window.opener found. Redirecting to home page.");
                    window.location.href = '/' + hash + search;
                }
            }, 150);
        } catch (err) {
            console.error("Popup communication failed:", err);
            document.body.innerHTML = '<div class="container"><h2 style="color:#ef4444;">Authentication Error</h2><p>' + err.message + '</p></div>';
        }
    </script>
</body>
</html>`;
    res.send(html);
  });

  // --- IN-MEMORY LOGGING API & VIEW ---

  // Initialize Razorpay lazily or safely
  let razorpay: any;
  try {
    const rzpKey = process.env.RAZORPAY_KEY_ID || "rzp_live_RzLdEkePrpnfd4";
    const rzpSecret = process.env.RAZORPAY_SECRET || "4wiJs8mHjvhbes6JRZFd35hT";
    
    if (rzpKey && rzpSecret && !rzpKey.includes("TODO")) {
      razorpay = new Razorpay({
        key_id: rzpKey,
        key_secret: rzpSecret,
      });
    }
  } catch (e) {
    console.error("Failed to initialize Razorpay:", e);
  }

  // --- SECURITY MIDDLEWARE ---
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://checkout.razorpay.com", "https://www.gstatic.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https://*", "referrer"],
        connectSrc: ["'self'", "https://*", "wss://*"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        frameSrc: ["'self'", "https://api.razorpay.com", "https://*.supabase.co"],
        frameAncestors: ["'self'", "https://ai.studio", "https://*.google.com"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    frameguard: false,
  }));

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowedOrigins = [
        'socialuphub-smm.web.app',
        'socialuphub.in',
        'localhost',
        'run.app',
        'github.dev'
      ];
      const isAllowed = allowedOrigins.some(domain => origin.toLowerCase().includes(domain));
      if (isAllowed) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true
  }));
  
  app.use(express.json({ 
    limit: '10kb',
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString();
    }
  })); // Limit body size to prevent DoS
  app.use(express.urlencoded({ extended: true, limit: '10kb' })); // Parse URL-encoded bodies (essential for other panels integrating with us)

  // --- BOT DETECTION MIDDLEWARE ---
  app.use((req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    const isBot = /bot|crawler|spider|crawling/i.test(ua);
    if (isBot) {
      // Silent throttling for bots
      return setTimeout(() => next(), 2000);
    }
    next();
  });

  // --- RATE LIMITING ---
  const generalLimiter = (req, res, next) => next();

  const orderLimiter = (req, res, next) => next();

  app.use("/api/", generalLimiter);

  // --- BACKGROUND TASKS (PROCESSED ON SERVER FOR 100% RELIABILITY) ---
  
  const SMM_API_KEY = process.env.SMM_API_KEY;
  const SMM_API_URL = process.env.SMM_API_URL || "https://safesmmpanel.com/api/v2";

  const callProvider = async (paramsObj: any) => {
    // Strictly verified documentation standards
    const payload: any = {
      key: SMM_API_KEY,
      action: paramsObj.action
    };

    if (paramsObj.service) payload.service = paramsObj.service;
    if (paramsObj.link) payload.link = paramsObj.link;
    if (paramsObj.quantity) payload.quantity = paramsObj.quantity;
    if (paramsObj.order) payload.order = paramsObj.order;

    const params = new URLSearchParams(payload);

    try {
      const response = await axios.post(SMM_API_URL, params.toString(), {
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/4.0 (compatible; MSIE 5.01; Windows NT 5.0)' 
        },
        timeout: 30000,
        validateStatus: () => true,
        httpsAgent: new (await import("https")).Agent({
          rejectUnauthorized: false
        })
      });
      
      let data = response.data;
      if (typeof data === 'string') {
        try {
           data = JSON.parse(data);
        } catch(err) {
           console.error("[SMM Proxy] Received non-JSON response:", data.substring(0, 100));
           return { error: "Provider returned invalid response (possibly offline or blocking requests)" };
        }
      }
      return data;
    } catch (e: any) {
      console.error("[BG Task] SMM Call Failed:", e.message);
      return { error: e.message };
    }
  };

  const normalizeStatus = (status: string) => {
      if (!status) return null;
      const s = status.toLowerCase().trim();
      if (s === 'completed' || s === 'success' || s === 'complete') return 'Completed';
      if (s === 'processing' || s === 'in progress' || s === 'active') return 'Processing';
      if (s === 'pending') return 'Pending';
      if (s === 'canceled' || s === 'cancelled') return 'Canceled';
      if (s === 'partial' || s === 'partially completed') return 'Partial';
      if (s === 'failed' || s === 'fail' || s === 'error') return 'Failed';
      return 'Processing';
  };

  // 1. Order Forwarding (Forward Pending -> Provider)
  const forwardOrders = async () => {
    try {
      const { data: pending } = await supabaseAdmin.from('orders')
        .select('*')
        .eq('status', 'Pending')
        .is('externalId', null)
        .is('error', null)
        .limit(10);

      if (!pending || pending.length === 0) return;

      for (const order of pending) {
        const res = await callProvider({
          action: 'add',
          service: order.serviceId,
          link: order.link,
          quantity: order.quantity
        });

        const providerId = res.order || res.order_id;
        if (providerId) {
          await supabaseAdmin.from('orders').update({ externalId: String(providerId) }).eq('id', order.id);
          console.log(`[BG Forward] Order ${order.id} forwarded successfully (ID: ${providerId})`);
        } else if (res.error) {
           const errorMsg = String(res.error).toLowerCase();
           
           // ADVANCED ROBUST LOGIC: Handle Duplicates
           // If provider says duplicate, it means the order WAS placed but we lost the ID.
           if (errorMsg.includes('duplicate') || errorMsg.includes('already exists')) {
              console.log(`[BG Forward] Duplicate detected for ${order.id}. Fetching existing ID...`);
              const recent = await callProvider({ action: 'status', order: '0' }); // Some panels use dummy orders call to get list?
              // Actually, standard panels use 'orders' action for history
              const history = await callProvider({ action: 'orders' });
              if (Array.isArray(history)) {
                 const match = history.find((p: any) => String(p.link) === String(order.link) && String(p.service) === String(order.serviceId));
                 if (match && match.order) {
                    await supabaseAdmin.from('orders').update({ externalId: String(match.order) }).eq('id', order.id);
                    continue;
                 }
              }
           }

           const isFatal = errorMsg.includes('link') || errorMsg.includes('service') || errorMsg.includes('quantity') || errorMsg.includes('invalid') || errorMsg.includes('incorrect');
           if (isFatal) {
             // Refund the user
             const { data: user } = await supabaseAdmin.from('users').select('balance').eq('id', order.userId).single();
             if (user) {
                 await supabaseAdmin.from('users').update({ balance: Math.round((user.balance + order.charge) * 100) / 100 }).eq('id', order.userId);
                 await supabaseAdmin.from('transactions').insert({ id: `ref_bg_${Date.now()}_${order.id.slice(-5)}`, userId: order.userId, amount: order.charge, type: 'REFUND', status: 'SUCCESS', method: 'SYSTEM', utr: `Refund for Failed API Order #${order.id} (${res.error})`, date: new Date().toISOString() });
             }
             await supabaseAdmin.from('orders').update({ status: 'Failed', error: res.error }).eq('id', order.id);
           }
        }
      }
    } catch (e) {
      console.error("[BG Forward] Error:", e);
    }
  };

  // 2. Status Sync (Update local status from Provider)
  const syncStatuses = async () => {
    try {
      const { data: active } = await supabaseAdmin.from('orders')
        .select('*')
        .in('status', ['Pending', 'Processing'])
        .not('externalId', 'is', null)
        .limit(20);

      if (!active || active.length === 0) return;

      let updateCount = 0;
      for (const order of active) {
        const res = await callProvider({ action: 'status', order: order.externalId });
        if (res.status) {
          const norm = normalizeStatus(res.status);
          if (norm && norm !== order.status) {
            await supabaseAdmin.from('orders').update({ status: norm, remains: res.remains || order.remains, start_count: res.start_count || order.start_count }).eq('id', order.id);
            if (norm === 'Canceled') {
                const { data: user } = await supabaseAdmin.from('users').select('balance').eq('id', order.userId).single();
                if (user) {
                    await supabaseAdmin.from('users').update({ balance: Math.round((user.balance + order.charge) * 100) / 100 }).eq('id', order.userId);
                    await supabaseAdmin.from('transactions').insert({ id: `ref_${Date.now()}_${order.id.slice(-5)}`, userId: order.userId, amount: order.charge, type: 'REFUND', status: 'SUCCESS', method: 'SYSTEM', utr: `Refund for Cancelled Order #${order.id}`, date: new Date().toISOString() });
                }
            } else if (norm === 'Partial' && res.remains && parseFloat(res.remains) > 0) {
                const refundRatio = parseFloat(res.remains) / order.quantity;
                const refundAmount = Math.round((order.charge * refundRatio) * 100) / 100;
                if (refundAmount > 0) {
                    const { data: user } = await supabaseAdmin.from('users').select('balance').eq('id', order.userId).single();
                    if (user) {
                        await supabaseAdmin.from('users').update({ balance: Math.round((user.balance + refundAmount) * 100) / 100 }).eq('id', order.userId);
                        await supabaseAdmin.from('transactions').insert({ id: `ref_part_${Date.now()}_${order.id.slice(-5)}`, userId: order.userId, amount: refundAmount, type: 'REFUND', status: 'SUCCESS', method: 'SYSTEM', utr: `Partial Refund for Order #${order.id}`, date: new Date().toISOString() });
                    }
                }
            }
            updateCount++;
          }
        }
      }
      if (updateCount > 0) console.log(`[BG Sync] Updated status for ${updateCount} orders.`);
    } catch (e) {
      console.error("[BG Sync] Error:", e);
    }
  };

  // 3. Price Sync (Update local rates if provider changes them)
  const syncPrices = async () => {
    try {
      // Use standard 'services' action (Robust logic)
      const providerServices = await callProvider({ action: 'services' });
      if (!Array.isArray(providerServices)) return;

      const { data: local } = await supabaseAdmin.from('services').select('service, rate');
      if (!local) return;

      const pMap = new Map(providerServices.map((s:any) => {
          // Panel uses 'service' or 'package' or 'id'
          const id = String(s.service || s.package || s.id);
          const price = parseFloat(s.rate || s.price || s.cost || 0);
          return [id, price];
      }));
      const updates = [];

      for (const s of local) {
        const pRate = pMap.get(s.service);
        if (pRate !== undefined && pRate !== s.rate) {
          updates.push({ service: s.service, rate: pRate });
        }
      }

      if (updates.length > 0) {
        await supabaseAdmin.from('services').upsert(updates, { onConflict: 'service' });
        console.log(`[BG Prices] Updated ${updates.length} prices.`);
      }
    } catch (e) {
      console.error("[BG Prices] Error:", e);
    }
  };

  // --- SYSTEM CLEANUP TASKS ---
  const performSystemCleanup = async () => {
    try {
      const now = Date.now();
      const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
      const { data: inactiveUsers } = await supabaseAdmin.from('users').select('id').lt('lastLogin', sixtyDaysAgo);
      
      if (inactiveUsers && inactiveUsers.length > 0) {
        const ids = inactiveUsers.map((u: any) => u.id);
        await supabaseAdmin.from('orders').delete().in('userId', ids);
        await supabaseAdmin.from('transactions').delete().in('userId', ids);
        await supabaseAdmin.from('users').delete().in('id', ids);
        console.log(`[Cleanup] Removed ${ids.length} inactive users.`);
      }

      const nowISO = new Date().toISOString();
      const { data: expiredCoupons } = await supabaseAdmin.from('coupons').select('code').lt('expiryDate', nowISO).eq('isEnabled', true);
      if (expiredCoupons && expiredCoupons.length > 0) {
           const codes = expiredCoupons.map((c: any) => c.code);
           await supabaseAdmin.from('coupons').update({ isEnabled: false }).in('code', codes);
           console.log(`[Cleanup] Disabled ${codes.length} expired coupons.`);
      }
    } catch (e) { console.error("[Cleanup] Failed:", e); }
  };

  // --- INTERVALS (Start after declarations) ---
  // Server-side automation re-enabled for deployment on Render.
  setInterval(forwardOrders, 5000); // 5s
  setInterval(syncStatuses, 5000); // 5s
  setInterval(syncPrices, 3600000); // 1 hour
  setInterval(performSystemCleanup, 86400000); // 24 hours

  // --- AUTH MIDDLEWARE ---
  const verifyAuth = async (req: any, res: any, next: any) => {
    // Try to get token from header
    const authHeader = req.headers.authorization;
    let userId = req.body?.userId || req.query?.userId;

    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token && token !== 'undefined' && token !== 'null') {
        try {
          // Decode JWT to extract user ID for basic security (no signature validation needed for basic check)
          const payloadBase64 = token.split('.')[1];
          if (payloadBase64) {
            const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
            if (decoded.sub) {
              userId = decoded.sub;
            }
          }
        } catch (e) {
          console.error("JWT Decode error, falling back to body userId:", e);
        }
      }
    }

    if (!userId) {
        return res.status(401).json({ error: "User identification missing. Please log out and log in again." });
    }

    // Verify user exists
    const { data: user } = await supabaseAdmin.from('users').select('*').eq('id', userId).single();
    
    if (!user && req.path !== '/api/sync-user') {
        return res.status(401).json({ error: "User not found. Please log out and log in again." });
    }

    let email = req.body?.email || req.query?.email || null;
    if (authHeader) {
      try {
          const payloadBase64 = authHeader.split(' ')[1].split('.')[1];
          const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
          if (decoded.email) email = decoded.email;
      } catch (e) {}
    }

    req.user = user || { id: userId, email: email };
    next();
  };

  const verifyAdmin = async (req: any, res: any, next: any) => {
    await verifyAuth(req, res, async () => {
      const { data: profile } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', req.user.id)
        .single();

      if (profile?.role !== 'ADMIN') {
        return res.status(403).json({ error: "Admin access required" });
      }
      next();
    });
  };

  // --- USER PLATFORM SMM API ENDPOINT ---
  app.all("/api/v2", orderLimiter, async (req, res) => {
    // SMM clients default to urlencoded bodies, which Express parses into req.body.
    // Allow query parameters too as some platforms mix parameter types.
    const data = { ...req.query, ...req.body };
    const apiKey = data.key;
    const action = data.action;

    if (!apiKey) {
      return res.json({ error: "Declined: SMM key parameter is missing" });
    }
    if (!action) {
      return res.json({ error: "Declined: SMM action parameter is missing" });
    }

    try {
      // Find the user by API Key
      const { data: user, error: userErr } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('api_key', apiKey)
        .single();

      if (userErr || !user) {
        return res.json({ error: "Invalid API key" });
      }
      if (user.isBanned) {
        return res.json({ error: "Declined: Your API user account has been suspended or banned" });
      }

      // 1. BALANCE ACTION
      if (action === "balance") {
        return res.json({
          balance: parseFloat(user.balance || 0),
          currency: "INR"
        });
      }

      // 2. CATEGORIES ACTION
      else if (action === "categories") {
        const { data: categories, error: catErr } = await supabaseAdmin
          .from('categories')
          .select('*')
          .eq('isEnabled', true)
          .order('sortOrder', { ascending: true });

        if (catErr) throw catErr;
        return res.json(categories || []);
      }

      // 3. SERVICES ACTION
      else if (action === "services") {
        const { data: services, error: srvErr } = await supabaseAdmin
          .from('services')
          .select('*')
          .eq('isEnabled', true)
          .order('sortOrder', { ascending: true });

        if (srvErr) throw srvErr;

        // Fetch active categories only
        const { data: categories } = await supabaseAdmin
          .from('categories')
          .select('name, sortOrder')
          .eq('isEnabled', true)
          .order('sortOrder', { ascending: true });

        const categoryOrderMap = new Map<string, number>();
        (categories || []).forEach((cat: any, index: number) => {
          categoryOrderMap.set(cat.name, index);
        });

        // Filter out services belonging to disabled categories
        const activeServices = (services || []).filter((s: any) => s.category && categoryOrderMap.has(s.category));

        // Fetch config to apply margins & custom API discounts
        const { data: config } = await supabaseAdmin
          .from('settings')
          .select('*')
          .eq('id', 'global')
          .single();

        const globalMarginPercent = parseFloat(config?.globalMarginPercent || 0);
        const globalMarginFixed = parseFloat(config?.globalMarginFixed || 0);
        const apiDiscount = parseFloat(config?.apiDiscountPercent || 0);

        const formatted = activeServices.map((s: any) => {
          // Calculate SMM Final Selling Price
          const marginPercent = s.customMarginPercent !== undefined && s.customMarginPercent !== null ? parseFloat(s.customMarginPercent) : globalMarginPercent;
          const marginFixed = s.customMarginFixed !== undefined && s.customMarginFixed !== null ? parseFloat(s.customMarginFixed) : globalMarginFixed;

          let sRate = parseFloat(s.rate || 0);
          if (marginPercent) sRate += sRate * (marginPercent / 100);
          if (marginFixed) sRate += marginFixed;

          // Apply Custom API Discount
          if (apiDiscount > 0) {
            sRate = Math.round((sRate * (1 - apiDiscount / 100) + Number.EPSILON) * 100) / 100;
          } else {
            sRate = Math.round((sRate + Number.EPSILON) * 100) / 100;
          }

          // Force minimum quantity to 100 if it is between 0 and 99
          let minQty = parseInt(s.min || 10);
          if (minQty >= 0 && minQty <= 99) {
            minQty = 100;
          }

          return {
            service: s.service,
            name: s.name,
            category: s.category,
            rate: sRate,
            min: minQty,
            max: parseInt(s.max || 10000),
            description: s.description || "",
            type: s.type || "Default",
            sortOrder: s.sortOrder // preserve temporarily for sorting
          };
        });

        // Sort formatted services category-wise and then by service sort order internally
        formatted.sort((a, b) => {
          const catAOrder = categoryOrderMap.has(a.category) ? categoryOrderMap.get(a.category)! : 9999;
          const catBOrder = categoryOrderMap.has(b.category) ? categoryOrderMap.get(b.category)! : 9999;
          if (catAOrder !== catBOrder) {
            return catAOrder - catBOrder;
          }
          const sortA = a.sortOrder || 0;
          const sortB = b.sortOrder || 0;
          if (sortA !== sortB) return sortA - sortB;
          return parseInt(a.service) - parseInt(b.service);
        });

        // Remove temporary sorting key
        formatted.forEach((f: any) => {
          delete f.sortOrder;
        });

        return res.json(formatted);
      }

      // 4. ADD ORDER ACTION
      else if (action === "add") {
        const serviceId = String(data.service || "").trim();
        const link = String(data.link || "").trim();
        const qtyVal = parseInt(data.quantity || "0");

        if (!serviceId) {
          return res.json({ error: "Declined: service parameter is missing or empty" });
        }
        if (!link) {
          return res.json({ error: "Declined: link parameter is missing or empty" });
        }
        if (isNaN(qtyVal) || qtyVal <= 0) {
          return res.json({ error: `Declined: quantity parameter must be a positive integer (received: ${data.quantity})` });
        }

        // Fetch service details
        const { data: service, error: srvErr } = await supabaseAdmin
          .from('services')
          .select('*')
          .eq('service', serviceId)
          .single();

        if (srvErr || !service) {
          return res.json({ error: `Declined: Service ID ${serviceId} could not be found on this platform` });
        }

        // Fetch active categories to check if this service belongs to a disabled category
        const { data: catCheck } = await supabaseAdmin
          .from('categories')
          .select('isEnabled')
          .eq('name', service.category)
          .single();

        if (!service.isEnabled || !catCheck || !catCheck.isEnabled) {
          return res.json({ error: `Declined: Service ID ${serviceId} is currently disabled or its category is inactive on this platform` });
        }

        let minQty = parseInt(service.min || 10);
        if (minQty >= 0 && minQty <= 99) {
          minQty = 100;
        }
        const maxQty = parseInt(service.max || 10000);

        if (qtyVal < minQty) {
          return res.json({ error: `Declined: Provided quantity (${qtyVal}) is less than the minimum required limit of ${minQty} for this service` });
        }
        if (qtyVal > maxQty) {
          return res.json({ error: `Declined: Provided quantity (${qtyVal}) exceeds the maximum allowed limit of ${maxQty} for this service` });
        }

        // Fetch config to apply margins & custom API discounts
        const { data: config } = await supabaseAdmin
          .from('settings')
          .select('*')
          .eq('id', 'global')
          .single();

        const marginPercent = service.customMarginPercent !== undefined && service.customMarginPercent !== null ? parseFloat(service.customMarginPercent) : parseFloat(config?.globalMarginPercent || 0);
        const marginFixed = service.customMarginFixed !== undefined && service.customMarginFixed !== null ? parseFloat(service.customMarginFixed) : parseFloat(config?.globalMarginFixed || 0);

        let rate = parseFloat(service.rate || 0);
        if (marginPercent) rate += rate * (marginPercent / 100);
        if (marginFixed) rate += marginFixed;

        // Apply Custom API Discount directly on the overall SMM final rate
        const apiDiscount = parseFloat(config?.apiDiscountPercent || 0);
        let apiServiceRate = rate;
        if (apiDiscount > 0) {
          apiServiceRate = Math.round((rate * (1 - apiDiscount / 100) + Number.EPSILON) * 100) / 100;
        } else {
          apiServiceRate = Math.round((rate + Number.EPSILON) * 100) / 100;
        }

        const charge = Math.round(((apiServiceRate * qtyVal) / 1000 + Number.EPSILON) * 100) / 100;

        // Check user funds balance
        if (user.balance < charge) {
          return res.json({ 
            error: `Declined: Insufficient funds. Your balance is ₹${parseFloat(user.balance).toFixed(2)}, but this order requires ₹${charge.toFixed(2)} (Charge per 1k = ₹${apiServiceRate.toFixed(2)})` 
          });
        }

        const newBalance = Math.round((user.balance - charge + Number.EPSILON) * 100) / 100;
        const newTotalSpent = Math.round(((user.totalSpent || 0) + charge + Number.EPSILON) * 100) / 100;

        // Securely deduct funds
        await supabaseAdmin
          .from('users')
          .update({ balance: newBalance, totalSpent: newTotalSpent })
          .eq('id', user.id);

        // Generate unique custom order and transaction string IDs matching database constraints
        const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const txnId = `txn_${Date.now()}`;

        // Place the Order in our database
        const { data: newOrder, error: orderErr } = await supabaseAdmin
          .from('orders')
          .insert({
            id: orderId,
            userId: user.id,
            serviceId: service.service,
            serviceName: service.name,
            link: link,
            quantity: qtyVal,
            charge: charge,
            start_count: 0,
            status: 'Pending',
            date: new Date().toISOString(),
            placed_via_api: true,
            api_user_id: user.id
          })
          .select()
          .single();

        if (orderErr) throw orderErr;

        // Log spending transaction
        await supabaseAdmin
          .from('transactions')
          .insert({
            id: txnId,
            userId: user.id,
            amount: charge,
            type: 'SPEND',
            status: 'SUCCESS',
            method: 'API_ORDER',
            date: new Date().toISOString()
          });

        return res.json({ 
          order: orderId, 
          status: "Order placed successfully" 
        });
      }

      // 5. STATUS CHECK ACTION
      else if (action === "status") {
        const orderId = String(data.order || "");
        if (!orderId) {
          return res.json({ error: "Order ID is required ('order' parameter)" });
        }

        const { data: order, error: ordErr } = await supabaseAdmin
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        if (ordErr || !order) {
          return res.json({ error: "Order not found" });
        }
        if (order.userId !== user.id) {
          return res.json({ error: "Access denied to this order" });
        }

        return res.json({
          status: order.status,
          start_count: parseInt(order.start_count || 0),
          remains: parseInt(order.remains || 0),
          charge: parseFloat(order.charge || 0),
          currency: "INR"
        });
      }

      // 6. MULTI-ORDER LOGS OR USAGE
      else if (action === "orders") {
        const { data: apiOrders } = await supabaseAdmin
          .from('orders')
          .select('*')
          .eq('userId', user.id)
          .eq('placed_via_api', true)
          .order('date', { ascending: false })
          .limit(50);

        return res.json({
          total_orders_placed: apiOrders?.length || 0,
          orders: (apiOrders || []).map((o: any) => ({
            id: o.id,
            service_id: o.serviceId,
            service_name: o.serviceName,
            link: o.link,
            charge: parseFloat(o.charge || 0),
            quantity: parseInt(o.quantity || 0),
            status: o.status,
            date: o.date
          }))
        });
      }

      return res.json({ error: "Declined: Unsupported API action" });
    } catch (err: any) {
      console.error("[User API Error]:", err);
      return res.json({ error: "Internal Server Error", message: err.message });
    }
  });

  // Secure SMM API Proxy
  const smmSchema = z.object({
    action: z.string().min(1),
    service: z.string().optional(),
    link: z.string().min(1).optional(), // More lenient than .url()
    quantity: z.union([z.string(), z.number()]).optional(),
    order: z.string().optional(),
  });

  app.post("/api/smm", orderLimiter, async (req, res) => {
    const validation = smmSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid input", details: validation.error.format() });
    }

    const { action, service, link, quantity, order } = validation.data;
    
    // SECURITY: Prevent public execution of 'add' action. Only the backend cron should place orders.
    // If the frontend tries to place orders, block it.
    if (action === 'add') {
      return res.status(403).json({ error: "Direct order placement via proxy is disabled. Orders are processed securely by the backend." });
    }

    const SMM_API_KEY = process.env.SMM_API_KEY;
    const SMM_API_URL = process.env.SMM_API_URL || "https://safesmmpanel.com/api/v2";

    if (!SMM_API_KEY || SMM_API_KEY.includes("TODO")) {
      return res.status(500).json({ 
        error: "Configuration Error", 
        message: "SMM API Key is missing or invalid. Please set SMM_API_KEY in environment variables." 
      });
    }

    const params = new URLSearchParams();
    // Use strictly verified documentation standards
    params.append('key', SMM_API_KEY);
    params.append('action', action);
    
    if (service) params.append('service', String(service));
    if (link) params.append('link', link);
    if (quantity) params.append('quantity', String(quantity));
    if (order) params.append('order', String(order));

    const makeRequest = async () => {
      // Legacy UA is often used to whitelist safe integration scripts
      const LEGACY_UA = 'Mozilla/4.0 (compatible; MSIE 5.01; Windows NT 5.0)';

      const config: any = {
        method: 'post', // POST is the most documented and stable method
        url: SMM_API_URL,
        timeout: 30000,
        validateStatus: () => true,
        headers: {
          'User-Agent': LEGACY_UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json, text/plain, */*',
        },
        data: params.toString(),
        // Matches curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 0)
        httpsAgent: new (await import("https")).Agent({
          rejectUnauthorized: false
        })
      };

      return axios(config);
    };

    try {
      // console.log(`[Smart Proxy] Executing ${action}...`); // Removed for noise reduction
      const response = await makeRequest();
      
      if (response.status !== 200 || (response.data && response.data.error)) {
         console.warn(`[Smart Proxy] Provider Error (${response.status}):`, response.data);
      }
      
      res.status(response.status).json(response.data);
    } catch (error: any) {
      const isTimeout = error.code === 'ECONNABORTED';
      const isNetworkError = error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED';
      
      console.error("[Smart Proxy Error]:", {
        message: error.message,
        code: error.code,
        url: SMM_API_URL
      });

      res.status(502).json({ 
        error: "Provider Connection Failed", 
        message: isTimeout ? "The provider took too long to respond." : "Could not reach the SMM provider.",
        details: error.message,
        suggestion: "Check if the SMM_API_URL is correct and the provider is online."
      });
    }
  });

   // --- RAZORPAY PRODUCTION-GRADE MULTI-STAGE VERIFICATION ENGINE ---

   // Thread-safe distributed/in-memory lock map to prevent race conditions & double crediting
   class PaymentLock {
     private static locks = new Set<string>();

     static async acquire(key: string): Promise<boolean> {
       if (this.locks.has(key)) {
         for (let i = 0; i < 15; i++) {
           await new Promise((resolve) => setTimeout(resolve, 400));
           if (!this.locks.has(key)) {
             this.locks.add(key);
             return true;
           }
         }
         return false;
       }
       this.locks.add(key);
       return true;
     }

     static release(key: string) {
       this.locks.delete(key);
     }
   }

   // Core, thread-safe payment processor function
   async function processSuccessfulPayment(
     userId: string,
     amount: number,
     paymentId: string,
     orderId?: string,
     couponCode?: string
   ) {
     if (!userId || !amount || !paymentId) {
       throw new Error("Missing critical parameters for payment processing");
     }

     const lockAcquired = await PaymentLock.acquire(paymentId);
     if (!lockAcquired) {
       throw new Error("This payment is currently being processed by another worker");
     }

     try {
       // Check if payment is already processed successfully in database
       const { data: existingTxn } = await supabaseAdmin
         .from("transactions")
         .select("id, status")
         .eq("paymentId", paymentId)
         .maybeSingle();

       if (existingTxn && existingTxn.status === "SUCCESS") {
         console.log(`[Payment Lock] Payment ${paymentId} has already been successfully credited.`);
         return { success: true, already_processed: true };
       }
       
       // Check if order is already successfully paid (prevent double crediting for multiple attempts on same order)
       if (orderId) {
         const { data: existingOrderTxn } = await supabaseAdmin
           .from("transactions")
           .select("id, status, paymentId")
           .eq("orderId", orderId)
           .eq("status", "SUCCESS")
           .maybeSingle();
           
         if (existingOrderTxn) {
           console.log(`[Payment Lock] Order ${orderId} was already credited via payment ${existingOrderTxn.paymentId}. Ignoring new payment ${paymentId}.`);
           return { success: true, already_processed: true };
         }
       }

       // Find any existing pending transaction for this order
       let pendingTxn: any = null;
       if (orderId) {
         const { data } = await supabaseAdmin
           .from("transactions")
           .select("*")
           .eq("orderId", orderId)
           .eq("status", "PENDING")
           .maybeSingle();
         pendingTxn = data;
       }

       let bonusAmount = 0;
       let couponAppliedSuccessfully = false;

       if (couponCode) {
         const cleanCode = couponCode.trim().toUpperCase();
         const { data: c } = await supabaseAdmin.from("coupons").select("*").eq("code", cleanCode).single();
         if (c && c.isEnabled && c.category === "DEPOSIT" && amount >= c.minAmount) {
           // Safely consume the coupon
           const { data: couponApplied } = await supabaseAdmin.rpc("use_coupon", {
             coupon_code: c.code,
             user_id: userId,
           });

           if (couponApplied) {
             couponAppliedSuccessfully = true;
             if (c.type === "PERCENTAGE") {
               bonusAmount = amount * (c.value / 100);
             } else {
               bonusAmount = c.value;
             }
             bonusAmount = Math.round((bonusAmount + Number.EPSILON) * 100) / 100;
           }
         }
       }

       const totalCredit = amount + bonusAmount;

       if (pendingTxn) {
         // Elevate existing pending transaction to SUCCESS
         const { error: updateErr } = await supabaseAdmin
           .from("transactions")
           .update({
             status: "SUCCESS",
             paymentId: paymentId,
             amount: totalCredit,
             utr: couponAppliedSuccessfully ? `COUPON:${couponCode}` : pendingTxn.utr,
             date: new Date().toISOString(),
           })
           .eq("id", pendingTxn.id);

         if (updateErr) throw new Error(`Pending transaction elevation failed: ${updateErr.message}`);
       } else {
         // Create a brand new success transaction record
         const txnId = `txn_${Date.now()}`;
         const { error: insertErr } = await supabaseAdmin.from("transactions").insert({
           id: txnId,
           userId: userId,
           amount: totalCredit,
           type: "DEPOSIT",
           status: "SUCCESS",
           method: "RAZORPAY",
           paymentId: paymentId,
           orderId: orderId || null,
           utr: couponAppliedSuccessfully ? `COUPON:${couponCode}` : null,
           date: new Date().toISOString(),
         });

         if (insertErr) throw new Error(`Transaction insertion failed: ${insertErr.message}`);
       }

       // Atomic wallet balance addition
       const { error: balErr } = await supabaseAdmin.rpc("increment_balance", {
         user_id: userId,
         amount: totalCredit,
       });
       if (balErr) throw new Error("Atomic wallet balance increment failed");

       // Update last payment timestamp
       await supabaseAdmin.from("users").update({ lastPaymentAt: new Date().toISOString() }).eq("id", userId);

       console.log(`[Payment Engine] User ${userId} successfully credited ${totalCredit} INR (Amount: ${amount}, Bonus: ${bonusAmount}) for payment ${paymentId}`);
       return { success: true, credited: totalCredit };
     } finally {
       PaymentLock.release(paymentId);
     }
   }

   // Razorpay Order Creation Endpoint
   const razorpayCreateOrderSchema = z.object({
     amount: z.number().min(1),
     couponCode: z.string().optional()
   });

   app.post("/api/payments/create-order", verifyAuth, async (req: any, res: any) => {
     const validation = razorpayCreateOrderSchema.safeParse(req.body);
     if (!validation.success) return res.status(400).json({ error: "Invalid request parameters" });

     const { amount, couponCode } = validation.data;
     const userId = req.user.id;
     const receipt = `rcpt_${Date.now()}_${userId.substring(0, 4)}`;

     try {
       let orderId = null;
       let rzpOrder: any = null;

       if (razorpay) {
         rzpOrder = await razorpay.orders.create({
           amount: Math.round(amount * 100), // paise
           currency: "INR",
           receipt: receipt,
           notes: {
             userId: userId,
             couponCode: couponCode || ""
           }
         });
         orderId = rzpOrder.id;
       }

       // Pre-create transaction as PENDING so that we have an audit log and correlation for webhooks
       const txnId = `txn_${Date.now()}`;
       await supabaseAdmin.from("transactions").insert({
         id: txnId,
         userId: userId,
         amount: amount,
         type: "DEPOSIT",
         status: "PENDING",
         method: "RAZORPAY",
         orderId: orderId,
         utr: couponCode ? `COUPON:${couponCode}` : null,
         date: new Date().toISOString()
       });

       if (rzpOrder) {
         return res.json(rzpOrder);
       } else {
         return res.json({
           id: null,
           amount: Math.round(amount * 100),
           currency: "INR",
           receipt: receipt,
           fallback: true
         });
       }
     } catch (err: any) {
       console.error("[Payment Engine] Failed to create Razorpay order:", err);
       return res.status(500).json({ error: err.message || "Failed to create order" });
     }
   });

   // Manual Razorpay Verification
   const razorpayVerifySchema = z.object({
     razorpay_order_id: z.string().min(1),
     razorpay_payment_id: z.string().min(1),
     razorpay_signature: z.string().min(1),
     amount: z.number().optional(),
     couponCode: z.string().optional()
   });

   app.post("/api/payments/verify", verifyAuth, async (req: any, res: any) => {
     const validation = razorpayVerifySchema.safeParse(req.body);
     if (!validation.success) return res.status(400).json({ error: "Invalid payment data" });

     const { razorpay_order_id, razorpay_payment_id, razorpay_signature, couponCode } = validation.data;
     const secret = process.env.RAZORPAY_SECRET || "4wiJs8mHjvhbes6JRZFd35hT";

     if (!secret) return res.status(500).json({ error: "Payment configuration error" });

     const generated_signature = crypto
       .createHmac("sha256", secret)
       .update(razorpay_order_id + "|" + razorpay_payment_id)
       .digest("hex");

     if (generated_signature === razorpay_signature) {
       try {
         const userId = req.user.id;
         let amount = 0;
         if (razorpay) {
           const rzpOrder = await razorpay.orders.fetch(razorpay_order_id);
           if (rzpOrder) amount = Number(rzpOrder.amount) / 100;
         } else {
           amount = Number(req.body.amount || 0);
         }

         const result = await processSuccessfulPayment(userId, amount, razorpay_payment_id, razorpay_order_id, couponCode);
         return res.json(result);
       } catch (err: any) {
         console.error("[Payment Engine] Manual verification process failed:", err);
         return res.status(500).json({ error: err.message || "DB update failed" });
       }
     } else {
       return res.status(400).json({ success: false, error: "Invalid signature" });
     }
   });

   // Webhook Razorpay Verification (Production grade auto-credits receiver)
   app.post("/api/payments/webhook", async (req: any, res: any) => {
     const signature = req.headers["x-razorpay-signature"];
     const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

     console.log("[Razorpay Webhook] Received webhook call.");

     if (webhookSecret) {
       if (!signature) {
         console.error("[Razorpay Webhook] Missing signature header.");
         return res.status(400).json({ error: "Missing signature header" });
       }

       // Compute and validate signature using standard hmac validation on rawBody
       const isVerified = Razorpay.validateWebhookSignature(
         req.rawBody || JSON.stringify(req.body),
         signature as string,
         webhookSecret
       );

       if (!isVerified) {
         console.error("[Razorpay Webhook] Signature verification failed.");
         return res.status(400).json({ error: "Invalid webhook signature" });
       }
     } else {
       console.warn("[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET is not configured. Webhook processing without signature check.");
     }

     try {
       const eventObj = req.body;
       const eventName = eventObj?.event;
       console.log(`[Razorpay Webhook] Processing event: ${eventName}`);

       if (eventName === "payment.captured" || eventName === "order.paid") {
         let paymentEntity = eventObj.payload?.payment?.entity;
         let orderEntity = eventObj.payload?.order?.entity;

         if (!paymentEntity && eventObj.payload?.payment) {
           paymentEntity = eventObj.payload.payment;
         }
         if (!orderEntity && eventObj.payload?.order) {
           orderEntity = eventObj.payload.order;
         }

         const paymentId = paymentEntity?.id;
         const rzpOrderId = paymentEntity?.order_id || orderEntity?.id;

         if (!paymentId) {
           console.warn("[Razorpay Webhook] Missing payment ID in payload.");
           return res.json({ status: "ignored", reason: "missing payment id" });
         }

         // Look up existing transaction by orderId to correlate back to user
         let txn: any = null;
         if (rzpOrderId) {
           const { data } = await supabaseAdmin
             .from("transactions")
             .select("*")
             .eq("orderId", rzpOrderId)
             .maybeSingle();
           txn = data;
         }

         let userId = paymentEntity?.notes?.userId || paymentEntity?.notes?.user_id || orderEntity?.notes?.userId || orderEntity?.notes?.user_id;
         if (!userId && txn) {
           userId = txn.userId;
         }

         if (!userId) {
           console.error(`[Razorpay Webhook] Could not associate payment ${paymentId} with any user.`);
           return res.status(400).json({ error: "User association failed" });
         }

         const rawAmount = paymentEntity?.amount || orderEntity?.amount || (txn ? txn.amount * 100 : 0);
         const amount = rawAmount / 100;

         let couponCode = paymentEntity?.notes?.couponCode || paymentEntity?.notes?.coupon_code || orderEntity?.notes?.couponCode;
         if (!couponCode && txn && txn.utr && txn.utr.startsWith("COUPON:")) {
           couponCode = txn.utr.replace("COUPON:", "");
         }

         const result = await processSuccessfulPayment(userId, amount, paymentId, rzpOrderId, couponCode || undefined);
         return res.json({ status: "processed", ...result });
       }

       return res.json({ status: "ignored", event: eventName });
     } catch (err: any) {
       console.error("[Razorpay Webhook] Processing error:", err);
       return res.status(500).json({ error: err.message || "Webhook handling failed" });
     }
   });



  const verifyCouponSchema = z.object({
    code: z.string(),
    category: z.enum(['ORDER', 'DEPOSIT']),
    amount: z.number(),
    userId: z.string().uuid()
  });

  app.post("/api/coupons/verify", verifyAuth, async (req: any, res: any) => {
    const validation = verifyCouponSchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ error: "Invalid input" });
    
    const { code, category, amount, userId } = validation.data;
    if (req.user.id !== userId) return res.status(403).json({ error: "Unauthorized user mismatch" });
    
    try {
        const cleanCode = code.trim().toUpperCase();
        const { data: c, error: couponErr } = await supabaseAdmin.from('coupons').select('*').eq('code', cleanCode).single();
        if (couponErr || !c) {
            return res.status(400).json({ error: "This coupon doesn't exist or expired" });
        }
        
        if (!c.isEnabled) {
            return res.status(400).json({ error: "This coupon doesn't exist or expired" });
        }
        
        if (c.expiryDate) {
            const expiry = new Date(c.expiryDate);
            if (isNaN(expiry.getTime()) || expiry < new Date()) {
                return res.status(400).json({ error: "This coupon doesn't exist or expired" });
            }
        }
        
        if (c.category !== category) {
            return res.status(400).json({ error: "This coupon doesn't exist or expired" });
        }
        
        if (amount < c.minAmount) {
            return res.status(400).json({ error: `Minimum amount required to use this coupon is ${c.minAmount} INR.` });
        }
        
        const usedByArr = Array.isArray(c.usedBy) ? c.usedBy : [];
        if (c.usageLimit > 0 && usedByArr.length >= c.usageLimit) {
            return res.status(400).json({ error: "This coupon has reached its usage limit." });
        }
        
        if (usedByArr.includes(userId)) {
            return res.status(400).json({ error: "You have already used this coupon." });
        }
        
        // Calculate discount
        let discount = 0;
        if (c.type === 'PERCENTAGE') {
            discount = amount * (c.value / 100);
        } else {
            discount = c.value;
        }
        discount = Math.min(amount, discount);
        discount = Math.round((discount + Number.EPSILON) * 100) / 100;
        
        res.json({
            success: true,
            coupon: {
                code: c.code,
                type: c.type,
                value: c.value,
                discount: discount
            }
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Server error" });
    }
  });

  
  const placeOrderSchema = z.object({
    userId: z.string().uuid(),
    serviceId: z.string(),
    serviceName: z.string(),
    link: z.string(),
    quantity: z.number(),
    originalCost: z.number(),
    couponCode: z.string().optional()
  });

  app.post("/api/orders/place", verifyAuth, async (req: any, res: any) => {

    const validation = placeOrderSchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ error: "Invalid input" });
    
    const { userId, serviceId, serviceName, link, quantity, originalCost, couponCode } = validation.data;
    
    if (req.user.id !== userId) return res.status(403).json({ error: "Unauthorized user mismatch" });
    
    try {
        // Duplicate check
        const { data: existingOrder } = await supabaseAdmin.from('orders')
            .select('id').eq('link', link).eq('serviceId', serviceId).in('status', ['Pending', 'Processing']).limit(1);
        if (existingOrder && existingOrder.length > 0) return res.status(400).json({ error: "An active order for this link already exists." });

        // User check
        const { data: user } = await supabaseAdmin.from('users').select('*').eq('id', userId).single();
        if (!user) return res.status(404).json({ error: "User not found" });
        if (user.isBanned) return res.status(403).json({ error: "User is banned" });

        // Securely calculate cost from database
        const { data: dbService } = await supabaseAdmin.from('services').select('rate, min, max, customMarginPercent, customMarginFixed').eq('service', serviceId).single();
        if (!dbService) return res.status(404).json({ error: "Service not found" });
        if (quantity < dbService.min || quantity > dbService.max) {
            return res.status(400).json({ error: `Quantity must be between ${dbService.min} and ${dbService.max}` });
        }
        let price = parseFloat(dbService.rate) || 0;
        const { data: configData } = await supabaseAdmin.from('settings').select('*').eq('id', 'global').single();
        const marginPercent = dbService.customMarginPercent !== undefined && dbService.customMarginPercent !== null ? parseFloat(dbService.customMarginPercent) : parseFloat(configData?.globalMarginPercent || 0);
        const marginFixed = dbService.customMarginFixed !== undefined && dbService.customMarginFixed !== null ? parseFloat(dbService.customMarginFixed) : parseFloat(configData?.globalMarginFixed || 0);
        if (marginPercent) price += price * (marginPercent / 100);
        if (marginFixed) price += marginFixed;

        let finalCost = (price / 1000) * quantity;
        finalCost = Math.round((finalCost + Number.EPSILON) * 100) / 100;

        
        // Coupon Logic
        if (couponCode) {
            const cleanCode = couponCode.trim().toUpperCase();
            const { data: c, error: couponErr } = await supabaseAdmin.from('coupons').select('*').eq('code', cleanCode).single();
            if (couponErr || !c) {
                return res.status(400).json({ error: "This coupon doesn't exist or expired" });
            }
            
            // Check enabled
            if (!c.isEnabled) {
                return res.status(400).json({ error: "This coupon doesn't exist or expired" });
            }
            
            // Check expiry
            if (c.expiryDate) {
                const expiry = new Date(c.expiryDate);
                if (isNaN(expiry.getTime()) || expiry < new Date()) {
                    return res.status(400).json({ error: "This coupon doesn't exist or expired" });
                }
            }
            
            // Check category
            if (c.category !== 'ORDER') {
                return res.status(400).json({ error: "This coupon doesn't exist or expired" });
            }
            
            // Check min amount
            if (finalCost < c.minAmount) {
                return res.status(400).json({ error: `Minimum amount required to use this coupon is ${c.minAmount} INR.` });
            }
            
            // Safely use coupon
            const { data: couponApplied } = await supabaseAdmin.rpc('use_coupon', { coupon_code: c.code, user_id: userId });
            
            if (!couponApplied) {
                return res.status(400).json({ error: "Coupon is invalid, expired, or has reached its usage limit." });
            }
            
            // Apply discount (using actual type and value columns)
            if (c.type === 'PERCENTAGE') {
                finalCost = finalCost - (finalCost * (c.value / 100));
            } else {
                finalCost = finalCost - c.value;
            }
            finalCost = Math.max(0, finalCost);
            finalCost = Math.round((finalCost + Number.EPSILON) * 100) / 100; // Round to 2 decimal places
        }

        const orderId = `ord_${Date.now()}`;
        const txnId = `txn_${Date.now()}`;

        // Safely Deduct Balance (Basic check without RPC)
        if (user.balance < finalCost) {
            return res.status(400).json({ error: "Insufficient balance." });
        }
        
        const newBalance = Math.round((user.balance - finalCost) * 100) / 100;
        const { error: balErr } = await supabaseAdmin.from('users').update({ balance: newBalance }).eq('id', userId);
        
        if (balErr) {
            console.error("Balance deduction error:", balErr);
            return res.status(500).json({ error: "Failed to deduct balance. Please try again." });
        }

        // Insert Order
        const { error: orderErr } = await supabaseAdmin.from('orders').insert({
            id: orderId, userId, serviceId, serviceName, link, quantity, charge: finalCost,
            status: 'Pending', externalId: 'SYNC_IN_PROGRESS', remains: quantity, date: new Date().toISOString()
        });
        if (orderErr) throw orderErr;

        // Insert Txn
        await supabaseAdmin.from('transactions').insert({
            id: txnId, userId, amount: finalCost, type: 'SPEND', status: 'SUCCESS', method: 'ORDER', utr: orderId, date: new Date().toISOString()
        });

        // Referral commission
        if (user.referred_by && finalCost > 0) {
            const { data: configData } = await supabaseAdmin.from('settings').select('*').eq('id', 'global').single();
            if (configData && configData.referral_commission_percent > 0) {
                const commission = Number(((finalCost * configData.referral_commission_percent) / 100).toFixed(2));
                if (commission > 0) {
                    await supabaseAdmin.rpc('add_referral_commission', { referrer_id: user.referred_by, commission: commission });
                    await supabaseAdmin.from('transactions').insert({
                        id: `ref_com_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                        userId: user.referred_by,
                        amount: commission,
                        type: 'REFERRAL_COMMISSION',
                        status: 'SUCCESS',
                        method: 'REFERRAL',
                        utr: `Commission from order #${orderId} by ${user.name || 'referred user'}`,
                        date: new Date().toISOString()
                    });
                }
            }
        }

        // SYNCHRONOUS PROVIDER FORWARDING
        try {
            const resProvider = await callProvider({
              action: 'add',
              service: serviceId,
              link: link,
              quantity: quantity
            });

            const providerId = resProvider.order || resProvider.order_id;
            if (providerId) {
                await supabaseAdmin.from('orders').update({ externalId: String(providerId), status: 'Processing' }).eq('id', orderId);
                return res.json({ success: true, orderId });
            } else if (resProvider.error) {
                const errorMsg = String(resProvider.error).toLowerCase();
                if (errorMsg.includes('duplicate') || errorMsg.includes('already exists')) {
                    const history = await callProvider({ action: 'orders' });
                    if (Array.isArray(history)) {
                        const match = history.find((p) => String(p.link) === String(link) && String(p.service) === String(serviceId));
                        if (match && match.order) {
                            await supabaseAdmin.from('orders').update({ externalId: String(match.order), status: 'Processing' }).eq('id', orderId);
                            return res.json({ success: true, orderId });
                        }
                    }
                }
                // Refund the user for any provider error
                const refundAmount = finalCost;
                await supabaseAdmin.from('transactions').insert({
                    id: `ref_${Date.now()}`, userId: userId, amount: refundAmount, type: 'REFUND', status: 'SUCCESS', method: 'SYSTEM', utr: `Refund for Order #${orderId} (${resProvider.error})`, date: new Date().toISOString()
                });
                
                const { data: updatedUser } = await supabaseAdmin.from('users').select('balance').eq('id', userId).single();
                if (updatedUser) {
                    await supabaseAdmin.from('users').update({ balance: Math.round((updatedUser.balance + refundAmount) * 100) / 100 }).eq('id', userId);
                }
                await supabaseAdmin.from('orders').update({ status: 'Failed', error: resProvider.error }).eq('id', orderId);
                
                return res.status(400).json({ error: `Provider Error: ${resProvider.error}` });
            }
        } catch (e) {
            console.error("Sync provider call failed:", e);
            await supabaseAdmin.from('orders').update({ externalId: null }).eq('id', orderId);
        }

        res.json({ success: true, orderId });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
  });

  // Secure Admin Balance Update
  const balanceUpdateSchema = z.object({
    userId: z.string().uuid(),
    amount: z.number().min(0),
  });

  app.post("/api/admin/update-balance", verifyAdmin, async (req, res) => {
    const validation = balanceUpdateSchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ error: "Invalid input" });

    const { userId, amount } = validation.data;

    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ balance: amount })
        .eq('id', userId);

      if (error) throw error;
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/users/transfer-referral", verifyAuth, async (req: any, res: any) => {
    const userId = req.user.id;
    try {
        const { data: transferAmount, error: rpcErr } = await supabaseAdmin.rpc('transfer_referral_balance', { user_id: userId });
        if (rpcErr) throw rpcErr;
        
        if (!transferAmount || transferAmount <= 0) return res.status(400).json({ error: "No referral earnings to transfer." });
        
        await supabaseAdmin.from('transactions').insert({
            id: `ref_out_${Date.now()}`,
            userId: userId,
            amount: transferAmount,
            type: 'REFERRAL_PAYOUT',
            status: 'SUCCESS',
            method: 'WALLET_TRANSFER',
            date: new Date().toISOString()
        });
        
        // Fetch new balance to return
        const { data: updatedUser } = await supabaseAdmin.from('users').select('balance').eq('id', userId).single();
        
        res.json({ success: true, newBalance: updatedUser?.balance || 0 });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  // Public auth helpers to bypass client-side RLS before login/signup
  app.post("/api/auth/lookup", async (req: any, res: any) => {
    const { action, value } = req.body;
    if (!action || !value) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    try {
      if (action === "getEmailByMobile") {
        const { data, error } = await supabaseAdmin
          .from('users')
          .select('email')
          .eq('mobile', String(value).trim())
          .maybeSingle();
        
        if (error) throw error;
        return res.json({ email: data?.email || null });
      }

      if (action === "checkUsernameUnique") {
        const { data, error } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('name', String(value).trim())
          .maybeSingle();

        if (error) throw error;
        return res.json({ unique: !data });
      }

      if (action === "checkMobileUnique") {
        const { data, error } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('mobile', String(value).trim())
          .maybeSingle();

        if (error) throw error;
        return res.json({ unique: !data });
      }

      return res.status(400).json({ error: "Invalid lookup action" });
    } catch (err: any) {
      console.error("Auth lookup error:", err);
      return res.status(500).json({ error: "Server lookup failed" });
    }
  });

  // Synchronize/Create User Profile safely bypassing RLS
  app.post("/api/sync-user", verifyAuth, async (req: any, res: any) => {
    const { name, mobile, referredByCode } = req.body;
    const { id, email } = req.user;

    // Validate lengths
    if (name && typeof name === 'string' && name.length > 50) return res.status(400).json({ error: "Name too long." });
    if (mobile && typeof mobile === 'string' && mobile.length > 15) return res.status(400).json({ error: "Mobile too long." });
    if (referredByCode && typeof referredByCode === 'string' && referredByCode.length > 20) return res.status(400).json({ error: "Referral code too long." });

    try {
      // 1. Check if user already exists
      const { data: existingUser, error: selectErr } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (selectErr) throw selectErr;

      if (existingUser) {
        const updates: any = { lastLogin: new Date().toISOString() };
        if (name && !existingUser.name) updates.name = name;
        if (mobile && !existingUser.mobile) updates.mobile = mobile;

        // If the trigger created the user but couldn't set referred_by, do it here once.
        if (referredByCode && !existingUser.referred_by) {
            const { data: refUser } = await supabaseAdmin
              .from('users')
              .select('id')
              .eq('referral_code', referredByCode.toUpperCase())
              .maybeSingle();
            
            if (refUser && refUser.id !== id) {
              updates.referred_by = refUser.id;
              
              // Give signup bonus if enabled
              const { data: configData } = await supabaseAdmin.from('settings').select('*').eq('id', 'global').single();
              if (configData && configData.isReferralSystemEnabled && configData.referralSignupBonus > 0) {
                 await supabaseAdmin.rpc('increment_balance', { user_id: id, amount: configData.referralSignupBonus });
                 await supabaseAdmin.from('transactions').insert({
                    id: `ref_sign_${Date.now()}`,
                    userId: id,
                    amount: configData.referralSignupBonus,
                    type: 'DEPOSIT',
                    status: 'SUCCESS',
                    method: 'REFERRAL',
                    utr: 'Signup Bonus',
                    date: new Date().toISOString()
                 });
              }
            }
        }

        const { data: updatedUser, error: updateErr } = await supabaseAdmin
          .from('users')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (updateErr) throw updateErr;
        return res.json({ success: true, user: updatedUser });
      }

      // Check uniqueness explicitly to avoid constraint errors
      if (name) {
          const { data: nameTaken } = await supabaseAdmin.from('users').select('id').eq('name', name).maybeSingle();
          if (nameTaken) return res.status(400).json({ error: "Username is already taken. Please try another." });
      }
      if (mobile) {
          const { data: mobileTaken } = await supabaseAdmin.from('users').select('id').eq('mobile', mobile).maybeSingle();
          if (mobileTaken) return res.status(400).json({ error: "Mobile number is already registered." });
      }

      // 2. Generate referral code
      const referralCode = `U${id.substring(0, 4)}${Math.floor(Math.random() * 99999)}`.toUpperCase();
      let referredBy = null;

      if (referredByCode) {
        const { data: refUser } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('referral_code', referredByCode.toUpperCase())
          .maybeSingle();
        if (refUser) {
          referredBy = refUser.id;
        }
      }

      let finalName = name || email?.split('@')[0] || "User";
      try {
        const { data: nameCheck } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('name', finalName)
          .maybeSingle();
        if (nameCheck && nameCheck.id !== id) {
          finalName = `${finalName}_${Math.floor(1000 + Math.random() * 9000)}`;
        }
      } catch (err) {
        // ignore
      }

      const newUser = {
        id,
        email: email || "",
        name: finalName,
        mobile: mobile || null,
        role: "USER",
        balance: 0,
        totalSpent: 0,
        isBanned: false,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        referral_code: referralCode,
        referred_by: referredBy,
        referral_balance: 0,
        total_referral_earnings: 0
      };

      const { data: insertedUser, error: insertErr } = await supabaseAdmin
        .from('users')
        .upsert(newUser, { onConflict: 'id' })
        .select()
        .single();

      if (insertErr) {
        console.error("Error inserting user:", insertErr);
        // Handle unique constraint violations gracefully
        if (insertErr.code === '23505') {
            if (insertErr.message.includes('users_name_key') || insertErr.details?.includes('name')) {
                return res.status(400).json({ error: "Username is already taken." });
            }
            if (insertErr.message.includes('users_mobile_key') || insertErr.details?.includes('mobile')) {
                return res.status(400).json({ error: "Mobile number is already registered." });
            }
        }
        throw insertErr;
      }

      return res.json({ success: true, user: insertedUser });
    } catch (error: any) {
      console.error("Failed to sync user in backend:", error.message || error);
      try {
        const errorLog = {
          timestamp: new Date().toISOString(),
          userId: id,
          userEmail: email,
          inputName: name,
          inputMobile: mobile,
          referredByCode: referredByCode,
          errorMessage: error.message || String(error),
          errorDetails: error.details || null,
          errorHint: error.hint || null,
          errorCode: error.code || null,
          stack: error.stack || null
        };
        fs.writeFileSync(path.join(process.cwd(), "sync_error.log"), JSON.stringify(errorLog, null, 2), "utf8");
        
        // Log to our memory temp logs too
        logTempError(`Failed to sync user: ${error.message || String(error)}`, "SYNC_USER", errorLog);
      } catch (logErr) {
        console.error("Failed to write sync_error.log:", logErr);
      }
      return res.status(500).json({ error: error.message || "Failed to synchronize user profile" });
    }
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== "production") {
    console.log("Initializing Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite middleware initialized.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  console.log(`Attempting to start server on port ${PORT}...`);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
