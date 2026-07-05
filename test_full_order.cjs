const axios = require('axios');
async function test() {
    try {
        const payload = {
            userId: '00000000-0000-0000-0000-000000000000', // Need a valid user ID for testing. Let's just create one or grab one.
            serviceId: '3533',
            serviceName: 'Instagram Reels Views',
            link: 'https://www.instagram.com/reel/DaGCX6Ryb41/',
            quantity: 100,
            originalCost: 0.03
        };
        // wait, I can just use curl to hit safesmmpanel directly to verify if the key is correct.
        // Actually I already verified curl with 38086716603a82e68be330924e7327c7e130df7d works!
    } catch(e) {}
}
