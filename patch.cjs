const fs = require('fs');

let file = fs.readFileSync('services/mockStore.ts', 'utf8');

const helper = `
export const adminDbProxy = async (payload: any) => {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) throw new Error("No session");
    
    const url = \`\${getBaseApiUrl()}/api/admin/db-proxy\`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${token}\`
        },
        body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || "DB Proxy Error");
    return result;
};
`;

file = file.replace(/export const getBaseApiUrl = \(\): string => \{/, helper + '\nexport const getBaseApiUrl = (): string => {');

// 1. Coupons
file = file.replace(/const { error } = await supabase\.from\('coupons'\)\.insert\(c\);/g, `await adminDbProxy({ table: 'coupons', action: 'insert', payload: c }); const error = null;`);
file = file.replace(/const { error } = await supabase\.from\('coupons'\)\.delete\(\)\.eq\('code', code\);/g, `await adminDbProxy({ table: 'coupons', action: 'delete', match: { code } }); const error = null;`);
file = file.replace(/const { error } = await supabase\.from\('coupons'\)\.update\({ isEnabled: !s }\)\.eq\('code', code\);/g, `await adminDbProxy({ table: 'coupons', action: 'update', payload: { isEnabled: !s }, match: { code } }); const error = null;`);

// 2. Users (Admin Update User)
file = file.replace(/await supabase\.from\('users'\)\.update\(safeUpdate\)\.eq\('id', u\.id\);/g, `await adminDbProxy({ table: 'users', action: 'update', payload: safeUpdate, match: { id: u.id } });`);
file = file.replace(/await supabase\.from\('users'\)\.delete\(\)\.eq\('id', uid\);/g, `await adminDbProxy({ table: 'users', action: 'delete', match: { id: uid } });`);

// 3. Settings
file = file.replace(/await supabase\.from\('settings'\)\.upsert\(\{ id: 'global', \.\.\.newConfig \}\);/g, `await adminDbProxy({ table: 'settings', action: 'upsert', payload: { id: 'global', ...newConfig } });`);

fs.writeFileSync('services/mockStore.ts', file);
