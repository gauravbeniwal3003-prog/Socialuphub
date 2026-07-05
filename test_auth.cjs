require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
async function test() {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    const email = 'testuser_' + Date.now() + '@example.com';
    let { data: { session } } = await supabase.auth.signUp({ email, password: 'Password123!' });
    
    const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await supabaseAdmin.from('users').insert({ id: session.user.id, email, balance: 10, role: 'USER' });

    const res = await fetch("http://localhost:3000/api/orders/place", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: session.user.id, serviceId: "3533", serviceName: "test", link: "http://example.com", quantity: 100, originalCost: 1, couponCode: "" })
    });
    console.log("Status:", res.status);
    console.log(await res.text());
}
test();
