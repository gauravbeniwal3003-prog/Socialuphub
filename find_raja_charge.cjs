const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const charges = [1018.01, 22.74];
  for (const c of charges) {
    console.log(`Checking orders with charge = ${c}...`);
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('charge', c);
    console.log(`Found ${orders ? orders.length : 0} orders:`, orders, error);
  }
}

run();
