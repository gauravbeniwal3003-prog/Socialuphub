require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
async function test() {
    const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabaseAdmin.from('coupons').select('*').limit(1);
    if (error) {
        console.error("Select Error:", error);
    } else {
        console.log("Coupons columns:", data);
    }
}
test();
