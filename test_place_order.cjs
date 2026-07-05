const fetch = require('node-fetch');
async function test() {
    try {
        const res = await fetch("http://localhost:3000/api/orders/place", {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userId: "123e4567-e89b-12d3-a456-426614174000", serviceId: "1", serviceName: "test", link: "http://example.com", quantity: 100, originalCost: 1, couponCode: "" })
        });
        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Response:", text);
    } catch(e) {
        console.error("Fetch failed:", e);
    }
}
test();
