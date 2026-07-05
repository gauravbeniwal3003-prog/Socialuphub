const axios = require('axios');
async function test() {
    // Just testing logic manually:
    const rate = 0.1596;
    let price = rate;
    const marginPercent = 100;
    const marginFixed = 0;
    if (marginPercent) price += price * (marginPercent / 100);
    if (marginFixed) price += marginFixed;
    console.log("Price per 1000:", price);
    let qty = 100;
    let finalCost = (price / 1000) * qty;
    console.log("Final cost for 100:", finalCost);
}
test();
