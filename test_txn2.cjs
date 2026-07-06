require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
async function test() {
    const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabaseAdmin.from('transactions').insert({
        id: 'banned_ip_127.0.0.1',
        amount: 0,
        type: 'BANNED_IP',
        status: 'ACTIVE',
        method: '127.0.0.1',
        date: new Date().toISOString()
    }).select();
    console.log(data, error);
}
test();
