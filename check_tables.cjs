const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const tables = ['users', 'orders', 'transactions', 'services', 'categories', 'coupons', 'settings'];
  for (const t of tables) {
    const { count, error } = await supabase
      .from(t)
      .select('*', { count: 'exact', head: true });
    console.log(`Table ${t}: ${count} rows`, error ? `(Error: ${error.message})` : '');
  }
}

run();
