require('dotenv').config();
const axios = require('axios');
async function test() {
    const payload = {
      key: process.env.SMM_API_KEY,
      action: 'add',
      service: 3533,
      link: 'https://www.instagram.com/reel/DaGCX6Ryb41/',
      quantity: 500
    };
    const params = new URLSearchParams(payload);
    try {
      const response = await axios.post("https://safesmmpanel.com/api/v2", params.toString(), {
        headers: { 
           'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      console.log(response.data);
    } catch (e) {
      console.error(e.response ? e.response.data : e.message);
    }
}
test();
