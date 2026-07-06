const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const userId = '62ea5224-6a66-4856-869a-81c1cc9473a3';
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .eq('userId', userId);
  console.log("Orders:", orders, error);
}

run();
