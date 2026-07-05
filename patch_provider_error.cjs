const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const target = `                // Refund the user if it's a provider error
                if (!errorMsg.includes('insufficient') && !errorMsg.includes('balance') && !errorMsg.includes('funds')) {
                    const refundAmount = finalCost;
                    
                    await supabaseAdmin.from('transactions').insert({
                        id: \`ref_\${Date.now()}\`, userId: userId, amount: refundAmount, type: 'REFUND', status: 'SUCCESS', method: 'SYSTEM', utr: \`Refund for Order #\${orderId} (\${resProvider.error})\`, date: new Date().toISOString()
                    });
                    
                    const { data: updatedUser } = await supabaseAdmin.from('users').select('balance').eq('id', userId).single();
                    if (updatedUser) {
                        await supabaseAdmin.from('users').update({ balance: Math.round((updatedUser.balance + refundAmount) * 100) / 100 }).eq('id', userId);
                    }
                    await supabaseAdmin.from('orders').update({ status: 'Failed', error: resProvider.error }).eq('id', orderId);
                    
                    return res.status(400).json({ error: \`Order failed at provider: \${resProvider.error}\` });
                }`;

const rep = `                // Refund the user for any provider error
                const refundAmount = finalCost;
                await supabaseAdmin.from('transactions').insert({
                    id: \`ref_\${Date.now()}\`, userId: userId, amount: refundAmount, type: 'REFUND', status: 'SUCCESS', method: 'SYSTEM', utr: \`Refund for Order #\${orderId} (\${resProvider.error})\`, date: new Date().toISOString()
                });
                
                const { data: updatedUser } = await supabaseAdmin.from('users').select('balance').eq('id', userId).single();
                if (updatedUser) {
                    await supabaseAdmin.from('users').update({ balance: Math.round((updatedUser.balance + refundAmount) * 100) / 100 }).eq('id', userId);
                }
                await supabaseAdmin.from('orders').update({ status: 'Failed', error: resProvider.error }).eq('id', orderId);
                
                return res.status(400).json({ error: \`Provider Error: \${resProvider.error}\` });`;

if (content.includes(target)) {
    content = content.replace(target, rep);
    
    // Also fix rate parsing
    content = content.replace(
        "let price = dbService.rate;",
        "let price = parseFloat(dbService.rate) || 0;"
    );
    content = content.replace(
        "const marginPercent = dbService.customMarginPercent !== undefined && dbService.customMarginPercent !== null ? dbService.customMarginPercent : (configData?.globalMarginPercent || 0);",
        "const marginPercent = dbService.customMarginPercent !== undefined && dbService.customMarginPercent !== null ? parseFloat(dbService.customMarginPercent) : parseFloat(configData?.globalMarginPercent || 0);"
    );
    content = content.replace(
        "const marginFixed = dbService.customMarginFixed !== undefined && dbService.customMarginFixed !== null ? dbService.customMarginFixed : (configData?.globalMarginFixed || 0);",
        "const marginFixed = dbService.customMarginFixed !== undefined && dbService.customMarginFixed !== null ? parseFloat(dbService.customMarginFixed) : parseFloat(configData?.globalMarginFixed || 0);"
    );
    
    fs.writeFileSync('server.ts', content);
    console.log("Success");
} else {
    console.log("Target not found");
}
