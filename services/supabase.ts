
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// SUPABASE CONFIGURATION
// ============================================================================

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://igkrcgcrvnocauccebrf.supabase.co'; 
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlna3JjZ2Nydm5vY2F1Y2NlYnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzA1ODAsImV4cCI6MjA4MjQwNjU4MH0.YPEX1u7LWSPXoBY_DyULmmvuQcYJgcEN-MNYAmy8X6M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  db: {
    schema: 'public',
  },
  // Retry logic for unstable connections
  global: {
    headers: { 'x-application-name': 'socialuphub' },
  },
});
