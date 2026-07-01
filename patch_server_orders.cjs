const fs = require('fs');

let code = fs.readFileSync('/app/applet/server.ts', 'utf8');

const placeOrderCode = `
  const placeOrderSchema = z.object({
    userId: z.string().uuid(),
    serviceId: z.string(),
    serviceName: z.string(),
    link: z.string(),
    quantity: z.number(),
    originalCost: z.number(),
    couponCode: z.string().optional()
  });

  app.post("/api/orders/place", verifyAuth, async (req, res) => {
    const validation = placeOrderSchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ error: "Invalid input" });
    
    const { userId, serviceId, serviceName, link, quantity, originalCost, couponCode } = validation.data;
    
    if (req.user.id !== userId) return res.status(403).json({ error: "Unauthorized user mismatch" });
    
    try {
        // Duplicate check
        const { data: existingOrder } = await supabaseAdmin.from('orders')
            .select('id').eq('link', link).eq('serviceId', serviceId).in('status', ['PENDING', 'PROCESSING']).limit(1);
        if (existingOrder && existingOrder.length > 0) return res.status(400).json({ error: "An active order for this link already exists." });

        // User check
        const { data: user } = await supabaseAdmin.from('users').select('*').eq('id', userId).single();
        if (!user) return res.status(404).json({ error: "User not found" });
        if (user.isBanned) return res.status(403).json({ error: "User is banned" });

        let finalCost = Number(originalCost);
        
        // Coupon Logic
        if (couponCode) {
            const { data: c } = await supabaseAdmin.from('coupons').select('*').eq('code', couponCode).single();
            if (c && c.isEnabled && new Date(c.expiryDate) > new Date() && (c.usageLimit === 0 || c.usedCount < c.usageLimit)) {
                if (c.discountType === 'PERCENTAGE') finalCost = finalCost - (finalCost * (c.discountValue / 100));
                else finalCost = finalCost - c.discountValue;
                finalCost = Math.max(0, finalCost);
                
                await supabaseAdmin.from('coupons').update({ usedCount: c.usedCount + 1 }).eq('id', c.id);
            }
        }

        if (user.balance < finalCost) return res.status(400).json({ error: "Insufficient balance." });

        const orderId = \`ord_\${Date.now()}\`;
        const txnId = \`txn_\${Date.now()}\`;

        // Update Balance
        const { error: balErr } = await supabaseAdmin.from('users').update({ balance: user.balance - finalCost }).eq('id', userId);
        if (balErr) throw balErr;

        // Insert Order
        const { error: orderErr } = await supabaseAdmin.from('orders').insert({
            id: orderId, userId, serviceId, serviceName, link, quantity, charge: finalCost,
            status: 'PENDING', remains: quantity, date: new Date().toISOString()
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
                const commission = (finalCost * configData.referral_commission_percent) / 100;
                const { data: referrer } = await supabaseAdmin.from('users').select('id, referral_balance, total_referral_earnings').eq('id', user.referred_by).single();
                if (referrer) {
                    await supabaseAdmin.from('users').update({ 
                        referral_balance: (referrer.referral_balance || 0) + commission,
                        total_referral_earnings: (referrer.total_referral_earnings || 0) + commission
                    }).eq('id', referrer.id);
                }
            }
        }

        res.json({ success: true, orderId });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
  });
`;

code = code.replace('// Secure Admin Balance Update', placeOrderCode + '\n  // Secure Admin Balance Update');

fs.writeFileSync('/app/applet/server.ts', code);
console.log('Added /api/orders/place');
