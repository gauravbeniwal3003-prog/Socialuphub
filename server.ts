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

console.log("Starting server script...");

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
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
      return res.json({ error: "API key is required" });
    }
    if (!action) {
      return res.json({ error: "Action is required" });
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
        return res.json({ error: "Your API account has been suspended" });
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

        // Fetch categories to group services category-wise based on category sort order
        const { data: categories } = await supabaseAdmin
          .from('categories')
          .select('name, sortOrder')
          .eq('isEnabled', true)
          .order('sortOrder', { ascending: true });

        const categoryOrderMap = new Map<string, number>();
        (categories || []).forEach((cat: any, index: number) => {
          categoryOrderMap.set(cat.name, index);
        });

        // Fetch config to apply margins & custom API discounts
        const { data: config } = await supabaseAdmin
          .from('settings')
          .select('*')
          .eq('id', 'global')
          .single();

        const globalMarginPercent = parseFloat(config?.globalMarginPercent || 0);
        const globalMarginFixed = parseFloat(config?.globalMarginFixed || 0);
        const apiDiscount = parseFloat(config?.apiDiscountPercent || 0);

        const formatted = (services || []).map((s: any) => {
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
        const serviceId = String(data.service || "");
        const link = String(data.link || "");
        const qtyVal = parseInt(data.quantity || "0");

        if (!serviceId || !link || qtyVal <= 0) {
          return res.json({ error: "Missing required fields (service, link, quantity)" });
        }

        // Fetch service details
        const { data: service, error: srvErr } = await supabaseAdmin
          .from('services')
          .select('*')
          .eq('service', serviceId)
          .single();

        if (srvErr || !service) {
          return res.json({ error: "Service not found" });
        }
        if (!service.isEnabled) {
          return res.json({ error: "Service is currently disabled" });
        }

        let minQty = parseInt(service.min || 10);
        if (minQty >= 0 && minQty <= 99) {
          minQty = 100;
        }
        const maxQty = parseInt(service.max || 10000);

        if (qtyVal < minQty) {
          return res.json({ error: `Min quantity is ${minQty}` });
        }
        if (qtyVal > maxQty) {
          return res.json({ error: `Max quantity is ${maxQty}` });
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
          return res.json({ error: "not enough balance" });
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

        return res.json({ order: orderId });
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

      return res.json({ error: "Unsupported API action" });
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
