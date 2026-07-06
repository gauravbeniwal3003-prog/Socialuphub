const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("Checking if RLS is enabled on our tables...");
  
  // We can check this by running an RPC if we have one or by trying to query.
  // Actually, wait! Let's see if we can run a direct PostgreSQL command to enable RLS.
  // Wait, we don't have direct SQL command tool unless we use an RPC.
  // Let's check if there is an RPC to execute SQL or check RLS.
  // Let's write a script that queries pg_tables or pg_class using a known table or rpc.
  // Wait, let's see what RPCs we have. Let's do a select on pg_catalog via REST if allowed,
  // but usually it's blocked.
  // Let's check if the table RLS can be verified.
  // Actually, we already know that we succeeded in:
  // - updating the balance directly (Test 1)
  // - deleting the order directly (Test 3)
  // - deleting the transaction directly (Test 5)
  // This means that EITHER:
  // 1. RLS is NOT enabled on those tables at all, OR
  // 2. The RLS policies are so permissive that they allow anyone to do anything!
  
  // Let's test if we can do this for a user who DOES have a record in the users table.
  // Let's create a profile for a test user first, then test direct insert on orders and transactions!
  
  const testEmail = `test_profile_${Date.now()}@example.com`;
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
  
  const testUserId = signUpData.user.id;
  const testUserSession = signUpData.session;
  
  // Let's insert a profile in public.users (which uses supabaseAdmin since normally sync-user does it)
  console.log("Inserting user profile...");
  const { error: profErr } = await supabase.from('users').insert({
    id: testUserId,
    email: testEmail,
    name: 'testuser',
    role: 'USER',
    balance: 10.0,
    totalSpent: 0.0,
    isBanned: false,
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
  });
  
  if (profErr) {
    console.error("Profile insertion failed:", profErr);
    await supabase.auth.admin.deleteUser(testUserId);
    return;
  }
  
  // Create user client
  const userClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );
  
  await userClient.auth.setSession({
    access_token: testUserSession.access_token,
    refresh_token: testUserSession.refresh_token,
  });
  
  // Test 1: Insert order directly with status Pending and charge 0
  console.log("\nTest A: Attempting to insert order directly as authenticated user...");
  const { data: insOrder, error: insOrderErr } = await userClient
    .from('orders')
    .insert({
      id: `ord_direct_${Date.now()}`,
      userId: testUserId,
      serviceId: '1',
      serviceName: 'Free SMM Service',
      link: 'https://instagram.com/p/direct',
      quantity: 1000,
      charge: 0.0,
      status: 'Pending'
    });
  console.log("Result:", insOrder, insOrderErr ? insOrderErr.message : "SUCCESS (VULNERABLE!)");
  
  // Test 2: Insert transaction directly with type DEPOSIT and status SUCCESS and amount 10000
  console.log("\nTest B: Attempting to insert SUCCESS DEPOSIT transaction directly...");
  const { data: insTx, error: insTxErr } = await userClient
    .from('transactions')
    .insert({
      id: `txn_direct_${Date.now()}`,
      userId: testUserId,
      amount: 10000.0,
      type: 'DEPOSIT',
      status: 'SUCCESS',
      method: 'RAZORPAY',
      utr: 'direct_hack'
    });
  console.log("Result:", insTx, insTxErr ? insTxErr.message : "SUCCESS (VULNERABLE!)");
  
  // Clean up
  console.log("\nCleaning up...");
  await supabase.from('orders').delete().eq('userId', testUserId);
  await supabase.from('transactions').delete().eq('userId', testUserId);
  await supabase.from('users').delete().eq('id', testUserId);
  await supabase.auth.admin.deleteUser(testUserId);
  console.log("Cleanup done.");
}

run();
