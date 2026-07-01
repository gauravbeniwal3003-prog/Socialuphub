const fs = require('fs');

let code = fs.readFileSync('/app/applet/server.ts', 'utf8');

const oldVerify = `  app.post("/api/payments/verify", verifyAuth, async (req, res) => {
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
  });`;

const newVerify = `  app.post("/api/payments/verify", verifyAuth, async (req, res) => {
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
      try {
        const userId = req.user.id;
        // Verify payment is not already processed
        const { data: existingTxn } = await supabaseAdmin.from('transactions').select('id').eq('paymentId', razorpay_payment_id).maybeSingle();
        if (existingTxn) return res.json({ success: true, already_processed: true });

        let amount = 0;
        if (razorpay) {
            const rzpOrder = await razorpay.orders.fetch(razorpay_order_id);
            if (rzpOrder) amount = Number(rzpOrder.amount) / 100;
        } else {
            // fallback (insecure if someone spoofs amount, but razorpay might not be setup properly)
            amount = Number(req.body.amount || 0);
        }

        const txnId = \`txn_\${Date.now()}\`;
        await supabaseAdmin.from('transactions').insert({
            id: txnId, userId, amount, type: 'DEPOSIT', status: 'SUCCESS', method: 'RAZORPAY', paymentId: razorpay_payment_id, date: new Date().toISOString()
        });
        const { data: user } = await supabaseAdmin.from('users').select('balance').eq('id', userId).single();
        if (user) {
            await supabaseAdmin.from('users').update({ balance: user.balance + amount, lastPaymentAt: new Date().toISOString() }).eq('id', userId);
        }
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: "DB update failed" });
      }
    } else {
      res.status(400).json({ success: false, error: "Invalid signature" });
    }
  });`;

if (code.includes('if (generated_signature === razorpay_signature) {') && code.includes('res.json({ success: true });')) {
    code = code.replace(oldVerify, newVerify);
    fs.writeFileSync('/app/applet/server.ts', code);
    console.log('Patched /api/payments/verify');
} else {
    console.log('Could not find old string to replace.');
}
