const fs = require('fs');
let content = fs.readFileSync('services/mockStore.ts', 'utf8');

const target = `export const calculateFinalPrice = (service: Service, config: GlobalConfig): number => {
    let price = service.rate;
    const marginPercent = service.customMarginPercent !== undefined && service.customMarginPercent !== null ? service.customMarginPercent : (config?.globalMarginPercent || 0);
    const marginFixed = service.customMarginFixed !== undefined && service.customMarginFixed !== null ? service.customMarginFixed : (config?.globalMarginFixed || 0);

    if (marginPercent) price += price * (marginPercent / 100);
    if (marginFixed) price += marginFixed;
    return safeFloat(price);
};`;

const rep = `export const calculateFinalPrice = (service: Service, config: GlobalConfig): number => {
    let price = parseFloat(service.rate as any) || 0;
    const marginPercent = service.customMarginPercent !== undefined && service.customMarginPercent !== null ? parseFloat(service.customMarginPercent as any) : parseFloat((config?.globalMarginPercent as any) || 0);
    const marginFixed = service.customMarginFixed !== undefined && service.customMarginFixed !== null ? parseFloat(service.customMarginFixed as any) : parseFloat((config?.globalMarginFixed as any) || 0);

    if (marginPercent) price += price * (marginPercent / 100);
    if (marginFixed) price += marginFixed;
    return price; // Do NOT round the rate, it causes discrepancy with backend
};`;

if (content.includes(target)) {
    fs.writeFileSync('services/mockStore.ts', content.replace(target, rep));
    console.log("Success store");
} else {
    console.log("Not found store");
}
