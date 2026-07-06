const fs = require('fs');
let code = fs.readFileSync('services/mockStore.ts', 'utf8');

code = code.replace(
"    let result;\n    try {\n        result = await res.json();\n    } catch (e) {\n        throw new Error(`DB Proxy Parse Error: HTTP ${res.status} - ${res.statusText}`);\n    }",
"    let result;\n    let textBody = '';\n    try {\n        textBody = await res.text();\n        result = textBody ? JSON.parse(textBody) : {};\n    } catch (e) {\n        throw new Error(`DB Proxy Parse Error: HTTP ${res.status} - ${res.statusText}. Body: ${textBody.substring(0, 100)}`);\n    }"
);

fs.writeFileSync('services/mockStore.ts', code);
