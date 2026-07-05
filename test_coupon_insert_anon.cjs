require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
async function test() {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    const { data, error } = await supabase.from('coupons').insert({
        code: "TESTANON",
        category: "DEPOSIT",
        type: "PERCENTAGE",
        value: 10,
        minAmount: 100,
        usageLimit: 100,
        usedBy: [],
        isEnabled: true
    }).select();
    if (error) {
        console.error("Insert Error with Anon Key:", error);
    } else {
        console.log("Insert Success with Anon Key:", data);
    }
}
test();
