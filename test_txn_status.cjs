require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
async function test() {
    const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const testId = `test_txn_${Date.now()}`;
    const { data, error } = await supabaseAdmin.from('transactions').insert({
        id: testId,
        userId: 'b83eccf5-5ada-4446-82ff-2999e6569604',
        amount: 10,
        type: 'DEPOSIT',
        status: 'PENDING',
        method: 'RAZORPAY',
        orderId: 'order_test_123',
        date: new Date().toISOString()
    }).select();
    if (error) {
        console.error("Insert Error:", error);
    } else {
        console.log("Insert Success:", data);
        // Clean up
        await supabaseAdmin.from('transactions').delete().eq('id', testId);
    }
}
test();
