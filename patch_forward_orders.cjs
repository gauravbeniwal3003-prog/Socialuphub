const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const targetStr = `
           const isFatal = errorMsg.includes('link') || errorMsg.includes('service') || errorMsg.includes('quantity') || errorMsg.includes('invalid');
           if (isFatal) {
             await supabaseAdmin.from('orders').update({ error: res.error }).eq('id', order.id);
           }
`;

const replaceStr = `
           const isFatal = errorMsg.includes('link') || errorMsg.includes('service') || errorMsg.includes('quantity') || errorMsg.includes('invalid') || errorMsg.includes('incorrect');
           if (isFatal) {
             // Refund the user
             const { data: user } = await supabaseAdmin.from('users').select('balance').eq('id', order.userId).single();
             if (user) {
                 await supabaseAdmin.from('users').update({ balance: Math.round((user.balance + order.charge) * 100) / 100 }).eq('id', order.userId);
                 await supabaseAdmin.from('transactions').insert({ id: \`ref_bg_\${Date.now()}_\${order.id.slice(-5)}\`, userId: order.userId, amount: order.charge, type: 'REFUND', status: 'SUCCESS', method: 'SYSTEM', utr: \`Refund for Failed API Order #\${order.id} (\${res.error})\`, date: new Date().toISOString() });
             }
             await supabaseAdmin.from('orders').update({ status: 'Failed', error: res.error }).eq('id', order.id);
           }
`;

if (content.includes(targetStr.trim())) {
    content = content.replace(targetStr.trim(), replaceStr.trim());
    fs.writeFileSync('server.ts', content);
    console.log("Patched forwardOrders successfully!");
} else {
    console.log("Could not find target string to patch!");
}
