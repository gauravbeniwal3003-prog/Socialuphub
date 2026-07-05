const axios = require('axios');
async function test() {
    const payload = {
      key: '38086716603a82e68be330924e7327c7e130df7d',
      action: 'orders'
    };
    const params = new URLSearchParams(payload);
    try {
      const response = await axios.post("https://safesmmpanel.com/api/v2", params.toString(), {
        headers: { 
           'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      console.log(response.data.slice ? response.data.slice(0, 3) : response.data);
    } catch (e) {
      console.error(e.response ? e.response.data : e.message);
    }
}
test();
