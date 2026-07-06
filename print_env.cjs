console.log("=== Printing DB environment variables ===");
for (const k of Object.keys(process.env)) {
  if (k.toLowerCase().includes("supabase") || k.toLowerCase().includes("db") || k.toLowerCase().includes("postgres") || k.toLowerCase().includes("pass") || k.toLowerCase().includes("secret")) {
    console.log(`${k}=${process.env[k] ? 'EXISTS (length: ' + process.env[k].length + ')' : 'EMPTY'}`);
  }
}
