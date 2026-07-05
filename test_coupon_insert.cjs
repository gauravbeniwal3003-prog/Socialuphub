require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
async function test() {
    const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabaseAdmin.from('coupons').insert({
        code: "TESTCOUPON",
        category: "DEPOSIT",
        type: "PERCENTAGE",
        value: 10,
        minAmount: 100,
        usageLimit: 100,
        usedBy: [],
        isEnabled: true
    }).select();
    if (error) {
        console.error("Insert Error:", error);
    } else {
        console.log("Insert Success:", data);
    }
}
test();
