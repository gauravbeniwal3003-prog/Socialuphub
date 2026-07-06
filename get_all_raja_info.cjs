const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const userId = '62ea5224-6a66-4856-869a-81c1cc9473a3';

  console.log("=== User Profile ===");
  const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
  console.log(user);

  console.log("\n=== Transactions ===");
  const { data: txns } = await supabase.from('transactions').select('*').eq('userId', userId);
  console.log(txns);

  console.log("\n=== Orders matching User ===");
  const { data: orders } = await supabase.from('orders').select('*').eq('userId', userId);
  console.log(orders);

  console.log("\n=== Orders matching transaction charges (1018.01 or 22.74) ===");
  const { data: ordersByCharge } = await supabase.from('orders').select('*').in('charge', [1018.01, 22.74]);
  console.log(ordersByCharge);
}

run();
