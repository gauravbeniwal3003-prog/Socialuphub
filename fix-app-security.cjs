const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

if (!code.includes("import { SecurityTracker }")) {
  code = code.replace(
    "import Layout from './components/Layout';",
    "import Layout from './components/Layout';\nimport { SecurityTracker } from './components/SecurityTracker';"
  );
  
  code = code.replace(
    "<DynamicTheme config={config} />",
    "<DynamicTheme config={config} />\n      <SecurityTracker intruderHint=\"App Loaded\" />"
  );
  
  fs.writeFileSync('App.tsx', code);
}
