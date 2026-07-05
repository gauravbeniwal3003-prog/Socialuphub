require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
async function test() {
    const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: s } = await supabaseAdmin.from('services').select('rate, customMarginPercent, customMarginFixed').limit(1).single();
    console.log(s);
    console.log(typeof s.rate, typeof s.customMarginPercent, typeof s.customMarginFixed);
}
test();
