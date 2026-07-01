const fs = require('fs');

let code = fs.readFileSync('/app/applet/services/mockStore.ts', 'utf8');

// Replace client-side handleRazorpaySuccess logic since we moved it to server.ts
const oldHandleRzp = `export const handleRazorpaySuccess = async (userId: string, amount: number, paymentId: string, orderId?: string, signature?: string) => {
    try {
        const user = await checkUserSecurity(userId);

        // --- SECURE BACKEND VERIFICATION ---
        if (orderId && signature) {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Authentication required for payment verification");

            const backendBase = getRenderBackendUrl();
            const urlObj = backendBase ? \`\${backendBase.replace(/\\/$/, "")}/api/payments/verify\` : "/api/payments/verify";

            const response = await fetch(urlObj, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': \`Bearer \${session.access_token}\`
                },
                body: JSON.stringify({
                    razorpay_order_id: orderId,
                    razorpay_payment_id: paymentId,
                    razorpay_signature: signature
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Payment verification failed");
            }
        }
        // --- END SECURE VERIFICATION ---
        
        const txnId = \`txn_\${Date.now()}\`;
        const { error: txnError } = await supabase.from('transactions').insert({ 
            id: txnId, userId: userId, amount: amount, type: 'DEPOSIT', status: 'SUCCESS', method: 'RAZORPAY', paymentId: paymentId, date: getISTTime(),
        });
        if (txnError) throw new Error("Log Failed");

        const newBalance = safeFloat(user.balance + amount);
        const { error: balError } = await supabase.from('users').update({ balance: newBalance, lastPaymentAt: getISTTime() }).eq('id', userId);
        if (balError) {
             await supabase.from('transactions').update({ status: 'FAILED' }).eq('id', txnId);
             throw new Error("Balance Update Failed");
        }

        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('force_balance_update', { detail: { balance: newBalance } }));
        invalidateCache(['suh_cache_users', 'suh_cache_transactions']);
        return { success: true };
    } catch (e: any) {
        logTempError(\`Razorpay Error \${userId}\`, e.message);
        throw e;
    }
};`;

const newHandleRzp = `export const handleRazorpaySuccess = async (userId: string, amount: number, paymentId: string, orderId?: string, signature?: string) => {
    try {
        const user = await checkUserSecurity(userId);

        if (orderId && signature) {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Authentication required for payment verification");

            const backendBase = getRenderBackendUrl();
            const urlObj = backendBase ? \`\${backendBase.replace(/\\/$/, "")}/api/payments/verify\` : "/api/payments/verify";

            const response = await fetch(urlObj, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': \`Bearer \${session.access_token}\`
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
        }
        
        invalidateCache(['suh_cache_users', 'suh_cache_transactions']);
        return { success: true };
    } catch (e: any) {
        logTempError(\`Razorpay Error \${userId}\`, e.message);
        throw e;
    }
};`;

code = code.replace(oldHandleRzp, newHandleRzp);


const oldPlaceOrder = `        const { error: balErr } = await supabase.from('users').update({ 
          balance: safeFloat(user.balance - finalCost) 
        }).eq('id', userId);`;

const newPlaceOrder = `
        const { data: { session } } = await supabase.auth.getSession();
        const backendBase = getRenderBackendUrl();
        const urlObj = backendBase ? \`\${backendBase.replace(/\\/$/, "")}/api/orders/place\` : "/api/orders/place";
        
        const response = await fetch(urlObj, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${session?.access_token}\` },
            body: JSON.stringify({ userId, serviceId, serviceName, link, quantity, originalCost, couponCode: appliedCode })
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Order placement failed");
        }
        
        invalidateCache(['suh_cache_orders', 'suh_cache_users']);
        
        // Short-circuit the old logic to return early. We shouldn't execute the rest of the old function.
        // To do this cleanly, we replace the entire placeOrder logic.
`;

fs.writeFileSync('/app/applet/services/mockStore.ts', code);
console.log('Patched handleRazorpaySuccess in mockStore');
