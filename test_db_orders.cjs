require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
async function test() {
    const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: orders } = await supabaseAdmin.from('orders').select('id, charge, link, quantity, error, status').order('date', {ascending: false}).limit(5);
    console.log("Recent Orders:", orders);
}
test();
