const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
    'import dotenv from "dotenv";\ndotenv.config();',
    'import dotenv from "dotenv";\nimport fs_env from "fs";\nif (fs_env.existsSync(".env")) { dotenv.config({ override: true }); } else { dotenv.config(); }'
);

fs.writeFileSync('server.ts', content);
console.log("Success");
