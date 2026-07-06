const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
"for (const [k, v] of Object.entries(match)) {",
"for (const [k, v] of Object.entries(match || {})) {"
);

fs.writeFileSync('server.ts', code);
