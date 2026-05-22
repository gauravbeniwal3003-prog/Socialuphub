
// @ts-ignore
declare const Deno: any;

// HARDCODED CREDENTIALS
const RAZORPAY_KEY_ID = "rzp_live_RzLdEkePrpnfd4";
const RAZORPAY_KEY_SECRET = "4wiJs8mHjvhbes6JRZFd35hT"; 

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let payload;
    try {
        payload = await req.json();
    } catch (e) {
        payload = {};
    }
    
    const { action, ...data } = payload;
    console.log(`[Razorpay] Action: ${action}`);

    // --- CREATE ORDER (Auto Capture Enabled) ---
    // Docs: https://razorpay.com/docs/payments/orders/apis/
    if (action === 'create_order') {
        const { amount, receipt } = data;
        
        if (!amount || isNaN(amount)) throw new Error("Invalid Amount");

        const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
        
        // Amount must be in Paise (INR * 100)
        const amountInPaise = Math.round(amount * 100);

        const resp = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`
            },
            body: JSON.stringify({
                amount: amountInPaise,
                currency: "INR",
                receipt: receipt || `rcpt_${Date.now()}`,
                payment_capture: 1, // FORCE AUTO CAPTURE
                notes: {
                    source: "SocialUpHub_Web"
                }
            })
        });

        if (!resp.ok) {
            const err = await resp.json();
            console.error("Razorpay API Failed:", JSON.stringify(err));
            throw new Error(err.error?.description || "Gateway Error");
        }

        const order = await resp.json();
        
        return new Response(JSON.stringify(order), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    // --- VERIFY SIGNATURE ---
    if (action === 'verify_signature') {
        const { order_id, payment_id, signature } = data;
        
        if (!order_id || !payment_id || !signature) throw new Error("Missing params");

        const text = `${order_id}|${payment_id}`;
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw", 
            encoder.encode(RAZORPAY_KEY_SECRET), 
            { name: "HMAC", hash: "SHA-256" }, 
            false, 
            ["sign"]
        );
        const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(text));
        const generated_signature = Array.from(new Uint8Array(sigBuf))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        if (generated_signature === signature) {
             return new Response(JSON.stringify({ valid: true }), { 
                 headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                 status: 200
             });
        } else {
             return new Response(JSON.stringify({ valid: false }), { 
                 headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
                 status: 400 
             });
        }
    }

    throw new Error(`Invalid Action: ${action}`);

  } catch (error: any) {
    console.error("Function Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
