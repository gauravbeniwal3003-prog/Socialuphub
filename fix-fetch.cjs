const fs = require('fs');
let code = fs.readFileSync('services/mockStore.ts', 'utf8');

const target = `        const options: any = { order: { column: orderByField, ascending: false } };`;
const replacement = `        const options: any = { order: \`\${orderByField}.desc\` };`;

code = code.replace(target, replacement);

fs.writeFileSync('services/mockStore.ts', code);
