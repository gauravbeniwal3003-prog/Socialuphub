const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(
  "for (const [key, value] of Object.entries(match)) {",
  "for (const [key, value] of Object.entries(match || {})) {"
);
code = code.replace(
  "for (const [key, value] of Object.entries(neq)) {",
  "for (const [key, value] of Object.entries(neq || {})) {"
);
fs.writeFileSync('server.ts', code);
