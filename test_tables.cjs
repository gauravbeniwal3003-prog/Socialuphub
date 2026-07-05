require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
async function test() {
    const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabaseAdmin.rpc('get_tables'); // Or query direct
    console.log("Error checking tables:", error);
    // Let's try to query public.transactions schema
    const { data: cols, error: errCols } = await supabaseAdmin.from('transactions').select('*').limit(1);
    console.log("Transaction columns:", cols);
}
test();
