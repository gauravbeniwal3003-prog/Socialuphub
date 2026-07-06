const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const possibleRpcs = [
    { name: 'exec_sql', argName: 'sql' },
    { name: 'run_sql', argName: 'sql' },
    { name: 'execute_sql', argName: 'sql' },
    { name: 'exec_sql', argName: 'query' },
    { name: 'run_sql', argName: 'query' },
    { name: 'execute_sql', argName: 'query' }
  ];
  for (const rpc of possibleRpcs) {
    try {
      console.log(`Trying RPC: ${rpc.name} with arg ${rpc.argName}...`);
      const args = {};
      args[rpc.argName] = 'SELECT 1;';
      const { data, error } = await supabase.rpc(rpc.name, args);
      if (!error) {
        console.log(`✅ Success with RPC ${rpc.name}! Returned:`, data);
        return;
      } else {
        console.log(`❌ RPC ${rpc.name} failed:`, error.message);
      }
    } catch (e) {
      console.log(`Error calling ${rpc.name}:`, e.message);
    }
  }
}

run();
