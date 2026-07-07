import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../services/supabase';
import { Button, Input } from '../ui/Components';
import { 
  ShieldAlert, 
  Activity, 
  Search, 
  Clock, 
  Trash2, 
  RefreshCw, 
  User, 
  Cpu, 
  Globe, 
  Filter, 
  AlertCircle,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { useAuth } from '../../App';
import { getBaseApiUrl, handleJsonResponse } from '../../services/mockStore';

export const SecurityManagement = ({ notify }: { notify: (msg: string, type: 'success' | 'error') => void }) => {
    const { user } = useAuth();
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterActor, setFilterActor] = useState('ALL');

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const { data: session } = await supabase.auth.getSession();
            const token = session?.session?.access_token;
            const backendBase = getBaseApiUrl();
            
            const res = await fetch(`${backendBase}/api/admin/security/logs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await handleJsonResponse(res, "Failed to fetch forensic logs");
            
            setLogs(data.logs || []);
        } catch (e: any) {
            notify(e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handlePurge = async () => {
        try {
            const { data: session } = await supabase.auth.getSession();
            const token = session?.session?.access_token;
            const backendBase = getBaseApiUrl();
            
            const res = await fetch(`${backendBase}/api/admin/security/purge-logs`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await handleJsonResponse(res, "Failed to purge old logs");
            
            notify("Logs older than 3 hours successfully purged!", "success");
            fetchLogs();
        } catch (e: any) {
            notify(e.message, 'error');
        }
    };

    useEffect(() => {
        fetchLogs();
        // Poll every 10 seconds for real-time forensic updates
        const interval = setInterval(fetchLogs, 10000);
        return () => clearInterval(interval);
    }, []);

    // Filter and Search logic
    const filteredLogs = useMemo(() => {
        return logs
            .filter(log => {
                const matchesActor = filterActor === 'ALL' || log.actorType === filterActor;
                if (!matchesActor) return false;

                const q = searchQuery.toLowerCase();
                return (
                    String(log.actorName || '').toLowerCase().includes(q) ||
                    String(log.url || '').toLowerCase().includes(q) ||
                    String(log.method || '').toLowerCase().includes(q) ||
                    String(log.ip || '').toLowerCase().includes(q) ||
                    String(log.details || '').toLowerCase().includes(q) ||
                    String(log.status || '').includes(q)
                );
            });
    }, [logs, searchQuery, filterActor]);

    const getActorBadge = (type: string, name: string) => {
        switch (type) {
            case 'ADMIN':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-950/40 border border-red-600/50 text-red-400">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        ADMIN: {name}
                    </span>
                );
            case 'USER':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-950/40 border border-amber-600/50 text-amber-400">
                        <User size={12} />
                        USER: {name}
                    </span>
                );
            case 'FRONTEND':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-950/40 border border-blue-600/50 text-blue-400">
                        <Globe size={12} />
                        FRONTEND
                    </span>
                );
            case 'BACKEND':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/40 border border-emerald-600/50 text-emerald-400">
                        <Cpu size={12} />
                        BACKEND: {name}
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-neutral-800 border border-neutral-700 text-neutral-400">
                        <AlertCircle size={12} />
                        ANONYMOUS
                    </span>
                );
        }
    };

    return (
        <div className="space-y-6">
            {/* Header info */}
            <div className="bg-red-50 dark:bg-red-950/10 p-6 rounded-2xl border border-red-200 dark:border-red-900/30">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h3 className="font-bold text-red-700 dark:text-red-400 text-lg flex items-center gap-2">
                            <ShieldAlert size={24} /> Forensic Panel Logging & Security Guard
                        </h3>
                        <p className="text-sm text-red-600 dark:text-red-400/80 font-medium">
                            Monitoring active API requests to the SocialUpHub Panel in real-time. Anonymous direct requests without valid Frontend or Auth headers are automatically rejected by middleware.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handlePurge} variant="danger" size="sm" className="flex items-center gap-2">
                            <Trash2 size={14} /> Clear Logs &gt;3 Hours Old
                        </Button>
                        <Button onClick={fetchLogs} variant="outline" size="sm" className="flex items-center gap-2">
                            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
                        </Button>
                    </div>
                </div>
            </div>

            {/* Quick stats & disclaimer */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-4 rounded-xl flex items-center gap-3">
                    <div className="bg-blue-950/50 p-2.5 rounded-lg border border-blue-800/30 text-blue-400">
                        <Activity size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-bold uppercase">Total Streamed</p>
                        <p className="text-2xl font-black text-[var(--app-text)]">{logs.length}</p>
                    </div>
                </div>
                <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-4 rounded-xl flex items-center gap-3">
                    <div className="bg-amber-950/50 p-2.5 rounded-lg border border-amber-800/30 text-amber-400">
                        <Clock size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-bold uppercase">Retention Limit</p>
                        <p className="text-lg font-bold text-[var(--app-text)]">3 Hours Max</p>
                    </div>
                </div>
                <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-4 rounded-xl flex items-center gap-3">
                    <div className="bg-red-950/50 p-2.5 rounded-lg border border-red-800/30 text-red-400">
                        <ShieldAlert size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-bold uppercase font-sans">Strict Rejection</p>
                        <p className="text-lg font-bold text-red-500 font-sans">Active (403 Block)</p>
                    </div>
                </div>
            </div>

            {/* Filters bar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--app-card-bg)] border border-[var(--app-border)] p-4 rounded-xl">
                <div className="flex flex-wrap gap-2">
                    {['ALL', 'ADMIN', 'USER', 'FRONTEND', 'BACKEND', 'ANONYMOUS'].map(type => (
                        <button
                            key={type}
                            onClick={() => setFilterActor(type)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filterActor === type ? "bg-[var(--app-accent)] text-white" : "bg-[var(--app-bg)] border border-[var(--app-border)] text-gray-400 hover:text-white"}`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
                <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                    <input
                        className="w-full bg-[var(--app-bg)] border border-[var(--app-border)] rounded-lg pl-9 pr-4 py-2 text-xs text-[var(--app-text)] focus:border-[var(--app-accent)] outline-none"
                        placeholder="Search logs by IP, email, action, status..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Logs table list */}
            <div className="overflow-x-auto bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl">
                <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead>
                        <tr className="bg-[var(--app-bg)] border-b border-[var(--app-border)]">
                            <th className="px-4 py-3 font-bold text-gray-400 uppercase tracking-wider text-[10px]">Timestamp / IP</th>
                            <th className="px-4 py-3 font-bold text-gray-400 uppercase tracking-wider text-[10px]">Actor</th>
                            <th className="px-4 py-3 font-bold text-gray-400 uppercase tracking-wider text-[10px]">Method / Path</th>
                            <th className="px-4 py-3 font-bold text-gray-400 uppercase tracking-wider text-[10px]">Action & Details</th>
                            <th className="px-4 py-3 font-bold text-gray-400 uppercase tracking-wider text-[10px] text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border)]">
                        {loading && logs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 italic">
                                    Streaming forensic logs...
                                </td>
                            </tr>
                        ) : filteredLogs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 italic">
                                    No logs match your search criteria.
                                </td>
                            </tr>
                        ) : (
                            filteredLogs.map(log => (
                                <tr key={log.id} className="hover:bg-neutral-800/30 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-gray-300">
                                            {new Date(log.timestamp).toLocaleTimeString()}
                                        </div>
                                        <div className="text-[10px] text-gray-500 font-mono">
                                            IP: {log.ip}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {getActorBadge(log.actorType, log.actorName)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold mr-2 ${
                                            log.method === 'POST' ? 'bg-blue-950 text-blue-400 border border-blue-900' :
                                            log.method === 'GET' ? 'bg-gray-800 text-gray-400 border border-gray-700' :
                                            'bg-yellow-950 text-yellow-400 border border-yellow-900'
                                        }`}>
                                            {log.method}
                                        </span>
                                        <span className="font-mono text-gray-400 text-xs">
                                            {log.url}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="truncate max-w-[320px] text-gray-300 font-medium" title={log.details}>
                                            {log.details}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`inline-flex items-center px-2 py-1.5 rounded-md text-xs font-bold font-mono ${
                                            log.status >= 200 && log.status < 300 ? 'bg-green-950/80 text-green-400 border border-green-900' :
                                            log.status === 403 ? 'bg-red-950 text-red-500 border border-red-900 animate-pulse' :
                                            'bg-amber-950 text-amber-500 border border-amber-900'
                                        }`}>
                                            {log.status}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
