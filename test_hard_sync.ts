import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://igkrcgcrvnocauccebrf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlna3JjZ2Nydm5vY2F1Y2NlYnJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjgzMDU4MCwiZXhwIjoyMDgyNDA2NTgwfQ.-529L2gcgOFrfN_VVZf6tbPyAlnRFQNQjPBOk8aGwpI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runHardSync() {
  try {
    console.log("Testing deletion of categories not matched by placeholder...");
    const { error: catDelErr } = await supabase.from('categories').delete().neq('id', 'PLACEHOLDER_SAFEGUARD');
    if (catDelErr) {
       console.error("Failed to delete categories:", catDelErr);
    } else {
       console.log("Successfully deleted categories.");
    }

    console.log("Testing deletion of services not matched by placeholder...");
    const { error: srvDelErr } = await supabase.from('services').delete().neq('service', 'PLACEHOLDER_SAFEGUARD');
    if (srvDelErr) {
       console.error("Failed to delete services:", srvDelErr);
    } else {
       console.log("Successfully deleted services.");
    }
  } catch (err: any) {
    console.error("Unexpected error in dry run:", err);
  }
}

runHardSync();
