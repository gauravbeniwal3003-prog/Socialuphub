const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const rajaId = '62ea5224-6a66-4856-869a-81c1cc9473a3';
  
  console.log("Checking if anyone is referred by Raja...");
  const { data: referredUsers, error: refErr } = await supabase
    .from('users')
    .select('*')
    .eq('referred_by', rajaId);
    
  console.log(`Found ${referredUsers ? referredUsers.length : 0} referred users:`, referredUsers, refErr);

  console.log("\nChecking for any other users with mobile = '9090909090' or similar domain...");
  const { data: similarUsers, error: simErr } = await supabase
    .from('users')
    .select('*')
    .or("mobile.eq.9090909090,email.ilike.%cmdbrowser%");
  console.log(`Found similar users:`, similarUsers, simErr);
}

run();
