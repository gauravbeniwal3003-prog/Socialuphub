const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("Checking all orders...");
  const { data: allOrders, error: allOrdersError } = await supabase
    .from('orders')
    .select('*');

  if (allOrdersError) {
    console.error("Error fetching all orders:", allOrdersError);
    return;
  }
  console.log(`Total orders in system: ${allOrders.length}`);
  console.log("All orders:", JSON.stringify(allOrders, null, 2));

  console.log("\nChecking transactions for user raja's order IDs:");
  // Let's check for any transaction or order containing the order ID in transaction's utr
  const orderIds = ["ord_1783311837282_butx8", "ord_1783311106116_fbr6c"];
  for (const oId of orderIds) {
    const { data: ord, error } = await supabase.from('orders').select('*').eq('id', oId);
    console.log(`Order ${oId}:`, ord, error);
  }
}

run();
