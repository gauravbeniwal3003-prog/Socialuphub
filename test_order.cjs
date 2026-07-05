const axios = require('axios');
async function test() {
    try {
        const payload = {
            userId: "7cf22c7f-f7d9-4b68-b769-cfecbf920e0b",
            serviceId: "3533",
            serviceName: "Instagram Reels",
            link: "https://instagram.com/reel/abc",
            quantity: 100,
            originalCost: 0.03
        };
        // we won't have a valid jwt, so we might fail verifyAuth. Let's just bypass it for a test?
        // Let's run a fake server logic to see what it calculates
    } catch(e) {}
}
