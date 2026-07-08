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
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

let supabaseAdmin: any;
try {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
} catch (e) {
  console.error("Failed to initialize Supabase Admin:", e);
}

// ============================================================================
// SECURITY HARDENING: THREAD-SAFE CONCURRENCY LOCKS & RPC DATABASE FALLBACKS
// ============================================================================

class UserLock {
  private static locks = new Set<string>();

  static async acquire(userId: string): Promise<boolean> {
    if (this.locks.has(userId)) {
      for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (!this.locks.has(userId)) {
          this.locks.add(userId);
          return true;
        }
      }
      return false;
    }
    this.locks.add(userId);
    return true;
  }

  static release(userId: string) {
    this.locks.delete(userId);
  }
}

async function secureDecrementBalance(userId: string, amount: number): Promise<boolean> {
  const acquired = await UserLock.acquire(userId);
  if (!acquired) {
    throw new Error("Could not acquire user transaction lock. Please try again.");
  }
  try {
    // 1. Try real RPC first
    const { data: success, error: rpcErr } = await supabaseAdmin.rpc('decrement_balance', {
      user_id: userId,
      amount: amount
    });
    if (!rpcErr) {
      return success === true;
    }

    // 2. Fallback to locked select-and-update (since RLS policies are not compiled yet)
    console.log(`[Security] rpc.decrement_balance not found. Running locked server-side fallback for user ${userId}.`);
    const { data: user, error: userErr } = await supabaseAdmin.from('users').select('balance, totalSpent').eq('id', userId).single();
    if (userErr || !user) {
      throw new Error(`User profile fetch failed: ${userErr?.message || 'Not found'}`);
    }

    const currentBalance = parseFloat(user.balance || 0);
    if (currentBalance < amount) {
      return false;
    }

    const newBalance = Math.round((currentBalance - amount + Number.EPSILON) * 100) / 100;
    const newTotalSpent = Math.round(((parseFloat(user.totalSpent || 0)) + amount + Number.EPSILON) * 100) / 100;

    const { error: updErr } = await supabaseAdmin.from('users').update({
      balance: newBalance,
      totalSpent: newTotalSpent
    }).eq('id', userId);

    if (updErr) {
      throw new Error(`Failed to deduct balance in fallback: ${updErr.message}`);
    }

    return true;
  } finally {
    UserLock.release(userId);
  }
}

async function secureIncrementBalance(userId: string, amount: number): Promise<number> {
  const acquired = await UserLock.acquire(userId);
  if (!acquired) {
    throw new Error("Could not acquire user transaction lock. Please try again.");
  }
  try {
    // 1. Try real RPC first
    const { data: newBal, error: rpcErr } = await supabaseAdmin.rpc('increment_balance', {
      user_id: userId,
      amount: amount
    });
    if (!rpcErr && newBal !== null && newBal !== undefined) {
      return parseFloat(newBal);
    }

    // 2. Fallback
    console.log(`[Security] rpc.increment_balance not found. Running locked server-side fallback for user ${userId}.`);
    const { data: user, error: userErr } = await supabaseAdmin.from('users').select('balance').eq('id', userId).single();
    if (userErr || !user) {
      throw new Error(`User profile fetch failed: ${userErr?.message || 'Not found'}`);
    }

    const currentBalance = parseFloat(user.balance || 0);
    const newBalance = Math.round((currentBalance + amount + Number.EPSILON) * 100) / 100;

    const { error: updErr } = await supabaseAdmin.from('users').update({
      balance: newBalance
    }).eq('id', userId);

    if (updErr) {
      throw new Error(`Failed to add balance in fallback: ${updErr.message}`);
    }

    return newBalance;
  } finally {
    UserLock.release(userId);
  }
}

async function verifyUserBalanceConsistency(userId: string): Promise<boolean> {
  const acquired = await UserLock.acquire(`verify_bal_${userId}`);
  if (!acquired) {
    return true;
  }
  try {
    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('balance, email, isBanned')
      .eq('id', userId)
      .single();
      
    if (userErr || !user) {
      console.error("[Balance Security] Failed to fetch user for balance verification:", userErr);
      return true;
    }
    
    if (user.isBanned) return true; // Already banned

    const { data: txns, error: txnsErr } = await supabaseAdmin
      .from('transactions')
      .select('amount, type, status')
      .eq('userId', userId)
      .eq('status', 'SUCCESS');
      
    if (txnsErr || !txns) {
      console.error("[Balance Security] Failed to fetch transactions for user:", txnsErr);
      return true;
    }

    let expectedBalance = 0;
    for (const t of txns) {
      const amt = parseFloat(t.amount || 0);
      if (t.type === 'DEPOSIT' || t.type === 'REFUND' || t.type === 'REFERRAL_PAYOUT') {
        expectedBalance += amt;
      } else if (t.type === 'SPEND') {
        expectedBalance -= amt;
      }
    }

    expectedBalance = Math.round(expectedBalance * 100) / 100;
    const actualBalance = Math.round(parseFloat(user.balance || 0) * 100) / 100;

    if (actualBalance > expectedBalance + 0.05) {
      console.error(`[SECURITY ALERT] Balance inconsistency detected for user ${userId} (${user.email})! Actual: ₹${actualBalance}, Expected: ₹${expectedBalance}. Tampering suspected!`);
      
      // Auto-ban user to freeze account instantly
      await supabaseAdmin
        .from('users')
        .update({ isBanned: true })
        .eq('id', userId);
        
      console.warn(`[SECURITY] USER ${userId} (${user.email}) AUTO-BANNED DUE TO BALANCE MISMATCH (Actual ₹${actualBalance} vs Expected ₹${expectedBalance})`);

      // Insert alert transaction log
      await supabaseAdmin.from('transactions').insert({
        id: `ban_alert_${Date.now()}`,
        userId: userId,
        amount: Math.round((actualBalance - expectedBalance) * 100) / 100,
        type: 'SPEND',
        status: 'FAILED',
        method: 'SYSTEM_ALERT',
        utr: `SUSPECTED_TAMPERING_AUTO_BAN_ACTUAL:${actualBalance}_EXPECTED:${expectedBalance}`,
        date: new Date().toISOString()
      });
      
      return false; // Mismatch detected
    }
    
    return true; // Match
  } catch (err) {
    console.error("[Balance Security] Error in verifyUserBalanceConsistency:", err);
    return true;
  } finally {
    UserLock.release(`verify_bal_${userId}`);
  }
}

async function secureUseCoupon(couponCode: string, userId: string): Promise<boolean> {
  const cleanCode = couponCode.trim().toUpperCase();
  const acquired = await UserLock.acquire(`coupon_${cleanCode}`);
  if (!acquired) {
    throw new Error("Could not acquire coupon verification lock. Please try again.");
  }
  try {
    // 1. Try real RPC first
    const { data: success, error: rpcErr } = await supabaseAdmin.rpc('use_coupon', {
      coupon_code: cleanCode,
      user_id: userId
    });
    if (!rpcErr) {
      return success === true;
    }

    // 2. Fallback
    console.log(`[Security] rpc.use_coupon not found. Running locked server-side fallback for coupon ${cleanCode}.`);
    const { data: c, error: couponErr } = await supabaseAdmin.from('coupons').select('*').eq('code', cleanCode).single();
    if (couponErr || !c) {
      return false;
    }

    if (!c.isEnabled) return false;

    if (c.expiryDate) {
      const expiry = new Date(c.expiryDate);
      if (isNaN(expiry.getTime()) || expiry < new Date()) {
        return false;
      }
    }

    const usedBy = Array.isArray(c.usedBy) ? c.usedBy : [];
    if (c.usageLimit > 0 && usedBy.length >= c.usageLimit) {
      return false;
    }

    if (usedBy.includes(userId)) {
      return false;
    }

    const updatedUsedBy = [...usedBy, userId];
    const { error: updErr } = await supabaseAdmin.from('coupons').update({
      usedBy: updatedUsedBy
    }).eq('code', cleanCode);

    if (updErr) {
      throw new Error(`Failed to use coupon in fallback: ${updErr.message}`);
    }

    return true;
  } finally {
    UserLock.release(`coupon_${cleanCode}`);
  }
}

async function secureAddReferralCommission(referrerId: string, commission: number): Promise<boolean> {
  const acquired = await UserLock.acquire(referrerId);
  if (!acquired) {
    throw new Error("Could not acquire user transaction lock. Please try again.");
  }
  try {
    // 1. Try real RPC first
    const { data: success, error: rpcErr } = await supabaseAdmin.rpc('add_referral_commission', {
      referrer_id: referrerId,
      commission: commission
    });
    if (!rpcErr) {
      return success === true;
    }

    // 2. Fallback
    console.log(`[Security] rpc.add_referral_commission not found. Running locked server-side fallback for referrer ${referrerId}.`);
    const { data: user, error: userErr } = await supabaseAdmin.from('users').select('referral_balance, total_referral_earnings').eq('id', referrerId).single();
    if (userErr || !user) {
      return false;
    }

    const currentRefBalance = parseFloat(user.referral_balance || 0);
    const currentRefEarnings = parseFloat(user.total_referral_earnings || 0);

    const newRefBalance = Math.round((currentRefBalance + commission + Number.EPSILON) * 100) / 100;
    const newRefEarnings = Math.round((currentRefEarnings + commission + Number.EPSILON) * 100) / 100;

    const { error: updErr } = await supabaseAdmin.from('users').update({
      referral_balance: newRefBalance,
      total_referral_earnings: newRefEarnings
    }).eq('id', referrerId);

    if (updErr) {
      throw new Error(`Failed to add referral commission in fallback: ${updErr.message}`);
    }

    return true;
  } finally {
    UserLock.release(referrerId);
  }
}

async function secureTransferReferralBalance(userId: string): Promise<number> {
  const acquired = await UserLock.acquire(userId);
  if (!acquired) {
    throw new Error("Could not acquire user transaction lock. Please try again.");
  }
  try {
    // 1. Try real RPC first
    const { data: transferAmount, error: rpcErr } = await supabaseAdmin.rpc('transfer_referral_balance', {
      user_id: userId
    });
    if (!rpcErr && transferAmount !== null && transferAmount !== undefined) {
      return parseFloat(transferAmount);
    }

    // 2. Fallback
    console.log(`[Security] rpc.transfer_referral_balance not found. Running locked server-side fallback for user ${userId}.`);
    const { data: user, error: userErr } = await supabaseAdmin.from('users').select('balance, referral_balance').eq('id', userId).single();
    if (userErr || !user) {
      throw new Error(`User profile fetch failed: ${userErr?.message || 'Not found'}`);
    }

    const transferAmountVal = parseFloat(user.referral_balance || 0);
    if (transferAmountVal <= 0) {
      return 0;
    }

    const currentBalance = parseFloat(user.balance || 0);
    const newBalance = Math.round((currentBalance + transferAmountVal + Number.EPSILON) * 100) / 100;

    const { error: updErr } = await supabaseAdmin.from('users').update({
      balance: newBalance,
      referral_balance: 0
    }).eq('id', userId);

    if (updErr) {
      throw new Error(`Failed to transfer referral balance in fallback: ${updErr.message}`);
    }

    return transferAmountVal;
  } finally {
    UserLock.release(userId);
  }
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
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
    const rzpKey = process.env.RAZORPAY_KEY_ID || "";
    const rzpSecret = process.env.RAZORPAY_SECRET || "";
    
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
  
  // Explicitly block automated exploit scanners and fuzzers (Burp Suite, OWASP ZAP, sqlmap, etc.)
  app.use((req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    const lowerUA = ua.toLowerCase();
    const blockedTools = [
      'sqlmap', 'nikto', 'nmap', 'burp', 'zap', 'arachni', 
      'acunetix', 'dirb', 'dirbuster', 'gobuster', 'w3af', 'netsparker'
    ];
    
    if (blockedTools.some(tool => lowerUA.includes(tool))) {
      console.warn(`[Security Block] Blocked exploit tool User-Agent: ${ua}`);
      return res.status(403).json({ error: "Access Denied: Automated vulnerability scanning tools are strictly prohibited." });
    }
    
    // Prevent common directory traversal and XSS probing in query/path
    const rawUrl = req.originalUrl || req.url;
    if (rawUrl.includes('../') || rawUrl.includes('..\\') || rawUrl.includes('<script>') || rawUrl.includes('%3Cscript%3E')) {
      console.warn(`[Security Block] Blocked malicious path/query: ${rawUrl}`);
      return res.status(400).json({ error: "Access Denied: Malicious payload detected." });
    }
    
    next();
  });

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
      const lowerOrigin = origin.toLowerCase();
      
      // Strict exact match domains (production)
      const exactAllowedOrigins = [
        'https://socialuphub.in',
        'https://socialuphub-smm.web.app',
        'https://socialuphub-smm.firebaseapp.com'
      ];

      // Safe dev and preview domains
      const isAllowed = exactAllowedOrigins.includes(lowerOrigin) || 
                        lowerOrigin.startsWith('http://localhost') ||
                        lowerOrigin.startsWith('http://127.0.0.1') ||
                        lowerOrigin.endsWith('.run.app') ||
                        lowerOrigin.endsWith('.github.dev') ||
                        lowerOrigin.endsWith('.gitpod.io');

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
  // Allow 100000 requests per 15 minutes for general API endpoints
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100000,
    message: { error: "Too many requests from this IP. Please try again after 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => req.ip || req.headers['x-forwarded-for'] || 'global-limit'
  });

  // Limit order placements or critical API actions to 5 requests per minute to stop automated Kali Linux scripting
  const orderLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    message: { error: "Too many order requests. Please wait a minute before trying again." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => req.ip || req.headers['x-forwarded-for'] || 'order-limit'
  });

  // Strict rate limit for auth lookups (e.g. max 15 lookups per 15 minutes per IP) to prevent user enum/PII harvesting
  const authLookupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15,
    message: { error: "Security Alert: Too many auth verification attempts. Please try again after 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => req.ip || req.headers['x-forwarded-for'] || 'auth-lookup-limit'
  });

  app.use("/api/", generalLimiter);
  app.use("/api", securityAuditLogger);

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

  // 1. Order Forwarding (Forward Pending -> Provider) - Optimized and Process-Safe
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
        // Atomic Lock: Update externalId to 'SENDING_PROVIDER' only if it is currently null
        // This ensures multi-thread / multi-backend processes never forward the same order twice!
        const { data: lockAcquired, error: lockErr } = await supabaseAdmin.from('orders')
          .update({ externalId: 'SENDING_PROVIDER' })
          .eq('id', order.id)
          .is('externalId', null)
          .select();

        if (lockErr || !lockAcquired || lockAcquired.length === 0) {
          // Lock failed (already acquired by another thread/worker)
          continue;
        }

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
        } else {
          const resError = (res as any).error;
          const errorMsg = resError ? String(resError).toLowerCase() : '';
          const errDetail = resError || 'Unknown Error';
          
          // ADVANCED ROBUST LOGIC: Handle Duplicates
          if (errorMsg.includes('duplicate') || errorMsg.includes('already exists')) {
             console.log(`[BG Forward] Duplicate detected for ${order.id}. Fetching existing ID...`);
             const history = await callProvider({ action: 'orders' });
             if (Array.isArray(history)) {
                const match = history.find((p: any) => String(p.link) === String(order.link) && String(p.service) === String(order.serviceId));
                if (match && match.order) {
                   await supabaseAdmin.from('orders').update({ externalId: String(match.order) }).eq('id', order.id);
                   continue;
                }
             }
          }

          const isFatal = !errDetail || errorMsg.includes('link') || errorMsg.includes('service') || errorMsg.includes('quantity') || errorMsg.includes('invalid') || errorMsg.includes('incorrect');
          if (isFatal) {
            // Refund the user
            const { data: user } = await supabaseAdmin.from('users').select('balance').eq('id', order.userId).single();
            if (user) {
                await supabaseAdmin.from('users').update({ balance: Math.round((user.balance + order.charge) * 100) / 100 }).eq('id', order.userId);
                await supabaseAdmin.from('transactions').insert({ id: `ref_bg_${Date.now()}_${order.id.slice(-5)}`, userId: order.userId, amount: order.charge, type: 'REFUND', status: 'SUCCESS', method: 'SYSTEM', utr: `Refund for Failed API Order #${order.id} (${errDetail})`, date: new Date().toISOString() });
            }
            await supabaseAdmin.from('orders').update({ status: 'Failed', error: errDetail, externalId: null }).eq('id', order.id);
          } else {
            // Transient error (e.g. rate limit, connection timeout). Release lock to retry later.
            await supabaseAdmin.from('orders').update({ externalId: null }).eq('id', order.id);
            console.log(`[BG Forward] Transient error for Order ${order.id}: ${errDetail}. Lock released for retry.`);
          }
        }
      }
    } catch (e) {
      console.error("[BG Forward] Error:", e);
    }
  };

  // 2. Status Sync (Update local status from Provider) - Batched to prevent looking like DDOS
  const syncStatuses = async () => {
    try {
      const { data: active } = await supabaseAdmin.from('orders')
        .select('*')
        .in('status', ['Pending', 'Processing'])
        .not('externalId', 'is', null)
        .neq('externalId', 'SENDING_PROVIDER')
        .limit(100); // Batch up to 100 active orders

      if (!active || active.length === 0) return;

      const orderIds = active.map(o => o.externalId).filter(Boolean);
      if (orderIds.length === 0) return;

      let batchRes: any = null;
      try {
        // Make a single batched status query to SMM API
        batchRes = await callProvider({ action: 'status', orders: orderIds.join(',') });
      } catch (err) {
        console.warn("[BG Sync] Batched status call failed, will try single fallback:", err);
      }

      let updateCount = 0;
      for (const order of active) {
        let res = null;
        if (batchRes && batchRes[order.externalId]) {
          res = batchRes[order.externalId];
        } else if (orderIds.length === 1 && batchRes && batchRes.status) {
          res = batchRes;
        } else {
          // Fallback to single status request if batch failed or didn't contain this ID
          try {
            res = await callProvider({ action: 'status', order: order.externalId });
          } catch (singleErr) {
            console.error(`[BG Sync] Single status lookup failed for order ${order.externalId}:`, singleErr);
          }
        }

        if (res && res.status) {
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
    const authHeader = req.headers.authorization;
    let userId = null;
    let email = null;

    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token && token !== 'undefined' && token !== 'null') {
        try {
          // Enforce minimum iat check to disconnect compromised sessions
          const parts = token.split('.');
          if (parts.length === 3) {
            try {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
              if (payload && typeof payload.iat === 'number') {
                const MIN_SESSION_IAT = 1783397700; // July 6, 2026 21:15 PDT security rotation
                if (payload.iat < MIN_SESSION_IAT) {
                  return res.status(401).json({ error: "Session security rotated. Please log out and log in again." });
                }
              }
            } catch (e) {
              console.error("JWT payload parse error:", e);
            }
          }

          // Properly verify JWT signature and fetch user using Supabase Auth
          const { data: { user: authUser }, error } = await supabaseAdmin.auth.getUser(token);
          
          if (error || !authUser) {
             return res.status(401).json({ error: "Invalid or expired session. Please log in again." });
          }
          
          userId = authUser.id;
          email = authUser.email;
        } catch (e) {
          console.error("JWT Verification error:", e);
          return res.status(401).json({ error: "Authentication failed." });
        }
      }
    }

    if (!userId) {
        return res.status(401).json({ error: "User identification missing. Please log out and log in again." });
    }

    // Strict type casting to String to prevent Type injection/NoSQL logic bypasses
    const safeUserId = String(userId);

    // Verify user exists in the public users table
    const { data: user } = await supabaseAdmin.from('users').select('*').eq('id', safeUserId).single();
    
    if (user && user.isBanned) {
        return res.status(403).json({ error: "Your account has been suspended." });
    }

    if (!user && req.path !== '/api/sync-user') {
        return res.status(401).json({ error: "User profile not found. Please log out and log in again." });
    }

    req.user = user || { id: safeUserId, email: email };
    next();
  };

  // --- STRICT AUDIT LOGGING & FORENSICS ---

  interface SystemLog {
    id: string;
    timestamp: string;
    ip: string;
    method: string;
    url: string;
    actorType: "FRONTEND" | "BACKEND" | "ADMIN" | "USER" | "ANONYMOUS";
    actorName: string;
    details: string;
    status: number;
  }

  let systemLogs: SystemLog[] = [];

  function cleanupOldLogs() {
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    systemLogs = systemLogs.filter(log => new Date(log.timestamp).getTime() > threeHoursAgo);
  }

  function securityAuditLogger(req: any, res: any, next: any) {
    cleanupOldLogs();

    // 1. Determine actor type & name
    let actorType: "FRONTEND" | "BACKEND" | "ADMIN" | "USER" | "ANONYMOUS" = "ANONYMOUS";
    let actorName = "Anonymous Probe";
    let email = "";

    // Parse Authorization JWT
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token && token !== 'undefined' && token !== 'null') {
        const parts = token.split('.');
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            if (payload && payload.email) {
              email = payload.email;
            }
          } catch (e) {}
        }
      }
    }

    // --- SECURITY INTRUSION CHECK: TRACK & MITIGATE HACKER "MOHIT" OR "@CMDBROWSER.COM" MAIL PIPELINES ---
    let isHackerAttempt = false;
    let hackerReason = "";

    const checkStringForHacker = (str: any): boolean => {
      if (!str) return false;
      const val = String(str).toLowerCase().trim();
      return val.includes("cmdbrowser.com") || 
             val.includes("cmd-browser.com") || 
             val.includes("cmdbrowser") ||
             val.includes("cmd-browser") ||
             val === "mohit" || 
             val.includes("mohit@") ||
             val.includes(".mohit") ||
             val.includes("mohit ") ||
             val.includes(" mohit") ||
             val.startsWith("mohit") ||
             val.endsWith("mohit") ||
             val.includes("@cmdbrowser");
    };

    // Check request body for Mohit/cmdbrowser details
    if (req.body) {
      const fieldsToCheck = ['email', 'name', 'username', 'identifier', 'fullname', 'mobile'];
      for (const field of fieldsToCheck) {
        if (req.body[field] && typeof req.body[field] === 'string') {
          if (checkStringForHacker(req.body[field])) {
            isHackerAttempt = true;
            hackerReason = `Hacker property [${field}: "${req.body[field]}"] matched known signature`;
            break;
          }
        }
      }
    }

    // Check JWT session email
    if (email && checkStringForHacker(email)) {
      isHackerAttempt = true;
      hackerReason = `Hacker email [${email}] detected in session JWT`;
    }

    // Check URL query parameters
    if (req.query) {
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === 'string' && checkStringForHacker(value)) {
          isHackerAttempt = true;
          hackerReason = `Hacker query param [${key}: "${value}"] matched signature`;
          break;
        }
      }
    }

    if (isHackerAttempt) {
      const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      console.error(`[SECURITY THREAT DETECTED] Blocked hacker Mohit/cmdbrowser on path: ${req.path} from IP: ${ip}. Reason: ${hackerReason}`);
      
      const logId = `hack_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      systemLogs.push({
        id: logId,
        timestamp: new Date().toISOString(),
        ip: String(ip),
        method: req.method,
        url: req.path,
        actorType: "ANONYMOUS",
        actorName: "MOHIT (HACKER DETECTED)",
        details: `CRITICAL SEC ALERT: Blocked Mohit / CMD Browser exploit attempt. (${hackerReason})`,
        status: 403
      });

      return res.status(403).json({ 
        error: "Access Denied: High-risk security exploit signature matched. Incident logged, IP tracked, and administrators notified on the Forensic Security panel.",
        hackerMitigated: true
      });
    }

    const publicPaths = [
      "/api/health",
      "/api/auth/lookup",
      "/api/payments/webhook",
      "/api/v2",
      "/api/smm"
    ];

    const isPublic = publicPaths.includes(req.path) || req.path === "/api/health" || req.path === "/ping";

    // Detect actor based on credentials
    if (email) {
      if (email === 'gauravbeniwal30003@gmail.com' || email === 'gauravbeniwal303@gmail.com') {
        actorType = "ADMIN";
        actorName = email;
      } else {
        actorType = "USER";
        actorName = email;
      }
    } else {
      // Check if SMM Panel/Webhook / System
      if (req.path === "/api/payments/webhook") {
        actorType = "BACKEND";
        actorName = "Razorpay Webhook";
      } else if (req.path === "/api/v2" || req.path === "/api/smm") {
        actorType = "BACKEND";
        actorName = "SMM Provider API";
      } else if (req.path === "/api/health" || req.path === "/ping") {
        actorType = "BACKEND";
        actorName = "System Health Check";
      } else {
        // Check Origin/Referer
        const origin = req.headers.origin;
        const referer = req.headers.referer;

        const isUrlAllowed = (url: string) => {
          if (!url) return false;
          try {
            let parsedUrl = url;
            if (!parsedUrl.startsWith('http')) {
              parsedUrl = 'https://' + parsedUrl;
            }
            const parsed = new URL(parsedUrl);
            const hostname = parsed.hostname.toLowerCase();
            const allAllowed = [
              "socialuphub.in",
              "socialuphub-smm.web.app",
              "socialuphub-smm.firebaseapp.com",
              "localhost",
              "127.0.0.1",
              "run.app",
              "github.dev",
              "gitpod.io"
            ];
            return allAllowed.some(domain => {
              return hostname === domain || hostname.endsWith("." + domain);
            });
          } catch (e) {
            return false;
          }
        };

        if ((origin && isUrlAllowed(origin)) || (referer && isUrlAllowed(referer))) {
          actorType = "FRONTEND";
          actorName = "Frontend Client";
        } else {
          actorType = "ANONYMOUS";
          actorName = "Anonymous Probe";
        }
      }
    }

    // 2. Reject Anonymous attempts to non-public endpoints
    if (actorType === "ANONYMOUS" && !isPublic && req.path.startsWith("/api/")) {
      const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      console.warn(`[SECURITY DIRECT REJECTION] Rejected anonymous API attempt on path: ${req.path} from IP: ${ip}`);
      
      // Log rejected attempt before blocking
      const logId = `rej_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      systemLogs.push({
        id: logId,
        timestamp: new Date().toISOString(),
        ip: String(ip),
        method: req.method,
        url: req.path,
        actorType: "ANONYMOUS",
        actorName: "Anonymous Probe (REJECTED)",
        details: `Rejected direct access to: ${req.path} (Blocked by FireWall)`,
        status: 403
      });

      return res.status(403).json({ error: "Access denied: Request must originate from an authorized source." });
    }

    // 3. Log valid/accepted requests
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const logId = `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    let details = `Accessing route: ${req.path}`;
    if (req.path === "/api/admin/update-balance" && req.body) {
      details = `Admin balance modification: ${req.body.amount} for user ID ${req.body.userId}`;
    } else if (req.path === "/api/admin/db-proxy" && req.body) {
      details = `Admin Database Proxy: Action [${req.body.action}] on table [${req.body.table}]`;
    } else if (req.path === "/api/orders/place" && req.body) {
      details = `Placing SMM order: Service ID [${req.body.serviceId || req.body.service}]`;
    } else if (req.path === "/api/payments/create-order" && req.body) {
      details = `Payment creation request: Amount [${req.body.amount}]`;
    } else if (req.body && Object.keys(req.body).length > 0) {
      details = `API call with keys: ${Object.keys(req.body).filter(k => k !== 'password' && k !== 'key').join(', ')}`;
    }

    const newLog: SystemLog = {
      id: logId,
      timestamp: new Date().toISOString(),
      ip: String(ip),
      method: req.method,
      url: req.path,
      actorType,
      actorName,
      details,
      status: 200 // will be updated on finish
    };

    systemLogs.push(newLog);

    res.on('finish', () => {
      // Update with the actual status code
      const logIndex = systemLogs.findIndex(l => l.id === logId);
      if (logIndex !== -1) {
        systemLogs[logIndex].status = res.statusCode;
      }
    });

    next();
  }



  const verifyAdmin = async (req: any, res: any, next: any) => {
    await verifyAuth(req, res, async () => {
      // MASTER ADMIN EMAIL LOCK
      const masterAdminEmail = "gauravbeniwal30003@gmail.com";
      const altAdminEmail = "gauravbeniwal3003@gmail.com";
      if (req.user?.email !== masterAdminEmail && req.user?.email !== altAdminEmail) {
        console.warn(`[SECURITY] Unauthorized admin attempt by ${req.user?.email || 'Unknown'} (ID: ${req.user?.id})`);
        return res.status(403).json({ error: "Master Admin access required. Unauthorized." });
      }

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

  // --- ALLOWED SOURCE MIDDLEWARE (Anti-Exploit / Anti-Burp Suite) ---
  const verifyAllowedSource = (req: any, res: any, next: any) => {
    const origin = req.headers.origin;
    const referer = req.headers.referer;

    // Allowed domains requested by user
    const allowedDomains = [
      "socialuphub.in",
      "socialuphub-smm.web.app",
      "socialuphub-smm.firebaseapp.com"
    ];

    // Development & preview domains for testing
    const devDomains = [
      "localhost",
      "127.0.0.1",
      "run.app", // Dev & preview URLs
      "github.dev",
      "gitpod.io"
    ];

    const allAllowed = [...allowedDomains, ...devDomains];

    const isUrlAllowed = (url: string) => {
      try {
        let parsedUrl = url;
        if (!parsedUrl.startsWith('http')) {
          parsedUrl = 'https://' + parsedUrl;
        }
        const parsed = new URL(parsedUrl);
        const hostname = parsed.hostname.toLowerCase();
        return allAllowed.some(domain => {
          return hostname === domain || hostname.endsWith("." + domain);
        });
      } catch (e) {
        return false;
      }
    };

    // 1. If Origin header is present, validate it
    if (origin) {
      if (!isUrlAllowed(origin)) {
        console.warn(`[Security Block] Blocked Origin: ${origin} on path: ${req.path}`);
        return res.status(403).json({ error: "Access denied: Unauthorized source origin." });
      }
      return next();
    }

    // 2. If Referer header is present, validate it
    if (referer) {
      if (!isUrlAllowed(referer)) {
        console.warn(`[Security Block] Blocked Referer: ${referer} on path: ${req.path}`);
        return res.status(403).json({ error: "Access denied: Unauthorized source referer." });
      }
      return next();
    }

    // 3. Reject non-GET requests without Origin/Referer (likely direct API/Burp Suite attacks)
    if (req.method !== "GET" && req.method !== "OPTIONS") {
      console.warn(`[Security Block] Blocked direct request (no Origin/Referer headers) on path: ${req.path}`);
      return res.status(403).json({ error: "Access denied: Request must originate from an authorized source." });
    }

    next();
  };

  // --- USER PLATFORM SMM API ENDPOINT ---
  app.all("/api/v2", orderLimiter, async (req, res) => {
    // SMM clients default to urlencoded bodies, which Express parses into req.body.
    // Allow query parameters too as some platforms mix parameter types.
    const data = { ...req.query, ...req.body };
    const apiKey = data.key ? String(data.key).trim() : null;
    const action = data.action ? String(data.action).trim() : null;

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
        // Auto-ban system disabled as requested by the owner
        // return res.json({ error: "Declined: Your API user account has been suspended or banned" });
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

        // Acquire sequential order placement lock for this user to neutralize any Burp Suite race condition/double-spending exploits
        const acquired = await UserLock.acquire(`place_order_${user.id}`);
        if (!acquired) {
          return res.json({ error: "An order transaction is already in progress for this account. Please wait." });
        }

        try {
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

          // Re-fetch user balance inside lock to prevent race conditions from stale cache
          const { data: freshUser } = await supabaseAdmin
            .from('users')
            .select('balance')
            .eq('id', user.id)
            .single();

          const userBalance = parseFloat(freshUser?.balance || 0);
          if (userBalance < charge) {
            return res.json({ 
              error: `Declined: Insufficient funds. Your balance is ₹${userBalance.toFixed(2)}, but this order requires ₹${charge.toFixed(2)} (Charge per 1k = ₹${apiServiceRate.toFixed(2)})` 
            });
          }

          // Securely deduct funds atomically with fallback lock
          const deducted = await secureDecrementBalance(user.id, charge);
          if (!deducted) {
            return res.json({ 
              error: `Declined: Insufficient funds.` 
            });
          }

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
        } catch (err: any) {
          console.error("API Order Placement Error:", err);
          return res.json({ error: "Internal server error occurred while placing order." });
        } finally {
          UserLock.release(`place_order_${user.id}`);
        }
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
           const couponApplied = await secureUseCoupon(c.code, userId);

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

       // Atomic wallet balance addition with fallback lock
       try {
         await secureIncrementBalance(userId, totalCredit);
       } catch (balErr: any) {
         throw new Error(`Atomic wallet balance increment failed: ${balErr.message}`);
       }

       // Update last payment timestamp
       await supabaseAdmin.from("users").update({ lastPaymentAt: new Date().toISOString() }).eq("id", userId);
      await verifyUserBalanceConsistency(userId);

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

   app.post("/api/payments/create-order", verifyAllowedSource, verifyAuth, async (req: any, res: any) => {
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

   app.post("/api/payments/verify", verifyAllowedSource, verifyAuth, async (req: any, res: any) => {
      const validation = razorpayVerifySchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: "Invalid payment data" });

      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, couponCode } = validation.data;
      
      try {
        const userId = req.user.id;

        // 1. Fetch pending transaction from database to verify ownership & expected amount
        const { data: pendingTxn, error: txnErr } = await supabaseAdmin
          .from("transactions")
          .select("*")
          .eq("orderId", razorpay_order_id)
          .eq("status", "PENDING")
          .maybeSingle();

        if (txnErr) {
          console.error("[Payment Security] Error fetching pending transaction:", txnErr);
          return res.status(500).json({ error: "Failed to look up pending transaction" });
        }

        if (!pendingTxn) {
          console.warn(`[Payment Security] Unauthorized/Invalid Order Verification attempt: Order ID ${razorpay_order_id} not found as PENDING.`);
          return res.status(404).json({ error: "Invalid payment request. No matching pending transaction found." });
        }

        if (pendingTxn.userId !== userId) {
          console.warn(`[Payment Security] User ID Mismatch! Authenticated User: ${userId}, Pending Transaction User: ${pendingTxn.userId}`);
          return res.status(403).json({ error: "Security Violation: Unauthorized payment verification." });
        }

        // 2. Compute and validate HMAC signature
        const secret = process.env.RAZORPAY_SECRET || "";
        if (!secret) return res.status(500).json({ error: "Payment configuration error" });

        const generated_signature = crypto
          .createHmac("sha256", secret)
          .update(razorpay_order_id + "|" + razorpay_payment_id)
          .digest("hex");

        if (generated_signature !== razorpay_signature) {
          console.warn(`[Payment Security] Signature verification failed for payment ${razorpay_payment_id}.`);
          return res.status(400).json({ success: false, error: "Invalid payment signature verification failed." });
        }

        // 3. Double-check directly with Razorpay API to prevent any front-end manipulation
        let amount = 0;
        if (razorpay) {
          try {
            // Fetch order details from Razorpay to re-verify the amount
            const rzpOrder = await razorpay.orders.fetch(razorpay_order_id);
            if (!rzpOrder) {
              return res.status(400).json({ error: "Razorpay order not found on provider." });
            }
            
            // Fetch payment details from Razorpay to re-verify status & order id
            const rzpPayment = await razorpay.payments.fetch(razorpay_payment_id);
            if (!rzpPayment) {
              return res.status(400).json({ error: "Razorpay payment details not found on provider." });
            }

            // Secure server-side validation checks
            if (rzpPayment.status !== "captured" && rzpPayment.status !== "authorized") {
              return res.status(400).json({ error: `Razorpay payment is not captured/authorized. Status: ${rzpPayment.status}` });
            }

            if (rzpPayment.order_id !== razorpay_order_id) {
              return res.status(400).json({ error: "Security Mismatch: Payment order ID does not match request order ID." });
            }

            // Verify the paid amount matches the pending transaction's amount (Razorpay amount is in paise)
            const expectedAmountPaise = Math.round(pendingTxn.amount * 100);
            if (Math.abs(rzpPayment.amount - expectedAmountPaise) > 10) { // allow small tolerance
              return res.status(400).json({ error: "Security Mismatch: Paid amount does not match expected transaction amount." });
            }

            amount = Number(rzpOrder.amount) / 100;
          } catch (rzpErr: any) {
            console.error("[Payment Security] Razorpay Provider API call failed:", rzpErr);
            return res.status(400).json({ error: `Failed to verify payment with Razorpay Provider: ${rzpErr.message || rzpErr}` });
          }
        } else {
          if (process.env.NODE_ENV === "production") {
            return res.status(400).json({ error: "Razorpay integration is not initialized on production. Payment verification failed." });
          }
          // Fallback safely for development
          amount = Number(pendingTxn.amount || req.body.amount || 0);
        }

        // 4. Securely process the payment in the database (atomically increment balance & log success)
        const result = await processSuccessfulPayment(userId, amount, razorpay_payment_id, razorpay_order_id, couponCode);
        return res.json(result);

      } catch (err: any) {
        console.error("[Payment Engine] Manual verification process failed:", err);
        return res.status(500).json({ error: err.message || "DB update failed" });
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

  app.post("/api/coupons/verify", verifyAllowedSource, verifyAuth, async (req: any, res: any) => {
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
    serviceName: z.string().optional(),
    link: z.string(),
    quantity: z.number().int().positive(),
    originalCost: z.number().optional(),
    couponCode: z.string().optional()
  });

  app.post("/api/orders/place", verifyAllowedSource, verifyAuth, async (req: any, res: any) => {

    const validation = placeOrderSchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ error: "Invalid input. Quantity must be a positive integer." });
    
    const { userId, serviceId, serviceName, link, quantity, originalCost, couponCode } = validation.data;
    
    if (req.user.id !== userId) return res.status(403).json({ error: "Unauthorized user mismatch" });

    // Validate and sanitize order link parameter to eliminate injection and XSS exploits
    const cleanLink = String(link || "").trim();
    const hasHtmlOrScript = /<[^>]*>|javascript:|onerror=|onload=|onclick=/i.test(cleanLink);
    if (hasHtmlOrScript || cleanLink.includes("<") || cleanLink.includes(">")) {
        return res.status(400).json({ error: "Invalid link format. HTML tags or script protocols are strictly forbidden." });
    }
    
    // Acquire sequential order placement lock for this user to neutralize any Burp Suite race condition/double-spending exploits
    const acquired = await UserLock.acquire(`place_order_${userId}`);
    if (!acquired) {
      return res.status(429).json({ error: "An order transaction is already in progress for this account. Please wait." });
    }

    try {
        // Duplicate check
        const { data: existingOrder } = await supabaseAdmin.from('orders')
            .select('id').eq('link', cleanLink).eq('serviceId', serviceId).in('status', ['Pending', 'Processing']).limit(1);
        if (existingOrder && existingOrder.length > 0) return res.status(400).json({ error: "An active order for this link already exists." });

        // User check
        const { data: user } = await supabaseAdmin.from('users').select('*').eq('id', userId).single();
        if (!user) return res.status(404).json({ error: "User not found" });
        if (user.isBanned) {
            // Auto-ban system disabled as requested by the owner
            // return res.status(403).json({ error: "User is banned" });
        }

        // Securely calculate cost from database
        const { data: dbService } = await supabaseAdmin.from('services')
            .select('name, rate, min, max, customMarginPercent, customMarginFixed, isEnabled')
            .eq('service', serviceId)
            .single();

        if (!dbService) return res.status(404).json({ error: "Service not found" });

        // Ensure the service is active and enabled to block any exploit tool calling disabled services
        if (dbService.isEnabled === false) {
            return res.status(400).json({ error: "This service is currently disabled or unavailable." });
        }

        // Always resolve service name securely from database to neutralize client-side tampering or XSS
        const finalServiceName = dbService.name || serviceName || "SMM Service";

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
            const couponApplied = await secureUseCoupon(c.code, userId);
            
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

        // DOUBLE-CHECK BALANCE: Prevent placing order if user balance is insufficient (Burp Suite exploit safety)
        const userLiveBalance = parseFloat(user.balance || 0);
        if (userLiveBalance < finalCost) {
            return res.status(400).json({ error: `Insufficient balance. Required: ₹${finalCost.toFixed(2)}, Available: ₹${userLiveBalance.toFixed(2)}` });
        }

        const orderId = `ord_${Date.now()}`;
        const txnId = `txn_${Date.now()}`;

        // Safely Deduct Balance (Atomic with fallback lock)
        const deducted = await secureDecrementBalance(userId, finalCost);
        if (!deducted) {
            return res.status(400).json({ error: "Insufficient balance." });
        }

        // Insert Order
        const { error: orderErr } = await supabaseAdmin.from('orders').insert({
            id: orderId, userId, serviceId, serviceName: finalServiceName, link: cleanLink, quantity, charge: finalCost,
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
                    await secureAddReferralCommission(user.referred_by, commission);
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
              link: cleanLink,
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
                        const match = history.find((p) => String(p.link) === String(cleanLink) && String(p.service) === String(serviceId));
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
    } catch (err: any) {
        console.error("Order placement route failure:", err);
        res.status(500).json({ error: err.message || "Server error" });
    } finally {
        UserLock.release(`place_order_${userId}`);
        await verifyUserBalanceConsistency(userId).catch(e => console.error("Balance recheck error in order placement:", e));
    }
  });

  // Secure Admin Balance Update
  const balanceUpdateSchema = z.object({
    userId: z.string().uuid(),
    amount: z.number().min(0),
  });

  app.get("/api/admin/security/logs", verifyAllowedSource, verifyAdmin, async (req, res) => {
    try {
      cleanupOldLogs();
      const sortedLogs = [...systemLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      res.json({ logs: sortedLogs, bannedIps: [] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/security/purge-logs", verifyAllowedSource, verifyAdmin, async (req, res) => {
    try {
      cleanupOldLogs();
      res.json({ success: true, count: systemLogs.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/security/ban", verifyAllowedSource, verifyAdmin, async (req, res) => {
    const { ip, reason } = req.body;
    if (!ip) return res.status(400).json({ error: "IP address required" });
    try {
      await supabaseAdmin.from('transactions').upsert({
        id: `banned_ip_${ip}`,
        userId: null,
        amount: 0,
        type: 'BANNED_IP',
        status: 'ACTIVE',
        method: ip,
        utr: reason || 'Manual Ban',
        date: new Date().toISOString()
      }, { onConflict: 'id' });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/security/unban", verifyAllowedSource, verifyAdmin, async (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: "IP address required" });
    try {
      await supabaseAdmin.from('transactions').update({ status: 'REVOKED' }).eq('id', `banned_ip_${ip}`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const dbProxySchema = z.object({
    table: z.string(),
    action: z.enum(['insert', 'update', 'upsert', 'delete']),
    payload: z.any().optional(),
    match: z.record(z.string(), z.any()).optional(),
    neq: z.record(z.string(), z.any()).optional(),
    inFilter: z.object({ column: z.string(), values: z.array(z.any()) }).optional(),
  });

  
  app.post("/api/db-read", verifyAllowedSource, async (req: any, res: any) => { console.log("HIT DB READ!");
    try {
      const { table, match = {}, limit: limitVal, order: orderVal } = req.body;
      if (!table) return res.status(400).json({ error: "Table is required" });

      let user: any = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const { data: { user: authUser }, error: authErr } = await supabaseAdmin.auth.getUser(token);
        if (!authErr && authUser) {
          const { data: profile } = await supabaseAdmin.from('users').select('*').eq('id', authUser.id).single();
          user = profile || authUser;
        }
      }

      // Security checks
      const isAdmin = user && (user.email === 'gauravbeniwal30003@gmail.com' || user.email === 'gauravbeniwal3003@gmail.com');
      
      const safeMatch = (match && typeof match === 'object') ? { ...match } : {};

      if (!isAdmin) {
         if (table === 'coupons') return res.status(403).json({ error: 'Access denied to coupons table.' });
         if (['orders', 'transactions', 'users'].includes(table)) {
             if (!user) return res.status(401).json({ error: "Unauthorized" });
             
             // Enforce row level security via proxy if not admin
             if (table === 'users') {
                 const isOwnProfile = safeMatch.id === user.id;
                 const isReferralQuery = safeMatch.referred_by === user.id;
                 const isReferralCodeQuery = !!safeMatch.referral_code;

                 if (!isOwnProfile && !isReferralQuery && !isReferralCodeQuery && !safeMatch.name) {
                     return res.status(403).json({ error: "Forbidden: Unauthorized users table query." });
                 }
             } else if (table === 'orders' || table === 'transactions') {
                 safeMatch.userId = user.id;
             }
         }
      }

      // Restrict query columns to prevent unauthorized users from harvesting password hashes, balances, or secret API keys via referral lookups
      let selectColumns = '*';
      if (!isAdmin && table === 'users') {
          const isOwnProfile = safeMatch.id === user.id;
          if (!isOwnProfile) {
              selectColumns = 'id, name, referral_code, created_at';
          }
      }

      let query = supabaseAdmin.from(table).select(selectColumns);
      
      for (const [k, v] of Object.entries(safeMatch)) {
          if (v && typeof v === 'object') {
             if ('lt' in v) query = query.lt(k, (v as any).lt);
             else if ('gt' in v) query = query.gt(k, (v as any).gt);
             else if ('neq' in v) query = query.neq(k, (v as any).neq);
             else if ('in' in v) query = query.in(k, (v as any).in);
             else if ('is' in v) query = query.is(k, (v as any).is);
             else if ('not_null' in v) query = query.not(k, 'is', null);
          } else {
             query = query.eq(k, v);
          }
      }

      if (limitVal) query = query.limit(limitVal);
      if (orderVal) {
          const [col, dir] = orderVal.split('.');
          query = query.order(col, { ascending: dir === 'asc' });
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      
      return res.json({ success: true, data });
    } catch (e: any) {
      console.error("[DB Proxy Error]:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/security-log", verifyAllowedSource, async (req: any, res: any) => {
    cleanupOldLogs();
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const { hint, userAgent, location } = req.body;
    
    const isHacker = hint && (
      hint.toLowerCase().includes("mohit") || 
      hint.toLowerCase().includes("cmdbrowser") || 
      hint.toLowerCase().includes("cmd-browser")
    );

    const logId = `client_track_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    systemLogs.push({
      id: logId,
      timestamp: new Date().toISOString(),
      ip: String(ip),
      method: "POST",
      url: "/api/admin/security-log",
      actorType: "ANONYMOUS",
      actorName: isHacker ? "MOHIT (HACKER DETECTED)" : "Security Tracker",
      details: hint ? `Tracker Alert: ${hint} (UA: ${userAgent || 'none'}, Loc: ${location || 'unknown'})` : `Client-side forensic beacon received.`,
      status: isHacker ? 403 : 200
    });

    console.error("[SECURITY TRACKING ALERT]", req.body);
    res.json({ success: true });
  });

  app.post("/api/admin/db-proxy", verifyAllowedSource, verifyAdmin, async (req: any, res: any) => {
    try {
      const validation = dbProxySchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: "Invalid proxy payload" });
      
      const { table, action, payload, match, neq, inFilter } = validation.data;

      // Handle logging for admin balance updates via proxy
      if (table === "users" && payload && "balance" in payload) {
        let fetchQuery = supabaseAdmin.from("users").select("id, balance");
        if (match) {
          for (const [key, value] of Object.entries(match || {})) {
            fetchQuery = fetchQuery.eq(key, value);
          }
        }
        if (neq) {
          for (const [key, value] of Object.entries(neq || {})) {
            fetchQuery = fetchQuery.neq(key, value);
          }
        }
        if (inFilter) {
          fetchQuery = fetchQuery.in(inFilter.column, inFilter.values);
        }

        const { data: usersToUpdate } = await fetchQuery;
        if (usersToUpdate && usersToUpdate.length > 0) {
          for (const ou of usersToUpdate) {
            const oldBal = parseFloat(ou.balance || 0);
            const newBal = parseFloat((payload as any).balance || 0);
            const diff = newBal - oldBal;
            if (diff !== 0) {
              await supabaseAdmin.from("transactions").insert({
                id: `adm_prox_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                userId: ou.id,
                amount: Math.abs(diff),
                type: diff > 0 ? "DEPOSIT" : "SPEND",
                status: "SUCCESS",
                method: "MANUAL_BY_ADMIN",
                utr: `Admin manual update via proxy (Diff: ${diff > 0 ? "+" : ""}${diff.toFixed(2)})`,
                date: new Date().toISOString()
              });
            }
          }
        }
      }

      let query = supabaseAdmin.from(table)[action](payload as any);
      
      if (match) {
        for (const [key, value] of Object.entries(match || {})) {
          query = query.eq(key, value);
        }
      }
      if (neq) {
        for (const [key, value] of Object.entries(neq || {})) {
          query = query.neq(key, value);
        }
      }
      if (inFilter) {
        query = query.in(inFilter.column, inFilter.values);
      }
      
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      
      return res.json({ success: true, data });
    } catch (e: any) {
      console.error("[DB Proxy Error]:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/update-balance", verifyAllowedSource, verifyAdmin, async (req, res) => {
    const validation = balanceUpdateSchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ error: "Invalid input" });

    const { userId, amount } = validation.data;

    try {
      // Fetch old user profile to calculate diff for transaction logging
      const { data: oldUser } = await supabaseAdmin
        .from('users')
        .select('balance')
        .eq('id', userId)
        .single();

      const oldBal = parseFloat(oldUser?.balance || 0);
      const diff = amount - oldBal;

      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ balance: amount })
        .eq('id', userId);

      if (error) throw error;

      if (diff !== 0) {
        await supabaseAdmin.from('transactions').insert({
          id: `adm_bal_${Date.now()}`,
          userId: userId,
          amount: Math.abs(diff),
          type: diff > 0 ? 'DEPOSIT' : 'SPEND',
          status: 'SUCCESS',
          method: 'MANUAL_BY_ADMIN',
          utr: `Admin manual balance update (Diff: ${diff > 0 ? '+' : ''}${diff.toFixed(2)})`,
          date: new Date().toISOString()
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Admin balance update failure:", error);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/users/transfer-referral", verifyAllowedSource, verifyAuth, async (req: any, res: any) => {
    const userId = req.user.id;
    try {
        let transferAmount;
        try {
          transferAmount = await secureTransferReferralBalance(userId);
        } catch (rpcErr: any) {
          return res.status(400).json({ error: `RPC failed: ${rpcErr.message}` });
        }
        
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
  app.post("/api/auth/lookup", verifyAllowedSource, authLookupLimiter, async (req: any, res: any) => {
    const { action, value } = req.body;
    if (!action || value === undefined || value === null) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const cleanValue = String(value).trim();

    try {
      if (action === "getEmailByMobile") {
        if (!/^\d{10}$/.test(cleanValue)) {
          return res.status(400).json({ error: "Invalid mobile number format. Must be exactly 10 digits." });
        }
        const { data, error } = await supabaseAdmin
          .from('users')
          .select('email')
          .eq('mobile', cleanValue)
          .maybeSingle();
        
        if (error) throw error;
        return res.json({ email: data?.email || null });
      }

      if (action === "checkUsernameUnique") {
        if (cleanValue.length < 2 || cleanValue.length > 50) {
          return res.status(400).json({ error: "Invalid username length." });
        }
        const { data, error } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('name', cleanValue)
          .maybeSingle();

        if (error) throw error;
        return res.json({ unique: !data });
      }

      if (action === "checkMobileUnique") {
        if (!/^\d{10}$/.test(cleanValue)) {
          return res.status(400).json({ error: "Invalid mobile number format. Must be exactly 10 digits." });
        }
        const { data, error } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('mobile', cleanValue)
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

  // Comprehensive SQL Injection & XSS pattern detector
  function detectExploitPatterns(value: string): { matched: boolean; pattern?: string } {
    const lower = value.toLowerCase();
    
    // SQL injection payloads / signatures
    const sqlRegexes = [
      /('|")\s*(or|and)\s+.*=.*(--|\/\*|#)?/i,                     // ' or 1=1 --
      /(union\s+all\s+select|union\s+select)/i,                     // UNION SELECT
      /(select\s+.*\s+from|insert\s+into|delete\s+from|drop\s+table|update\s+.*\s+set)/i, // Basic SQL CRUD DDL
      /(--|\/\*|\*\/|#\s*$)/,                                       // Comments or SQL commands
      /(xp_cmdshell|pg_sleep|sleep\s*\(|benchmark\s*\()/i,          // RCE & Time delays
      /exec(\s+char|\s+xp_|\s+sp_|\s+execute)/i,                     // Stored procedures
      /concat\s*\(\s*(char|'|")/i,                                  // Concat strings bypasses
    ];

    for (const regex of sqlRegexes) {
      if (regex.test(lower)) {
        return { matched: true, pattern: `SQL Injection Pattern: ${regex.toString()}` };
      }
    }

    // Direct string checks for SQL syntax high-risk constructs
    const directKeywords = [
      "or 1=1", "or '1'='1'", "or \"1\"=\"1\"", 
      "and 1=1", "and '1'='1'", "and \"1\"=\"1\"",
      "drop database", "drop table", "truncate table", 
      "union select", "select current_user", "select pg_sleep",
      "<script>", "javascript:", "onload=", "onerror="
    ];

    for (const keyword of directKeywords) {
      if (lower.includes(keyword)) {
        return { matched: true, pattern: `Malicious Keyword/XSS Pattern: "${keyword}"` };
      }
    }

    return { matched: false };
  }

  // Pre-validate signup details on the backend (Filters for SQL injection and exploits)
  app.post("/api/auth/validate-signup", verifyAllowedSource, authLookupLimiter, async (req: any, res: any) => {
    const { email, name, password, mobile, refCode } = req.body;
    
    // Check if any of these values contain malicious SQL injection or XSS patterns
    const inputs = { email, name, password, mobile, refCode };
    for (const [key, val] of Object.entries(inputs)) {
      if (val && typeof val === "string") {
        const exploitResult = detectExploitPatterns(val);
        if (exploitResult.matched) {
          const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
          console.error(`[SQL INJECTION/EXPLOIT BLOCKED] on ${key}: "${val}" from IP: ${ip}. Pattern: ${exploitResult.pattern}`);
          
          // Log to Forensic Security Panel live
          const logId = `exploit_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          systemLogs.push({
            id: logId,
            timestamp: new Date().toISOString(),
            ip: String(ip),
            method: "POST",
            url: "/api/auth/validate-signup",
            actorType: "ANONYMOUS",
            actorName: "HACKER / MALICIOUS IP",
            details: `BLOCKED EXPLOIT ATTEMPT: SQL Injection signature detected in ${key}. Pattern matched: ${exploitResult.pattern}`,
            status: 400
          });
          
          return res.status(400).json({
            error: "Security Alert: Malicious SQL injection or exploit characters detected in signup form. Your IP has been logged and reported.",
            highRiskMatched: true
          });
        }
      }
    }

    // Email validation
    if (email && typeof email === 'string') {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail.endsWith("@gmail.com")) {
        return res.status(400).json({ error: "Only @gmail.com email addresses are allowed to register." });
      }
    }

    // Name validation
    if (name && typeof name === 'string') {
      const cleanName = name.trim();
      if (cleanName.length < 2 || cleanName.length > 50) {
        return res.status(400).json({ error: "Username must be between 2 and 50 characters." });
      }
    }

    // Mobile check if supplied
    if (mobile && typeof mobile === 'string') {
      const cleanMobile = mobile.trim();
      if (!/^\d{10}$/.test(cleanMobile)) {
        return res.status(400).json({ error: "Invalid mobile number. Must be exactly 10 digits." });
      }
    }

    return res.json({ success: true, message: "Inputs are safe." });
  });

  // Synchronize/Create User Profile safely bypassing RLS

  app.post("/api/users/generate-api-key", verifyAllowedSource, verifyAuth, async (req: any, res: any) => {
    try {
      const newKey = crypto.randomUUID().replace(/-/g, '');
      const { error } = await supabaseAdmin.from('users').update({ api_key: newKey }).eq('id', req.user.id);
      if (error) throw error;
      res.json({ success: true, api_key: newKey });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/sync-user", verifyAllowedSource, verifyAuth, async (req: any, res: any) => {
    const { name, mobile, referredByCode } = req.body;
    const { id, email } = req.user;

    // Secure backend verification for @gmail.com email address
    if (!email || !String(email).trim().toLowerCase().endsWith("@gmail.com")) {
      return res.status(403).json({ error: "Only @gmail.com email addresses are authorized." });
    }

    // Type enforcement to prevent NoSQL object injections
    const safeName = name ? String(name).trim() : undefined;
    const safeMobile = mobile ? String(mobile).trim() : undefined;
    const safeReferredByCode = referredByCode ? String(referredByCode).trim() : undefined;

    // Validate formats & lengths
    if (safeName && safeName.length > 50) return res.status(400).json({ error: "Name too long." });
    if (safeMobile) {
      if (!/^\d{10}$/.test(safeMobile)) {
        return res.status(400).json({ error: "Invalid mobile number. Must be exactly 10 digits." });
      }
    }
    if (safeReferredByCode && safeReferredByCode.length > 20) return res.status(400).json({ error: "Referral code too long." });

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
        if (safeName && !existingUser.name) updates.name = safeName;
        if (safeMobile && !existingUser.mobile) updates.mobile = safeMobile;

        // If the trigger created the user but couldn't set referred_by, do it here once.
        if (safeReferredByCode && !existingUser.referred_by) {
            const { data: refUser } = await supabaseAdmin
              .from('users')
              .select('id')
              .eq('referral_code', safeReferredByCode.toUpperCase())
              .maybeSingle();
            
            if (refUser && refUser.id !== id) {
              updates.referred_by = refUser.id;
              
              // Give signup bonus if enabled
              const { data: configData } = await supabaseAdmin.from('settings').select('*').eq('id', 'global').single();
              if (configData && configData.isReferralSystemEnabled && configData.referralSignupBonus > 0) {
                 await secureIncrementBalance(id, configData.referralSignupBonus);
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

  // GLOBAL ERROR HANDLER TO ENSURE JSON RESPONSES
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Global Express Error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
      type: err.type || "UnknownError"
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
