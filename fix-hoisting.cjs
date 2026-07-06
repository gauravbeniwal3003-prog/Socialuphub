const fs = require('fs');
let code = fs.readFileSync('services/mockStore.ts', 'utf8');

code = code.replace(/export const dbReadProxy = async \((.*?)\) => \{/g, "export async function dbReadProxy($1) {");
code = code.replace(/export const adminDbProxy = async \((.*?)\) => \{/g, "export async function adminDbProxy($1) {");
code = code.replace(/export const getBaseApiUrl = \(\): string => \{/g, "export function getBaseApiUrl(): string {");

fs.writeFileSync('services/mockStore.ts', code);
