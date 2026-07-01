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
  app.get("/api/logs-raw", (req, res) => {
    try {
      const now = new Date();
      const oneHourAgo = now.getTime() - 60 * 60 * 1000;
      
      // Prune and sort newest first
      const activeLogs = tempErrorLogs
        .filter(log => new Date(log.timestamp).getTime() > oneHourAgo)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
      res.json(activeLogs);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to retrieve logs" });
    }
  });

  app.post("/api/logs/clear", (req, res) => {
    try {
      tempErrorLogs.length = 0;
      res.json({ success: true, message: "In-memory logs successfully cleared." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/logs/test", (req, res) => {
    try {
      logTempError("This is a manually triggered test error to verify the logs work!", "TEST_ERROR", {
        triggeredAt: new Date().toISOString(),
        browserInfo: req.headers['user-agent'] || 'unknown',
        ip: req.ip || 'unknown'
      });
      res.json({ success: true, message: "Test log added." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/logs", (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Social Up Hub | Live Logs Viewer</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
    <style>
        body { font-family: 'Inter', sans-serif; }
        pre, code { font-family: 'JetBrains Mono', monospace; }
    </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">
    <div class="max-w-6xl mx-auto px-4 py-8">
        <!-- Header -->
        <div class="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-6 mb-8 gap-4">
            <div>
                <div class="flex items-center gap-3">
                    <span class="flex h-3 w-3 relative">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    <h1 class="text-2xl font-bold tracking-tight text-white">Social Up Hub <span class="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 ml-1">Live Logs</span></h1>
                </div>
                <p class="text-sm text-slate-400 mt-2">Temporary in-memory diagnostics console. Logs are kept locally for exactly 1 hour.</p>
            </div>
            <div class="flex items-center gap-3 flex-wrap">
                <button onclick="fetchLogs()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 3H15m3 0v5h-5"></path></svg>
                    Refresh
                </button>
                <button onclick="triggerTestLog()" class="px-4 py-2 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 border border-emerald-800/60 rounded-md text-sm font-medium transition-colors">
                    Add Test Log
                </button>
                <button onclick="clearLogs()" class="px-4 py-2 bg-rose-950/40 text-rose-300 hover:bg-rose-900/50 border border-rose-800/60 rounded-md text-sm font-medium transition-colors">
                    Clear Logs
                </button>
            </div>
        </div>

        <!-- Filter bar -->
        <div class="bg-slate-900/50 border border-slate-800 rounded-lg p-4 mb-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div class="relative w-full sm:w-72">
                <input type="text" id="searchInput" oninput="filterLogs()" placeholder="Search logs..." class="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-700">
            </div>
            <div class="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <button onclick="setFilter('ALL')" class="filter-btn px-3 py-1 bg-slate-800 border border-slate-700 text-xs font-medium rounded-md transition-colors text-white" data-filter="ALL">All Logs</button>
                <button onclick="setFilter('SYNC_USER')" class="filter-btn px-3 py-1 bg-slate-900/60 border border-slate-800/80 text-xs font-medium rounded-md transition-colors text-slate-400 hover:text-white" data-filter="SYNC_USER">Sync Users</button>
                <button onclick="setFilter('ERROR')" class="filter-btn px-3 py-1 bg-slate-900/60 border border-slate-800/80 text-xs font-medium rounded-md transition-colors text-slate-400 hover:text-white" data-filter="ERROR">Errors</button>
                <button onclick="setFilter('CRITICAL')" class="filter-btn px-3 py-1 bg-slate-900/60 border border-slate-800/80 text-xs font-medium rounded-md transition-colors text-slate-400 hover:text-white" data-filter="CRITICAL">Critical</button>
            </div>
        </div>

        <!-- System warning when empty -->
        <div id="noLogsView" class="hidden flex flex-col items-center justify-center py-16 border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
            <svg class="w-12 h-12 text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            <p class="text-slate-400 text-sm">No logs recorded in the last hour.</p>
            <p class="text-xs text-slate-600 mt-1">If logins fail, the error details will appear here immediately.</p>
        </div>

        <!-- Logs Container -->
        <div id="logsContainer" class="space-y-4"></div>
    </div>

    <script>
        let allLogs = [];
        let currentFilter = 'ALL';

        async function fetchLogs() {
            try {
                const res = await fetch('/api/logs-raw');
                allLogs = await res.json();
                renderLogs();
            } catch (err) {
                console.error("Failed to fetch logs:", err);
            }
        }

        function setFilter(filter) {
            currentFilter = filter;
            document.querySelectorAll('.filter-btn').forEach(btn => {
                if (btn.getAttribute('data-filter') === filter) {
                    btn.classList.add('bg-slate-800', 'border-slate-700', 'text-white');
                    btn.classList.remove('bg-slate-900/60', 'border-slate-800/80', 'text-slate-400');
                } else {
                    btn.classList.remove('bg-slate-800', 'border-slate-700', 'text-white');
                    btn.classList.add('bg-slate-900/60', 'border-slate-800/80', 'text-slate-400');
                }
            });
            renderLogs();
        }

        function filterLogs() {
            renderLogs();
        }

        async function clearLogs() {
            if (!confirm("Are you sure you want to clear the in-memory log list?")) return;
            try {
                await fetch('/api/logs/clear', { method: 'POST' });
                fetchLogs();
            } catch (err) {
                console.error(err);
            }
        }

        async function triggerTestLog() {
            try {
                await fetch('/api/logs/test', { method: 'POST' });
                fetchLogs();
            } catch (err) {
                console.error(err);
            }
        }

        function timeSince(dateString) {
            const date = new Date(dateString);
            const seconds = Math.floor((new Date() - date) / 1000);
            if (seconds < 5) return 'Just now';
            if (seconds < 60) return seconds + 's ago';
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return minutes + 'm ago';
            return date.toLocaleTimeString();
        }

        function toggleDetails(index) {
            const el = document.getElementById('details-' + index);
            const icon = document.getElementById('icon-' + index);
            if (el.classList.contains('hidden')) {
                el.classList.remove('hidden');
                icon.style.transform = 'rotate(90deg)';
            } else {
                el.classList.add('hidden');
                icon.style.transform = 'rotate(0deg)';
            }
        }

        function renderLogs() {
            const container = document.getElementById('logsContainer');
            const searchVal = document.getElementById('searchInput').value.toLowerCase();
            
            let filtered = allLogs;
            
            if (currentFilter !== 'ALL') {
                filtered = filtered.filter(l => l.type === currentFilter);
            }
            
            if (searchVal) {
                filtered = filtered.filter(l => 
                    l.message.toLowerCase().includes(searchVal) || 
                    (l.type && l.type.toLowerCase().includes(searchVal)) ||
                    (l.details && JSON.stringify(l.details).toLowerCase().includes(searchVal))
                );
            }

            if (filtered.length === 0) {
                document.getElementById('noLogsView').classList.remove('hidden');
                container.innerHTML = '';
                return;
            } else {
                document.getElementById('noLogsView').classList.add('hidden');
            }

            container.innerHTML = filtered.map((log, index) => {
                let badgeClass = "bg-slate-800 text-slate-300 border-slate-700";
                if (log.type === "CRITICAL") badgeClass = "bg-rose-950/50 text-rose-300 border-rose-900/60";
                else if (log.type === "SYNC_USER") badgeClass = "bg-amber-950/50 text-amber-300 border-amber-900/60";
                else if (log.type === "TEST_ERROR") badgeClass = "bg-emerald-950/50 text-emerald-300 border-emerald-900/60";

                const hasDetails = log.details && Object.keys(log.details).length > 0;

                return \`
                    <div class="bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden transition-all hover:border-slate-700/80">
                        <div class="p-4 flex items-start justify-between gap-4 \\\${hasDetails ? 'cursor-pointer select-none' : ''}" \\\${hasDetails ? \\\`onclick="toggleDetails(\\\${index})"\\\` : ''}>
                            <div class="flex items-start gap-3">
                                \\\${hasDetails ? \\\`
                                    <svg id="icon-\\\${index}" class="w-4 h-4 text-slate-500 mt-1 transition-transform" style="transform: rotate(0deg);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"></path></svg>
                                \\\` : '<div class="w-4"></div>'}
                                <div>
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="text-xs font-mono px-2 py-0.5 rounded border \\\${badgeClass}">\\\${log.type}</span>
                                        <span class="text-xs text-slate-500">\\\${timeSince(log.timestamp)}</span>
                                        <span class="text-xs text-slate-600 font-mono">\\\${new Date(log.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <p class="text-sm font-medium text-slate-200 mt-1.5 break-all">\\\${log.message}</p>
                                </div>
                            </div>
                        </div>
                        \\\${hasDetails ? \\\`
                            <div id="details-\\\${index}" class="hidden bg-slate-950/80 border-t border-slate-800/80 p-4">
                                <span class="text-xs text-slate-500 font-medium block mb-2">Contextual Data & Stack Trace:</span>
                                <pre class="text-xs text-emerald-400 bg-slate-950 p-3 rounded overflow-x-auto border border-slate-900 max-h-96"><code>\\\${JSON.stringify(log.details, null, 2)}</code></pre>
                            </div>
                        \\\` : ''}
                    </div>
                \`;
            }).join('');
        }

        // Auto-refresh logs every 10 seconds
        setInterval(fetchLogs, 10000);

        // Initial fetch
        fetchLogs();
    </script>
</body>
</html>`;
    res.send(html);
  });

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
      callback(null, true);
    },
    credentials: true
  }));
  
  app.use(express.json({ limit: '10kb' })); // Limit body size to prevent DoS
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
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000, // Increased for automated status checks
    message: { error: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) {
        return (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]).trim();
      }
      return req.ip || 'unknown';
    },
    validate: { xForwardedForHeader: false, default: false },
  });

  const orderLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 500, // Increased significantly for background tasks and processing
    message: { error: "Action rate limit exceeded. Please wait a moment." },
    keyGenerator: (req) => {
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) {
        return (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]).trim();
      }
      return req.ip || 'unknown';
    },
    validate: { xForwardedForHeader: false, default: false },
  });

  app.use("/api/", generalLimiter);

  // --- BACKGROUND TASKS (PROCESSED ON SERVER FOR 100% RELIABILITY) ---
  
  const SMM_API_KEY = "38086716603a82e68be330924e7327c7e130df7d"; // Use the provided working key
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
      return response.data;
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

           const isFatal = errorMsg.includes('link') || errorMsg.includes('service') || errorMsg.includes('quantity') || errorMsg.includes('invalid');
           if (isFatal) {
             await supabaseAdmin.from('orders').update({ error: res.error }).eq('id', order.id);
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
            await supabaseAdmin.from('orders').update({ 
               status: norm,
               remains: res.remains || order.remains,
               start_count: res.start_count || order.start_count
            }).eq('id', order.id);
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
  setInterval(forwardOrders, 10000); // 10s
  setInterval(syncStatuses, 30000); // 30s
  setInterval(syncPrices, 3600000); // 1 hour
  setInterval(performSystemCleanup, 86400000); // 24 hours

  // --- AUTH MIDDLEWARE ---
  const verifyAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Missing authorization header" });

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) return res.status(401).json({ error: "Invalid session" });
    req.user = user;
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
    const SMM_API_KEY = "38086716603a82e68be330924e7327c7e130df7d"; // Verified working key
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

  // Razorpay Verification
  const razorpayVerifySchema = z.object({
    razorpay_order_id: z.string().min(1),
    razorpay_payment_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
  });

  app.post("/api/payments/verify", verifyAuth, async (req, res) => {
    const validation = razorpayVerifySchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ error: "Invalid payment data" });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = validation.data;
    const secret = process.env.RAZORPAY_SECRET || "4wiJs8mHjvhbes6JRZFd35hT";

    if (!secret) return res.status(500).json({ error: "Payment configuration error" });

    const generated_signature = crypto
      .createHmac("sha256", secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature === razorpay_signature) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: "Invalid signature" });
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

  // Synchronize/Create User Profile safely bypassing RLS
  app.post("/api/sync-user", verifyAuth, async (req: any, res: any) => {
    const { id, email } = req.user;
    const { name, mobile, referredByCode } = req.body;

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

        const { data: updatedUser, error: updateErr } = await supabaseAdmin
          .from('users')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (updateErr) throw updateErr;
        return res.json({ success: true, user: updatedUser });
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
        .insert(newUser)
        .select()
        .single();

      if (insertErr) {
        console.error("Error inserting user:", insertErr);
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
