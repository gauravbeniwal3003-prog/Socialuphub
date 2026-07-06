import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { Button, Input } from '../ui/Components';
import { ShieldAlert, Ban, Activity, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../App';
import { getBaseApiUrl } from '../../services/mockStore';

export const SecurityManagement = ({ notify }: { notify: (msg: string, type: 'success' | 'error') => void }) => {
    const { user } = useAuth();
    const [logs, setLogs] = useState<any[]>([]);
    const [bannedIps, setBannedIps] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [ipToBan, setIpToBan] = useState('');
    const [banReason, setBanReason] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: session } = await supabase.auth.getSession();
            const token = session?.session?.access_token;
            
            const backendBase = getBaseApiUrl();
                
            const res = await fetch(`${backendBase}/api/admin/security/logs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to fetch security logs");
            
            setLogs(data.logs || []);
            setBannedIps(data.bannedIps || []);
        } catch (e: any) {
            notify(e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleBan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ipToBan) return;
        try {
            const { data: session } = await supabase.auth.getSession();
            const token = session?.session?.access_token;
            const backendBase = getBaseApiUrl();
                
            const res = await fetch(`${backendBase}/api/admin/security/ban`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ ip: ipToBan, reason: banReason })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            notify(`IP ${ipToBan} permanently banned`, 'success');
            setIpToBan('');
            setBanReason('');
            fetchData();
        } catch (e: any) {
            notify(e.message, 'error');
        }
    };

    const handleUnban = async (ip: string) => {
        if (!confirm(`Are you sure you want to unban IP ${ip}?`)) return;
        try {
            const { data: session } = await supabase.auth.getSession();
            const token = session?.session?.access_token;
            const backendBase = getBaseApiUrl();
                
            const res = await fetch(`${backendBase}/api/admin/security/unban`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ ip })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            notify(`IP ${ip} unbanned`, 'success');
            fetchData();
        } catch (e: any) {
            notify(e.message, 'error');
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-red-50 dark:bg-red-950/20 p-5 rounded-2xl border border-red-200 dark:border-red-900/40">
                <h3 className="font-bold text-red-700 dark:text-red-400 text-lg flex items-center gap-2 mb-2">
                    <ShieldAlert size={24} /> Strict Security Panel
                </h3>
                <p className="text-sm text-red-600 dark:text-red-400/80 font-medium">
                    Master Admin Access ({user?.email}). IP blocks here operate at the middleware level, actively denying access and dropping malicious requests instantly.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-6 rounded-2xl shadow-sm">
                    <h3 className="text-lg font-bold text-[var(--app-text)] flex items-center gap-2 mb-4">
                        <Ban className="text-red-500" size={20} /> Ban IP Address
                    </h3>
                    <form onSubmit={handleBan} className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Target IP</label>
                            <Input placeholder="e.g. 192.168.1.1" value={ipToBan} onChange={e => setIpToBan(e.target.value)} required />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Reason / Notes</label>
                            <Input placeholder="Malicious activity..." value={banReason} onChange={e => setBanReason(e.target.value)} />
                        </div>
                        <Button type="submit" variant="danger" className="w-full">Enforce IP Ban</Button>
                    </form>
                </div>
                
                <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-6 rounded-2xl shadow-sm">
                    <h3 className="text-lg font-bold text-[var(--app-text)] flex items-center gap-2 mb-4">
                        <ShieldCheck className="text-emerald-500" size={20} /> Active IP Bans ({bannedIps.length})
                    </h3>
                    <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                        {bannedIps.length === 0 ? (
                            <p className="text-sm text-gray-500 italic">No IPs currently banned.</p>
                        ) : (
                            bannedIps.map(ban => (
                                <div key={ban.id} className="flex justify-between items-center bg-gray-50 dark:bg-white/5 p-3 rounded-lg border border-gray-100 dark:border-white/10">
                                    <div>
                                        <p className="font-bold text-sm text-[var(--app-text)]">{ban.method}</p>
                                        <p className="text-xs text-gray-500">{ban.utr || 'No reason specified'}</p>
                                    </div>
                                    <button onClick={() => handleUnban(ban.method)} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-md transition-colors">
                                        Unban
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-6 rounded-2xl shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-[var(--app-text)] flex items-center gap-2">
                        <Activity className="text-blue-500" size={20} /> Forensic Audit Logs
                    </h3>
                    <Button size="sm" variant="secondary" onClick={fetchData}>Refresh Logs</Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-white/10">
                                <th className="p-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="p-3 text-xs font-bold text-gray-500 uppercase tracking-wider">IP Address</th>
                                <th className="p-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Admin User ID</th>
                                <th className="p-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.length === 0 ? (
                                <tr><td colSpan={4} className="p-4 text-center text-sm text-gray-500">No logs found</td></tr>
                            ) : (
                                logs.map(log => (
                                    <tr key={log.id} className="border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                        <td className="p-3 text-sm text-gray-500 whitespace-nowrap">{new Date(log.date).toLocaleString()}</td>
                                        <td className="p-3 text-sm font-medium text-[var(--app-text)]">{log.method}</td>
                                        <td className="p-3 text-xs text-gray-500 font-mono truncate max-w-[150px]" title={log.userId}>{log.userId || 'System'}</td>
                                        <td className="p-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">{log.utr}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
