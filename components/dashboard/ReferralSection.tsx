
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../App';
import { getReferralStats, transferReferralBalance } from '../../services/mockStore';
import { supabase } from '../../services/supabase';
import { Card, Button, Badge, Notification } from '../ui/Components';
import { CURRENCY_SYMBOL, CONTACT_WHATSAPP_URL } from '../../constants';
import { Copy, Users, TrendingUp, Wallet, CheckCircle, MessageCircle } from 'lucide-react';

export const ReferralSection: React.FC = () => {
    const { user } = useAuth();
    const [stats, setStats] = useState<any>({ totalReferrals: 0, signupCount: 0, depositCount: 0, referredUsers: [], totalEarnings: 0 });
    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState<{msg: string, type: 'success'|'error'} | null>(null);

    // Optimized Realtime Subscription
    useEffect(() => {
        if(!user?.id) return;

        // Fetch initial stats
        const loadStats = () => getReferralStats(user.id).then(setStats);
        loadStats();

        // Subscribe to changes affecting stats (New Referrals or New Rewards)
        const channel = supabase.channel(`referral_view_${user.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `referred_by=eq.${user.id}` }, () => {
                // When a new user signs up with my code
                loadStats();
                setNotification({ msg: "New Referral Joined!", type: 'success' });
            })
            // Transactions also affect total earnings
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `userId=eq.${user.id}` }, () => {
                loadStats();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [user?.id]); 

    const handleCopyCode = () => {
        if (!user?.referral_code) return;
        navigator.clipboard.writeText(user.referral_code);
        setNotification({ msg: "Referral code copied!", type: 'success' });
        setTimeout(() => setNotification(null), 2000);
    };

    const handleWithdraw = () => {
        if (!user || (user.referral_balance || 0) < 500) {
            setNotification({ msg: `Minimum withdrawal amount is ${CURRENCY_SYMBOL}500`, type: 'error' });
            return;
        }

        const msg = `Hello Admin,\nI want to withdraw my referral earnings.\n\nUser: ${user?.name} (${user?.id})\nReferral Balance: ${CURRENCY_SYMBOL}${user?.referral_balance}\n\nPlease transfer to my UPI: [ENTER_UPI_ID_HERE]`;
        const url = `${CONTACT_WHATSAPP_URL}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    };

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            {notification && <Notification message={notification.msg} type={notification.type} onClose={() => setNotification(null)} />}
            
            <div className="text-center md:text-left">
                <h2 className="text-3xl font-black italic tracking-tighter text-[var(--app-text)]">REFERRAL <span className="text-[var(--app-accent)]">PROGRAM</span></h2>
                <p className="text-[var(--app-text-muted)] text-sm mt-1">Invite friends & earn 5% of their spendings for a lifetime.</p>
            </div>

            {/* Stats Grid - Connected to Realtime DB */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Wallet Balance - Live from User Context */}
                <Card className="bg-gradient-to-br from-[var(--app-accent)]/10 to-[var(--app-card-bg)] border border-[var(--app-accent)]/25 p-6 flex flex-col justify-between relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-4 opacity-10 text-[var(--app-accent)]"><Wallet size={64}/></div>
                     <div>
                        <p className="text-[var(--app-accent)] text-xs font-bold uppercase tracking-wider mb-1">Referral Wallet</p>
                        <h3 className="text-4xl font-black text-[var(--app-text)]">{CURRENCY_SYMBOL}{user?.referral_balance?.toFixed(2) || '0.00'}</h3>
                     </div>
                     <div className="flex gap-2 mt-6 z-10">
                        <button onClick={handleWithdraw} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg px-3 py-2 flex items-center justify-center gap-2 transition-colors border border-green-500/50">
                            <MessageCircle size={18}/> Withdraw Funds
                        </button>
                     </div>
                     <p className="text-[10px] text-[var(--app-text-muted)] mt-2 text-center">Min Withdrawal: {CURRENCY_SYMBOL}500</p>
                </Card>

                {/* Total Referrals - Live from DB Aggregation */}
                <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl p-6 relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-[var(--app-text)]"><Users size={64}/></div>
                    <p className="text-[var(--app-text-muted)] text-xs font-bold uppercase tracking-wider mb-1">Total Referrals</p>
                    <h3 className="text-4xl font-black text-[var(--app-text)]">{stats.totalReferrals}</h3>
                    <div className="mt-4 flex gap-4 text-xs">
                        <div className="flex items-center gap-1 text-[var(--app-text-muted)]"><span className="w-2 h-2 bg-green-500 rounded-full"></span> {stats.depositCount} Active Users</div>
                    </div>
                </div>

                {/* Total Earnings - Live from User Context */}
                <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl p-6 relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-[var(--app-text)]"><TrendingUp size={64}/></div>
                    <p className="text-[var(--app-text-muted)] text-xs font-bold uppercase tracking-wider mb-1">Total Earnings</p>
                    <h3 className="text-4xl font-black text-[var(--app-text)]">{CURRENCY_SYMBOL}{user?.total_referral_earnings?.toFixed(2) || '0.00'}</h3>
                    <p className="text-xs text-[var(--app-text-muted)] mt-2">Lifetime earnings from invites</p>
                </div>
            </div>

            {/* Referral Code Section - Read Only & Single Click Copy */}
            <Card className="p-6 bg-[var(--app-card-bg)] border border-[var(--app-border)]">
                <h3 className="text-lg font-bold text-[var(--app-text)] mb-4">Referral Code</h3>
                
                <div 
                    className="bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg p-8 text-center cursor-pointer hover:border-[var(--app-accent)]/50 group transition-all relative overflow-hidden select-none" 
                    onClick={handleCopyCode}
                    title="Click to Copy Code"
                >
                    <div className="absolute inset-0 bg-[var(--app-accent)]/5 group-hover:bg-[var(--app-accent)]/10 transition-colors"></div>
                    <span className="text-[var(--app-text-muted)] text-[10px] uppercase font-bold tracking-[0.2em] block mb-2 relative z-10">Your Unique ID</span>
                    <span className="text-4xl md:text-5xl font-black text-[var(--app-text)] tracking-widest relative z-10 font-mono">
                        {user?.referral_code || 'LOADING'}
                    </span>
                    <div className="mt-4 text-xs text-[var(--app-text-muted)] group-hover:text-[var(--app-accent)] flex items-center justify-center gap-2 transition-colors relative z-10 font-bold uppercase tracking-wider">
                        <Copy size={14}/> Tap to Copy
                    </div>
                </div>
                
                <div className="mt-6 grid grid-cols-1 gap-4">
                    <div className="bg-[var(--app-accent)]/10 border border-[var(--app-accent)]/20 p-4 rounded-lg flex items-start gap-3">
                        <CheckCircle className="text-[var(--app-accent)] shrink-0 mt-0.5" size={20} />
                        <div>
                            <h4 className="font-bold text-[var(--app-text)] text-sm">Reward: 5% Commission</h4>
                            <p className="text-xs text-[var(--app-text-muted)]">Earn 5% of every amount your referred user spends on the platform, forever.</p>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Referral History Table - Last 5 Only */}
            <div className="border-t border-[var(--app-border)] pt-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-[var(--app-text)]">Referral History</h3>
                    <span className="text-[10px] font-bold text-[var(--app-text-muted)] bg-[var(--app-card-bg)] px-2 py-1 rounded border border-[var(--app-border)] uppercase tracking-wider">Recent 5</span>
                </div>
                <div className="overflow-x-auto bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-[var(--app-bg)] text-[var(--app-text-muted)] uppercase text-[10px] font-bold tracking-wider">
                            <tr>
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4 text-right">Joined Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--app-border)]">
                            {stats.referredUsers.length > 0 ? stats.referredUsers.map((u: any) => (
                                <tr key={u.id} className="hover:bg-[var(--app-accent)]/5 transition-colors">
                                    <td className="px-6 py-4 text-[var(--app-text)] font-bold flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-[var(--app-bg)] flex items-center justify-center text-xs text-[var(--app-text-muted)] border border-[var(--app-border)] font-mono">
                                            {u.name.charAt(0).toUpperCase()}
                                        </div>
                                        {u.name}
                                    </td>
                                    <td className="px-6 py-4 text-[var(--app-text-muted)] font-mono text-right">{new Date(u.created_at).toLocaleDateString()}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={2} className="p-8 text-center text-gray-500 italic">No referrals yet. Share your code to start earning!</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};