const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const orderIds = ['ord_1783311837282_butx8', 'ord_1783311106116_fbr6c'];
  for (const id of orderIds) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id);
    console.log(`Order ${id}:`, data, error);
  }
}

run();
