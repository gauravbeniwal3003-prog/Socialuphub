const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const userId = '62ea5224-6a66-4856-869a-81c1cc9473a3'; // Raja
  
  const rpcs = [
    { name: 'increment_balance', args: { user_id: userId, amount: 1.0 } },
    { name: 'decrement_balance', args: { user_id: userId, amount: 1.0 } },
    { name: 'use_coupon', args: { coupon_code: 'TEST', user_id: userId } },
    { name: 'add_referral_commission', args: { referrer_id: userId, commission: 1.0 } },
    { name: 'transfer_referral_balance', args: { user_id: userId } }
  ];
  
  for (const rpc of rpcs) {
    console.log(`\nTesting RPC: ${rpc.name}...`);
    const { data, error } = await supabase.rpc(rpc.name, rpc.args);
    if (error) {
      console.log(`❌ RPC ${rpc.name} failed:`, error.message);
    } else {
      console.log(`✅ RPC ${rpc.name} succeeded! Returned:`, data);
    }
  }
}

run();
