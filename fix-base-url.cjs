const fs = require('fs');
let code = fs.readFileSync('services/mockStore.ts', 'utf8');

code = code.replace(
"export function getBaseApiUrl(): string {\n    if (import.meta.env.VITE_API_URL) {\n        return import.meta.env.VITE_API_URL.replace(/\\/$/, \"\");\n    }\n    return getRenderBackendUrl().replace(/\\/$/, \"\");\n};",
"export function getBaseApiUrl(): string {\n    if (typeof window !== 'undefined') {\n        const hn = window.location.hostname;\n        if (hn !== 'socialuphub.in' && hn !== 'socialuphub-smm.web.app' && hn !== 'socialuphub-smm.firebaseapp.com') {\n            return window.location.origin;\n        }\n    }\n    if (import.meta.env.VITE_API_URL) {\n        return import.meta.env.VITE_API_URL.replace(/\\/$/, \"\");\n    }\n    return getRenderBackendUrl().replace(/\\/$/, \"\");\n};"
);

fs.writeFileSync('services/mockStore.ts', code);
