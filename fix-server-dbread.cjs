const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const dbReadEndpoint = `
  app.post("/api/db-read", verifyAllowedSource, async (req: any, res: any) => {
    try {
      const { table, match = {}, limit: limitVal, order: orderVal } = req.body;
      if (!table) return res.status(400).json({ error: "Table is required" });

      let user: any = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
        if (!authErr && authUser) {
          const { data: profile } = await supabase.from('users').select('*').eq('id', authUser.id).single();
          user = profile || authUser;
        }
      }

      // Security checks
      const isAdmin = user && (user.email === 'gauravbeniwal30003@gmail.com' || user.email === 'gauravbeniwal3003@gmail.com' || user.role === 'Admin');
      
      if (!isAdmin) {
         if (['orders', 'transactions', 'users'].includes(table)) {
             if (!user) return res.status(401).json({ error: "Unauthorized" });
             
             // Enforce row level security via proxy if not admin
             if (table === 'users' && match.id !== user.id && match.referred_by !== user.id) {
                 if (match.referral_code) {
                    // Allowed to lookup by referral_code
                 } else if (match.lastLogin || match.referred_by) {
                     // Allowed for cron / stats?
                     if (!match.referred_by || match.referred_by !== user.id) {
                         return res.status(403).json({ error: "Forbidden" });
                     }
                 }
             } else if ((table === 'orders' || table === 'transactions') && match.userId !== user.id) {
                 // Cron jobs might query pending orders without user context
                 if (!req.body.allowSystem) {
                     match.userId = user.id;
                 }
             }
         }
      }

      let query = supabase.from(table).select('*');
      
      for (const [k, v] of Object.entries(match)) {
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
      if (error) return res.status(400).json({ error: error.message });
      
      res.json({ success: true, data: data || [] });
    } catch (error: any) {
      console.error("DB Read Proxy Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });
`;

code = code.replace(
  /app\.post\("\/api\/admin\/db-proxy",/g,
  dbReadEndpoint + "\n  app.post(\"/api/admin/db-proxy\","
);

fs.writeFileSync('server.ts', code);
