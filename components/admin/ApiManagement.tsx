import React, { useState, useEffect, useMemo } from 'react';
import { Card, Button, Input, Badge } from '../ui/Components';
import { supabase } from '../../services/supabase';
import { useStore, getConfig, updateConfig, fetchOrders, fetchUsers } from '../../services/mockStore';
import { 
  Code, Key, Percent, Check, Copy, RefreshCw, 
  Search, ShieldAlert, ShoppingBag, Eye, EyeOff, Edit3, 
  ArrowRight, UserCheck, Calendar, DollarSign, ListFilter,
  CheckCircle, Play, AlertCircle
} from 'lucide-react';
import { CURRENCY_SYMBOL } from '../../constants';
import { Order, User, GlobalConfig } from '../../types';

interface ApiManagementProps {
  notify: (msg: string, type: 'success' | 'error') => void;
}

export const ApiManagement: React.FC<ApiManagementProps> = ({ notify }) => {
  const config = useStore('suh_config', getConfig) as GlobalConfig;
  const users = useStore('suh_users', fetchUsers) as User[];
  const orders = useStore('suh_orders', fetchOrders) as Order[];

  // Discount settings
  const [apiDiscount, setApiDiscount] = useState<string>(
    String((config as any)?.apiDiscountPercent || '0')
  );
  const [isSavingDiscount, setIsSavingDiscount] = useState(false);

  // Search/Filters
  const [apiUserSearch, setApiUserSearch] = useState('');
  const [apiOrderSearch, setApiOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');

  // Key visual states
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Stats calculation
  const apiUsersList = useMemo(() => {
    if (!Array.isArray(users)) return [];
    return users.filter(u => u && u.api_key && u.api_key.trim() !== '');
  }, [users]);

  const apiOrdersList = useMemo(() => {
    if (!Array.isArray(orders)) return [];
    // Filter orders that were placed via API
    return orders.filter(o => o && (o as any).placed_via_api === true);
  }, [orders]);

  const totalFundsDeductedByApi = useMemo(() => {
    return apiOrdersList.reduce((acc, curr) => acc + (curr.charge || 0), 0);
  }, [apiOrdersList]);

  // Handle setting SMM API discounts
  const handleSaveDiscount = async () => {
    const parsed = parseFloat(apiDiscount);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      notify('Discount percentage must be a number between 0 and 100', 'error');
      return;
    }
    setIsSavingDiscount(true);
    try {
      await updateConfig({ apiDiscountPercent: parsed } as any);
      notify(`Global SMM API discount configured successfully to ${parsed}%!`, 'success');
    } catch (e: any) {
      notify(e.message || 'Failed to update SMM API discount', 'error');
    } finally {
      setIsSavingDiscount(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, nextStatus: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: nextStatus })
        .eq('id', orderId);

      if (error) throw error;
      notify('API Order status updated successfully!', 'success');
      // Trigger a local UI state updates by dispatching an event
      window.dispatchEvent(new CustomEvent('suh_data_update', { detail: ['suh_cache_orders'] }));
    } catch (err: any) {
      notify(err.message || 'Failed to change API order status', 'error');
    }
  };

  const toggleKeyReveal = (userId: string) => {
    setRevealedKeys(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const copyKeyText = (userId: string, keyVal: string) => {
    navigator.clipboard.writeText(keyVal);
    setCopiedKeyId(userId);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  // Filter lists
  const filteredApiUsers = useMemo(() => {
    if (!Array.isArray(apiUsersList)) return [];
    return apiUsersList.filter(u => {
      if (!u) return false;
      const q = apiUserSearch.toLowerCase();
      return (
        (u.name && String(u.name).toLowerCase().includes(q)) ||
        (u.email && String(u.email).toLowerCase().includes(q)) ||
        (u.api_key && String(u.api_key).toLowerCase().includes(q))
      );
    });
  }, [apiUsersList, apiUserSearch]);

  const filteredApiOrders = useMemo(() => {
    if (!Array.isArray(apiOrdersList)) return [];
    return apiOrdersList.filter(o => {
      if (!o) return false;
      const q = apiOrderSearch.toLowerCase();
      const orderId = String(o.id || '').toLowerCase();
      const serviceName = String(o.serviceName || '').toLowerCase();
      const link = String(o.link || '').toLowerCase();
      const serviceId = String(o.serviceId || '').toLowerCase();
      
      const matchSearch = (
        orderId.includes(q) ||
        serviceName.includes(q) ||
        link.includes(q) ||
        serviceId.includes(q)
      );
      
      const orderStatus = String(o.status || '').toUpperCase();
      const matchFilter = orderStatusFilter === 'ALL' || orderStatus === orderStatusFilter.toUpperCase();
      return matchSearch && matchFilter;
    });
  }, [apiOrdersList, apiOrderSearch, orderStatusFilter]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* API Key Global Header Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 border border-neutral-800/80 bg-neutral-900/60 rounded-2xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Active SMM APIs</span>
            <h3 className="text-2xl font-black text-white">{apiUsersList.length}</h3>
          </div>
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
            <Key size={20} />
          </div>
        </Card>

        <Card className="p-5 border border-neutral-800/80 bg-neutral-900/60 rounded-2xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total API Orders</span>
            <h3 className="text-2xl font-black text-white">{apiOrdersList.length}</h3>
          </div>
          <div className="p-3 bg-[var(--app-accent)]/10 text-[var(--app-accent)] rounded-xl">
            <ShoppingBag size={20} />
          </div>
        </Card>

        <Card className="p-5 border border-neutral-800/80 bg-neutral-900/60 rounded-2xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider font-sans">API Collected Cost</span>
            <h3 className="text-2xl font-black text-white">{CURRENCY_SYMBOL}{totalFundsDeductedByApi.toFixed(2)}</h3>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <DollarSign size={20} />
          </div>
        </Card>

        <Card className="p-5 border border-neutral-800/80 bg-neutral-900/60 rounded-2xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">API Discount Rate</span>
            <h3 className="text-2xl font-black text-white">{(config as any)?.apiDiscountPercent || 0}%</h3>
          </div>
          <div className="p-3 bg-orange-500/10 text-orange-400 rounded-xl">
            <Percent size={20} />
          </div>
        </Card>
      </div>

      {/* Global Config of SMM discounts */}
      <Card className="p-6 bg-neutral-900/80 border border-neutral-800/80 rounded-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex gap-3 items-center">
            <div className="p-2.5 bg-orange-500/10 text-orange-400 rounded-xl">
              <Percent size={20} />
            </div>
            <div>
              <h4 className="font-bold text-white text-base">Client API Discount Manager</h4>
              <p className="text-gray-400 text-xs mt-0.5">Define a custom percentage discount applied to all client transactions processed through SMM API keys.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 max-w-sm w-full md:w-auto">
            <Input
              id="admin-api-discount-rate"
              type="number"
              value={apiDiscount}
              onChange={(e) => setApiDiscount(e.target.value)}
              className="bg-neutral-950 border-neutral-800 pr-2 w-28 text-white"
              placeholder="e.g. 5"
              min={0}
              max={100}
            />
            <Button
              id="save-api-discount-button"
              onClick={handleSaveDiscount}
              disabled={isSavingDiscount}
              className="bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-white font-bold rounded-xl whitespace-nowrap px-4 py-3"
            >
              {isSavingDiscount ? <RefreshCw size={15} className="animate-spin" /> : 'Set Discount'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Active Developer SMM Keys Directory */}
      <Card className="p-6 bg-neutral-900/80 border border-neutral-800/80 rounded-2xl">
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Code size={18} className="text-[var(--app-accent)]" /> Active SMM API Keys Directory
            </h3>
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 shrink-0" size={16} />
              <input
                id="search-api-users-field"
                type="text"
                placeholder="Search Developer name, key, or email..."
                value={apiUserSearch}
                onChange={(e) => setApiUserSearch(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 pl-9 pr-4 text-xs font-medium text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[var(--app-accent)]/40"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-800/70">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-950 text-gray-400 font-bold border-b border-neutral-800">
                  <th className="p-3.5">Developer Details</th>
                  <th className="p-3.5">API Key Credentials</th>
                  <th className="p-3.5 text-center">Account Balance</th>
                  <th className="p-3.5 text-center">API Spend History</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80">
                {filteredApiUsers.length > 0 ? (
                  filteredApiUsers.map((apiUser) => {
                    const userApiOrders = apiOrdersList.filter(o => o.userId === apiUser.id);
                    const userApiSpend = userApiOrders.reduce((sum, o) => sum + (o.charge || 0), 0);

                    return (
                      <tr key={apiUser.id} className="hover:bg-neutral-950/40 text-gray-300">
                        <td className="p-3.5">
                          <div className="font-bold text-gray-100">{apiUser.name || 'SMM Dev'}</div>
                          <div className="text-[10px] text-gray-500 font-mono">{apiUser.email}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-2 font-mono text-[10px]">
                            <span className="text-gray-400 font-semibold tracking-wider">
                              {revealedKeys[apiUser.id] ? (apiUser.api_key || 'No Key') : (apiUser.api_key ? `${apiUser.api_key.substring(0, 10)}*********************` : 'No Key')}
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => toggleKeyReveal(apiUser.id)}
                                className="text-gray-400 hover:text-white p-1 rounded hover:bg-neutral-800 transition-colors"
                                title="Toggle Reveal"
                              >
                                {revealedKeys[apiUser.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                              </button>
                              <button
                                onClick={() => copyKeyText(apiUser.id, apiUser.api_key || '')}
                                className="text-[var(--app-accent)] hover:opacity-85 p-1 rounded hover:bg-neutral-800 transition-colors"
                                title="Copy Key"
                              >
                                {copiedKeyId === apiUser.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 text-center font-bold font-mono">
                          {CURRENCY_SYMBOL}{parseFloat(apiUser.balance || 0).toFixed(2)}
                        </td>
                        <td className="p-3.5 text-center font-bold">
                          <div className="text-gray-200">{CURRENCY_SYMBOL}{userApiSpend.toFixed(2)}</div>
                          <div className="text-[9px] text-gray-500 font-mono font-medium">{userApiOrders.length} orders placed</div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-gray-500 italic">No developer accounts match your search indicators</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* SMM API Placed Orders Log Tracker */}
      <Card className="p-6 bg-neutral-900/80 border border-neutral-800/80 rounded-2xl">
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShoppingBag size={18} className="text-[var(--app-accent)]" /> SMM API Placed Orders Log Tracker
              </h3>
              <p className="text-[10px] text-gray-500 mt-0.5">Review, process, and change parameters for orders placed directly via automated integration modules.</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 max-w-lg w-full">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 shrink-0" size={14} />
                <input
                  id="search-api-orders-field"
                  type="text"
                  placeholder="ID, service name, target link..."
                  value={apiOrderSearch}
                  onChange={(e) => setApiOrderSearch(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 pl-9 pr-4 text-xs font-semibold text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[var(--app-accent)]/40"
                />
              </div>

              <select
                id="filter-api-order-status"
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 text-gray-300 text-xs font-bold rounded-xl px-3 py-2 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="PROCESSING">Processing</option>
                <option value="COMPLETED">Completed</option>
                <option value="PARTIAL">Partial</option>
                <option value="CANCELED">Canceled</option>
                <option value="FAILED">Failed</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-800/70">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-950 text-gray-400 font-bold border-b border-neutral-800">
                  <th className="p-3.5">Client User / Order ID</th>
                  <th className="p-3.5">Selected SMM Service</th>
                  <th className="p-3.5">Target Link</th>
                  <th className="p-3.5 text-center">Qty / Cost</th>
                  <th className="p-3.5 text-center">SMM Status</th>
                  <th className="p-3.5 text-center">Delivery Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80">
                {filteredApiOrders.length > 0 ? (
                  filteredApiOrders.map((ord) => {
                    const clientOwner = users.find(u => u.id === ord.userId);

                    return (
                      <tr key={ord.id} className="hover:bg-neutral-950/40 text-gray-300">
                        <td className="p-3.5">
                          <div className="font-bold text-gray-200">{clientOwner?.name || 'Dev Client'}</div>
                          <div className="text-[10px] text-gray-500 font-mono truncate max-w-[120px]" title={ord.id}>
                            ID: {ord.id}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-gray-200 truncate max-w-[200px]" title={ord.serviceName}>
                            {ord.serviceName}
                          </div>
                          <div className="text-[10px] text-gray-500 font-mono">Service ID: {ord.serviceId}</div>
                        </td>
                        <td className="p-3.5">
                          <a
                            href={ord.link ? ord.link.split('#comments=')[0] : ''}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--app-accent)] hover:underline truncate max-w-[160px] block font-mono text-[10px]"
                            title={ord.link ? ord.link.split('#comments=')[0] : ''}
                          >
                            {ord.link ? ord.link.split('#comments=')[0] : ''}
                          </a>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="font-bold text-gray-200 font-mono">{parseInt(String(ord.quantity || 0)).toLocaleString()}</div>
                          <div className="text-[9px] text-[var(--app-accent)] font-bold font-mono">
                            {CURRENCY_SYMBOL}{parseFloat(ord.charge || 0).toFixed(2)}
                          </div>
                        </td>
                        <td className="p-3.5 text-center">
                          <Badge
                            id={`api-order-badge-${ord.id}`}
                            className={`${
                              ord.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              ord.status === 'Pending' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20 animate-pulse' :
                              ord.status === 'Processing' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                              ord.status === 'Canceled' ? 'bg-neutral-800 text-neutral-400' : 'bg-red-500/10 text-red-500'
                            } font-semibold`}
                          >
                            {ord.status}
                          </Badge>
                        </td>
                        <td className="p-3.5 text-center">
                          <select
                            id={`status-select-${ord.id}`}
                            value={ord.status}
                            onChange={(e) => handleUpdateOrderStatus(ord.id, e.target.value)}
                            className="bg-neutral-950 border border-neutral-800 text-gray-300 text-[10px] font-bold rounded px-1.5 py-1 focus:outline-none"
                          >
                            <option value="Pending">Set Pending</option>
                            <option value="Processing">Set Processing</option>
                            <option value="Completed">Set Completed</option>
                            <option value="Partial">Set Partial</option>
                            <option value="Canceled">Set Canceled</option>
                            <option value="Failed">Set Failed</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-gray-500 italic">No automated SMM API orders match requested filters</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
};
