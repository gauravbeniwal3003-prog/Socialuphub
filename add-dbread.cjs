const fs = require('fs');
let code = fs.readFileSync('services/mockStore.ts', 'utf8');

const dbReadFn = `
export const dbReadProxy = async (table: string, match?: any, options?: any) => {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    const url = \`\${getBaseApiUrl()}/api/db-read\`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': \`Bearer \${token}\` } : {})
        },
        body: JSON.stringify({ table, match, ...options })
    });
    const result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || "DB Read Proxy Error");
    return result.data || [];
};
`;

code = code.replace(
    /export const adminDbProxy = async \(payload: any\) => \{/g,
    dbReadFn + "\nexport const adminDbProxy = async (payload: any) => {"
);

fs.writeFileSync('services/mockStore.ts', code);
