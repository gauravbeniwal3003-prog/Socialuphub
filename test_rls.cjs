const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Create client with Anon Key (simulating client-side user)
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  console.log("=== Testing Supabase Client-Side (Anon Key) Capabilities ===");
  
  // 1. Let's try to query policies from pg_policies (using service role since anon can't read pg_policies)
  const adminClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log("\nFetching actual database policies using admin client...");
  const { data: policies, error: polErr } = await adminClient
    .rpc('get_policies_raw'); // Let's try or just query pg_policies via a query
  
  if (polErr) {
    console.log("get_policies_raw RPC not found, executing direct query...");
    // Let's do a query using standard postgres/supabase if possible, or we can just try manual inserts
  }

  // Let's test what an anonymous / authenticated user can do.
  // First, let's sign in a dummy user or just use a user's session if we have their credentials,
  // or we can just see if we can write to tables anonymously or if we need a session.
  // Let's sign in as raja or dummy.
  console.log("\nAttempting to sign in with Raja's email raja@cmdbrowser.com...");
  // Note: we can sign in using admin client to get a session or just create a new session
  const { data: authData, error: authErr } = await adminClient.auth.admin.getUserById('62ea5224-6a66-4856-869a-81c1cc9473a3');
  if (authErr) {
    console.error("Auth fetch error:", authErr);
  } else {
    console.log("Fetched raja's auth email:", authData.user.email);
  }

  // Let's list all policies in the database using raw SQL if we can, or just print pg_policies
  // We don't have a direct SQL runner here unless we define an RPC. Is there any SQL runner?
  // No direct SQL runner, but let's check what policies are listed in pg_policies
  console.log("\nListing policies from pg_policies via RPC or general check...");
}

run();
