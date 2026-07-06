const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://xyz.supabase.co', 'xyz');
async function run() {
  try {
    await supabase.from('users').select('*').eq('id', undefined);
    console.log("No error");
  } catch(e) {
    console.log("Error:", e.message);
  }
}
run();
