const fs = require('fs');

let file = fs.readFileSync('services/mockStore.ts', 'utf8');

// Patch manualFundUpdate
file = file.replace(/const { data: updatedData } = await supabase\.from\('users'\)\.update\(\{ balance: safeFloat\(newBal\) \}\)\.eq\('id', uid\)\.select\(\);/g, `const { data: updatedData } = await adminDbProxy({ table: 'users', action: 'update', payload: { balance: safeFloat(newBal) }, match: { id: uid } });`);
file = file.replace(/await supabase\.from\('transactions'\)\.insert\(\{ id: `adm_\$\{Date\.now\(\)\}`, userId: uid, amount: amt, type: type === 'ADD' \? 'DEPOSIT' : 'ADJUSTMENT', status: 'SUCCESS', method: 'ADMIN', utr: reason, date: getISTTime\(\) \}\);/g, `await adminDbProxy({ table: 'transactions', action: 'insert', payload: { id: \`adm_\${Date.now()}\`, userId: uid, amount: amt, type: type === 'ADD' ? 'DEPOSIT' : 'ADJUSTMENT', status: 'SUCCESS', method: 'ADMIN', utr: reason, date: getISTTime() } });`);

// Patch revertTransaction
file = file.replace(/if \(txn\.type === 'DEPOSIT'\) await supabase\.from\('users'\)\.update\(\{ balance: safeFloat\(u\.balance - txn\.amount\) \}\)\.eq\('id', txn\.userId\);/g, `if (txn.type === 'DEPOSIT') await adminDbProxy({ table: 'users', action: 'update', payload: { balance: safeFloat(u.balance - txn.amount) }, match: { id: txn.userId } });`);
file = file.replace(/await supabase\.from\('transactions'\)\.update\(\{ status: 'REVERTED' \}\)\.eq\('id', txId\);/g, `await adminDbProxy({ table: 'transactions', action: 'update', payload: { status: 'REVERTED' }, match: { id: txId } });`);

fs.writeFileSync('services/mockStore.ts', file);
