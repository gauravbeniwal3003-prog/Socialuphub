const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("Querying raw database pg_policies...");
  // We can execute direct SQL queries using a clever RPC or query rest endpoint if PostgREST allows,
  // but standard PostgREST doesn't expose pg_catalog.
  // Wait, is there any RPC we can use to run arbitrary SQL or read policies?
  // Let's check what RPCs exist or if there is a schema helper.
  // Actually, we can check if there are any custom RPC functions defined by listing them.
  // But let's check if there is an RPC called "get_policies" or similar.
  // If not, we can see if we can do something else.
  // Wait! Let's try to fetch from pg_policies if the schema allows, or we can use Supabase's SQL API if available.
  // Let's try to query /rest/v1/rpc/pg_policies or similar, but pg_policies is a view, not an RPC.
  // Let's see if we have any RPC that runs a query. Let's write a script to call any available RPCs or inspect.
  
  // Let's try to run a direct select on a non-table or let's inspect the pg_policies table using a custom RPC if we find one.
  // Let's write a script that tries to insert/update/delete as a USER, which is the ultimate test!
  // We can use Auth Admin API to get a user JWT token, then create a supabase client with that user JWT token,
  // and then test SELECT, INSERT, UPDATE, DELETE on orders, transactions, users, etc.
  // This will tell us EXACTLY what a normal user can do!
  
  const rajaUserId = '62ea5224-6a66-4856-869a-81c1cc9473a3';
  
  // 1. Generate a magic link or get a token for Raja
  console.log("Generating a user session for testing as Raja...");
  const { data: authData, error: authErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'raja@cmdbrowser.com',
  });
  
  if (authErr) {
    console.error("Failed to generate magic link:", authErr);
    return;
  }
  
  const token = authData.properties?.hashed_token || authData.user?.id;
  console.log("User JWT token or ID:", token);
  
  // Actually, we can just sign in or sign up a new test user, then use their session to test RLS!
  // Let's create a temporary test user, sign in as them, and test all database operations!
  const testEmail = `test_security_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  
  console.log(`Creating test user: ${testEmail}`);
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
  });
  
  if (signUpErr) {
    console.error("Sign up failed:", signUpErr);
    return;
  }
  
  const testUserSession = signUpData.session;
  const testUserId = signUpData.user.id;
  console.log(`Signed up successfully. User ID: ${testUserId}`);
  
  // Create a client with the user's session token!
  const userClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    }
  );
  
  // Set session
  await userClient.auth.setSession({
    access_token: testUserSession.access_token,
    refresh_token: testUserSession.refresh_token,
  });
  
  console.log("\n--- TESTING RLS POLICIES AS USER ---");
  
  // Test 1: Update own profile balance
  console.log("\nTest 1: Attempting to update own profile balance directly...");
  const { data: updUser, error: updUserErr } = await userClient
    .from('users')
    .update({ balance: 9999 })
    .eq('id', testUserId);
  console.log("Result:", updUser, updUserErr ? updUserErr.message : "SUCCESS (VULNERABLE!)");
  
  // Test 2: Insert order directly
  console.log("\nTest 2: Attempting to insert order directly...");
  const { data: insOrder, error: insOrderErr } = await userClient
    .from('orders')
    .insert({
      id: `test_ord_${Date.now()}`,
      userId: testUserId,
      serviceId: '1',
      serviceName: 'Test Service',
      link: 'https://example.com',
      quantity: 100,
      charge: 0.0,
      status: 'Pending'
    });
  console.log("Result:", insOrder, insOrderErr ? insOrderErr.message : "SUCCESS");
  
  // Test 3: Delete order directly
  console.log("\nTest 3: Attempting to delete order directly...");
  const { data: delOrder, error: delOrderErr } = await userClient
    .from('orders')
    .delete()
    .eq('userId', testUserId);
  console.log("Result:", delOrder, delOrderErr ? delOrderErr.message : "SUCCESS (VULNERABLE!)");
  
  // Test 4: Insert transaction directly
  console.log("\nTest 4: Attempting to insert transaction directly...");
  const { data: insTx, error: insTxErr } = await userClient
    .from('transactions')
    .insert({
      id: `test_txn_${Date.now()}`,
      userId: testUserId,
      amount: 100.0,
      type: 'DEPOSIT',
      status: 'SUCCESS',
      method: 'RAZORPAY'
    });
  console.log("Result:", insTx, insTxErr ? insTxErr.message : "SUCCESS (VULNERABLE!)");

  // Test 5: Delete transaction directly
  console.log("\nTest 5: Attempting to delete transaction directly...");
  const { data: delTx, error: delTxErr } = await userClient
    .from('transactions')
    .delete()
    .eq('userId', testUserId);
  console.log("Result:", delTx, delTxErr ? delTxErr.message : "SUCCESS (VULNERABLE!)");

  // Clean up test user
  console.log("\nCleaning up test user...");
  await supabase.auth.admin.deleteUser(testUserId);
  console.log("Cleanup done.");
}

run();
