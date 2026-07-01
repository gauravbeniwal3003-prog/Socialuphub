import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://igkrcgcrvnocauccebrf.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlna3JjZ2Nydm5vY2F1Y2NlYnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzA1ODAsImV4cCI6MjA4MjQwNjU4MH0.YPEX1u7LWSPXoBY_DyULmmvuQcYJgcEN-MNYAmy8X6M');

async function run() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'gauravbeniwal30003@gmail.com',
    password: 'beniwal@12'
  });
  if (error) {
    console.error('Login Error:', error.message);
  } else {
    console.log('Login Success!', data.user.email);
  }
}
run();
