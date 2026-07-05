require('dotenv').config();
const payload = {
    key: process.env.SMM_API_KEY,
    action: 'add',
    service: 3533,
    link: 'https://www.instagram.com/reel/DaGCX6Ryb41/',
    quantity: 500
};
const params = new URLSearchParams(payload);
console.log(params.toString());
