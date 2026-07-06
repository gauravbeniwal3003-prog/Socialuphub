
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// SUPABASE CONFIGURATION
// ============================================================================

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''; 
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

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
