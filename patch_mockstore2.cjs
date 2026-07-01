const fs = require('fs');
let code = fs.readFileSync('/app/applet/services/mockStore.ts', 'utf8');

const regex = /export const placeOrder = async[\s\S]+?(?=export const calculateFinalPrice)/;
const match = code.match(regex);

if (match) {
    const newPlaceOrder = `export const placeOrder = async (userId: string, serviceId: string, serviceName: string, link: string, quantity: number, originalCost: number, couponCode?: string) => {
  checkRateLimit('place_order');
  if (!isValidUrl(link)) throw new Error("Invalid Link.");

  try {
      const user = await checkUserSecurity(userId);

      const { data: { session } } = await supabase.auth.getSession();
      const backendBase = getRenderBackendUrl();
      const urlObj = backendBase ? \`\${backendBase.replace(/\\/$/, "")}/api/orders/place\` : "/api/orders/place";
      
      const response = await fetch(urlObj, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${session?.access_token}\` },
          body: JSON.stringify({ userId, serviceId, serviceName, link, quantity, originalCost, couponCode })
      });
      
      if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Order placement failed");
      }
      
      invalidateCache(['suh_cache_orders', 'suh_cache_users']);
      
      // Auto processing logic to queue the SMM api call
      if (typeof window !== 'undefined') {
          setTimeout(() => {
              autoProcessQueue();
          }, 100);
      }
  } catch (e: any) {
      logTempError(\`Order Failed: \${serviceId}\`, e.message);
      throw e;
  }
};
`;
    code = code.replace(match[0], newPlaceOrder);
    fs.writeFileSync('/app/applet/services/mockStore.ts', code);
    console.log('Patched placeOrder in mockStore');
} else {
    console.log('Could not match placeOrder in mockStore');
}
