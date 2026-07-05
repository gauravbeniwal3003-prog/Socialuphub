const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');
const target = `          if (norm && norm !== order.status) {
            await supabaseAdmin.from('orders').update({ 
               status: norm, 
               remains: res.remains || order.remains, 
               start_count: res.start_count || order.start_count
            }).eq('id', order.id);
            updateCount++;
          }`;
const replacement = `          if (norm && norm !== order.status) {
            await supabaseAdmin.from('orders').update({ 
               status: norm, 
               remains: res.remains || order.remains, 
               start_count: res.start_count || order.start_count
            }).eq('id', order.id);

            if (norm === 'Canceled') {
                const { data: user } = await supabaseAdmin.from('users').select('balance').eq('id', order.userId).single();
                if (user) {
                    await supabaseAdmin.from('users').update({ balance: Math.round((user.balance + order.charge) * 100) / 100 }).eq('id', order.userId);
                    await supabaseAdmin.from('transactions').insert({ id: \`ref_\${Date.now()}_\${order.id.slice(-5)}\`, userId: order.userId, amount: order.charge, type: 'REFUND', status: 'SUCCESS', method: 'SYSTEM', utr: \`Refund for Cancelled Order #\${order.id}\`, date: new Date().toISOString() });
                }
            } else if (norm === 'Partial' && res.remains && parseFloat(res.remains) > 0) {
                const refundRatio = parseFloat(res.remains) / order.quantity;
                const refundAmount = Math.round((order.charge * refundRatio) * 100) / 100;
                if (refundAmount > 0) {
                    const { data: user } = await supabaseAdmin.from('users').select('balance').eq('id', order.userId).single();
                    if (user) {
                        await supabaseAdmin.from('users').update({ balance: Math.round((user.balance + refundAmount) * 100) / 100 }).eq('id', order.userId);
                        await supabaseAdmin.from('transactions').insert({ id: \`ref_part_\${Date.now()}_\${order.id.slice(-5)}\`, userId: order.userId, amount: refundAmount, type: 'REFUND', status: 'SUCCESS', method: 'SYSTEM', utr: \`Partial Refund for Order #\${order.id}\`, date: new Date().toISOString() });
                    }
                }
            }

            updateCount++;
          }`;
if(content.includes(target)) {
    fs.writeFileSync('server.ts', content.replace(target, replacement));
    console.log("Success");
} else {
    console.log("Not found");
}
