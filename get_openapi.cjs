const axios = require('axios');
require('dotenv').config();

async function run() {
  const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/`;
  const headers = {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
  };

  try {
    const resp = await axios.get(url, { headers });
    const paths = resp.data.paths;
    const rpcs = Object.keys(paths).filter(p => p.startsWith('/rpc/'));
    console.log("=== Available RPC Functions ===");
    console.log(rpcs);
  } catch (err) {
    console.error("Failed to fetch openapi schema:", err.message);
  }
}

run();
