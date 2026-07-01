import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://igkrcgcrvnocauccebrf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlna3JjZ2Nydm5vY2F1Y2NlYnJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjgzMDU4MCwiZXhwIjoyMDgyNDA2NTgwfQ.-529L2gcgOFrfN_VVZf6tbPyAlnRFQNQjPBOk8aGwpI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  try {
    const { data: users, error } = await supabase.from('users').select('*');
    console.log("Total Users in DB:", users?.length);
    console.log(users);
    console.log("Error if any:", error);
  } catch (err: any) {
    console.error("Error:", err);
  }
}

check();
