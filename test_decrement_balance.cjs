const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const userId = '62ea5224-6a66-4856-869a-81c1cc9473a3'; // Raja's userId
  
  console.log("Testing decrement_balance RPC...");
  const { data, error } = await supabase.rpc('decrement_balance', {
    user_id: userId,
    amount: 1.0
  });
  
  if (error) {
    console.error("RPC decrement_balance failed:", error.message);
  } else {
    console.log("RPC decrement_balance returned:", data);
  }
}

run();
