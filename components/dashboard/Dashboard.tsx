
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore, fetchServices, getConfig, placeOrder, fetchOrders, fetchTransactions, updateUserPassword, fetchCategories, handleRazorpaySuccess, calculateFinalPrice, fetchUserHistory, createRazorpayOrder } from '../../services/mockStore';
import { useAuth } from '../../App';
import { Card, Button, Input, Notification, Badge } from '../ui/Components';
import { Service, Order, OrderStatus, GlobalConfig, Category, Transaction } from '../../types';
import { CONTACT_WHATSAPP_URL, CURRENCY_SYMBOL, RAZORPAY_KEY_ID, RAZORPAY_MERCHANT_NAME } from '../../constants';
import { Search, Wallet, RefreshCw, X, MessageCircle, Lock, Edit2, ShieldCheck, ChevronDown, ArrowDownLeft, ShoppingBag, Clock, ExternalLink, TrendingUp, Upload, Check, AlertTriangle, PlayCircle, Instagram, Youtube, Twitter, Facebook, Copy, Zap, Gift, Share2, CheckCircle } from 'lucide-react';
import { ReferralSection } from './ReferralSection';
import { Logo } from '../ui/Logo';

const cleanServiceName = (name: string): string => {
    if (!name) return "";
    return name
        .replace(/\[\s*refill\s*\d*\s*days?\s*\]/gi, '')
        .replace(/\(\s*refill\s*\d*\s*days?\s*\)/gi, '')
        .replace(/\[\s*\d*\s*days?\s*refill\s*\]/gi, '')
        .replace(/\(\s*\d*\s*days?\s*refill\s*\)/gi, '')
        .replace(/\[\s*refill\s*\]/gi, '')
        .replace(/\(\s*refill\s*\)/gi, '')
        .replace(/refill\s*\d*\s*days?/gi, '')
        .replace(/\d*\s*days?\s*refill/gi, '')
        .replace(/\[\s*\d*\s+days\s*\]/gi, '')
        .replace(/\(\s*\d*\s+days\s*\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
};

declare const Razorpay: any;

const CustomDropdown = ({ options, value, onChange, placeholder }: { options: string[], value: string, onChange: (val: string) => void, placeholder: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => { 
    const handleClickOutside = (event: MouseEvent) => { 
      if (ref.current && !ref.current.contains(event.target as Node)) { 
        setIsOpen(false); 
      } 
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={ref}>
      <div 
        className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl px-4 py-3.5 text-[var(--app-text)] cursor-pointer flex justify-between items-center hover:border-[var(--app-accent)]/50 transition-colors text-sm"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={`block truncate ${value ? 'text-[var(--app-text)]' : 'text-[var(--app-text-muted)]'}`}>{value || placeholder}</span>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} text-[var(--app-text-muted)]`} />
      </div>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in duration-100">
           {options.length > 0 ? options.map(opt => (
             <div 
               key={opt} 
               className="px-4 py-3 hover:bg-[var(--app-accent)]/15 hover:text-[var(--app-accent)] cursor-pointer text-sm text-[var(--app-text)] transition-colors border-b border-[var(--app-border)]/55 last:border-0 font-medium"
               onClick={() => { onChange(opt); setIsOpen(false); }}
             >
               {opt}
             </div>
           )) : (
             <div className="px-4 py-3 text-xs text-[var(--app-text-muted)] text-center">No results found</div>
           )}
        </div>
      )}
    </div>
  );
};

const NewOrderSection = () => {
    const { user } = useAuth();
    const services = useStore('suh_services', fetchServices) as Service[];
    const categories = useStore('suh_categories', fetchCategories) as Category[];
    const config = useStore('suh_config', getConfig) as GlobalConfig;
    const orders = useStore('suh_orders', fetchOrders) as Order[];
    
    // PERSISTENCE: Initialize state from SessionStorage if available
    const [selectedCategory, setSelectedCategory] = useState(() => sessionStorage.getItem('suh_order_category') || '');
    const [selectedServiceId, setSelectedServiceId] = useState(() => sessionStorage.getItem('suh_order_service') || '');
    const [link, setLink] = useState(() => sessionStorage.getItem('suh_order_link') || '');
    const [quantity, setQuantity] = useState(() => sessionStorage.getItem('suh_order_qty') || '');
    const [coupon, setCoupon] = useState('');
    const [activeFilter, setActiveFilter] = useState('All'); // For Chips
    const [searchTerm, setSearchTerm] = useState(''); // Global Search

    const [notification, setNotification] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const [loading, setLoading] = useState(false);
    
    // Save to SessionStorage on Change
    useEffect(() => { sessionStorage.setItem('suh_order_category', selectedCategory); }, [selectedCategory]);
    useEffect(() => { sessionStorage.setItem('suh_order_service', selectedServiceId); }, [selectedServiceId]);
    useEffect(() => { sessionStorage.setItem('suh_order_link', link); }, [link]);
    useEffect(() => { sessionStorage.setItem('suh_order_qty', quantity); }, [quantity]);

    const userOrderCount = useMemo(() => orders.filter(o => o.userId === user?.id).length, [orders, user]);
    
    // Filter Logic for Categories
    const categoryNames = useMemo(() => {
        let cats = categories.filter(c => c.isEnabled).sort((a,b) => a.sortOrder - b.sortOrder);
        if (activeFilter !== 'All') {
            // Case insensitive includes check
            cats = cats.filter(c => c.name.toLowerCase().includes(activeFilter.toLowerCase()));
        }
        // Global Search Filter
        if (searchTerm) {
            cats = cats.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        return cats.map(c => c.name);
    }, [categories, activeFilter, searchTerm]);

    const filteredServices = useMemo(() => { if (!selectedCategory) return []; return services.filter(s => s.category === selectedCategory && s.isEnabled); }, [selectedCategory, services]);
    const selectedService = useMemo(() => services.find(s => s.service === selectedServiceId), [services, selectedServiceId]);
    
    const serviceOptions = useMemo(() => {
        let opts = filteredServices.map(s => `${s.service} - ${cleanServiceName(s.name)} - ${CURRENCY_SYMBOL}${calculateFinalPrice(s, config).toFixed(2)}`);
        // Global Search Filter
        if (searchTerm) {
            opts = opts.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        return opts;
    }, [filteredServices, config, searchTerm]);

    const calculateTotal = () => { if (!selectedService || !quantity) return 0; const rate = calculateFinalPrice(selectedService, config); return (rate * parseInt(quantity)) / 1000; };
    const finalTotal = calculateTotal();

    const handleSubmit = async () => { 
        if (!user || !selectedService) return; 
        setLoading(true); 
        try { 
            await placeOrder(user.id, selectedService.service, selectedService.name, link, parseInt(quantity), finalTotal, coupon); 
            setNotification({ msg: "Order placed successfully! It will start shortly.", type: 'success' }); 
            // Clear persistent storage on success
            setLink(''); setQuantity(''); setCoupon(''); 
            sessionStorage.removeItem('suh_order_link');
            sessionStorage.removeItem('suh_order_qty');
        } catch (e: any) { 
            setNotification({ msg: e.message, type: 'error' }); 
        } finally { 
            setLoading(false); 
        } 
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500 px-0">
            {notification && <Notification message={notification.msg} type={notification.type} onClose={() => setNotification(null)} />}
            
            {/* WELCOME CARD */}
            <div className="bg-gradient-to-r from-[var(--app-accent)] to-[var(--app-accent)]/85 rounded-3xl p-6 text-white shadow-[0_10px_30px_-10px_rgba(46,189,89,0.35)] relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                <div className="relative z-10">
                    <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
                        <div className="min-w-0">
                            <p className="text-green-50 text-xs sm:text-sm font-medium mb-1">Welcome,</p>
                            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight truncate max-w-[160px] xs:max-w-[200px] sm:max-w-[300px]">{user?.name}</h2>
                        </div>
                        <button className="bg-white/20 border border-white/10 backdrop-blur-sm px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-[10px] sm:text-xs font-bold flex items-center gap-1.5 hover:bg-white/30 transition-all shrink-0">
                            <PlayCircle size={12} fill="white" className="text-[var(--app-accent)]"/> Watch Demo
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-black/20 backdrop-blur-md rounded-2xl p-3 flex items-center gap-3 border border-white/10">
                            <div className="bg-white/20 p-2 rounded-lg"><Wallet size={20}/></div>
                            <div>
                                <p className="text-xs text-green-50 font-bold opacity-80">Balance</p>
                                <p className="text-lg font-black">{CURRENCY_SYMBOL}{(user?.balance || 0).toFixed(2)}</p>
                            </div>
                        </div>
                        <div className="bg-black/20 backdrop-blur-md rounded-2xl p-3 flex items-center gap-3 border border-white/10">
                            <div className="bg-white/20 p-2 rounded-lg"><ShoppingBag size={20}/></div>
                            <div>
                                <p className="text-xs text-green-50 font-bold opacity-80">Your Orders</p>
                                <p className="text-lg font-black">{userOrderCount}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ACTION BUTTONS - Subscription removed as requested */}
            <div>
                <button className="w-full bg-[var(--app-accent)] text-white font-bold py-3 rounded-xl shadow-lg border border-[var(--app-accent)]/50 flex items-center justify-center gap-2 hover:bg-[var(--app-accent-hover)] transition-all">
                    <Zap size={18} /> New Instant Order
                </button>
            </div>

            {/* ORDER FORM */}
            <div className="bg-[var(--app-card-bg)] rounded-2xl border border-[var(--app-border)] shadow-xl overflow-hidden">
                {/* Filters */}
                <div className="p-4 border-b border-[var(--app-border)] overflow-x-auto no-scrollbar bg-[var(--app-sidebar-bg)]/40">
                    <div className="flex gap-3">
                        {['All', 'Instagram', 'YouTube', 'Facebook', 'Twitter', 'TikTok'].map((filter, i) => (
                            <button 
                                key={i} 
                                onClick={() => { setActiveFilter(filter); setSelectedCategory(''); setSelectedServiceId(''); }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${activeFilter === filter ? 'bg-[var(--app-accent)] text-white shadow-[0_4px_12px_rgba(34,197,94,0.3)]' : 'bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)] hover:border-[var(--app-accent)]/30'}`}
                            >
                                {filter === 'Instagram' && <Instagram size={12}/>}
                                {filter === 'YouTube' && <Youtube size={12}/>}
                                {filter === 'Twitter' && <Twitter size={12}/>}
                                {filter === 'Facebook' && <Facebook size={12}/>}
                                {filter}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-5 space-y-6">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)]" size={18}/>
                        <input 
                            className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl pl-11 pr-4 py-3.5 text-sm text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-1 focus:ring-[var(--app-accent)]/30 outline-none transition-all" 
                            placeholder="Search category or service..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Dropdowns */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-[var(--app-text-muted)] mb-2 block ml-1 uppercase tracking-wider">Category</label>
                            <CustomDropdown options={categoryNames} value={selectedCategory} onChange={(val) => { setSelectedCategory(val); setSelectedServiceId(''); }} placeholder="Select Category" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-[var(--app-text-muted)] mb-2 block ml-1 uppercase tracking-wider">Service</label>
                            <CustomDropdown options={serviceOptions} value={selectedService ? `${selectedService.service} - ${cleanServiceName(selectedService.name)}` : ''} onChange={(val) => setSelectedServiceId(val.split(' - ')[0])} placeholder="Select Service" />
                        </div>
                    </div>

                    {/* Service Details Grid */}
                    {selectedService && (
                        <div className="bg-[var(--app-accent)]/5 rounded-xl border border-[var(--app-accent)]/20 p-4 animate-in fade-in duration-300">
                            <div className="grid grid-cols-2 gap-4 text-center mb-4">
                                <div className="space-y-1">
                                    <div className="text-[var(--app-text-muted)] text-[10px] uppercase font-bold flex items-center justify-center gap-1"><Clock size={11} className="text-[var(--app-accent)]"/> Start Time</div>
                                    <div className="text-[var(--app-text)] font-extrabold text-xs">INSTANT</div>
                                </div>
                                <div className="space-y-1 border-l border-[var(--app-border)]">
                                    <div className="text-[var(--app-text-muted)] text-[10px] uppercase font-bold flex items-center justify-center gap-1"><Zap size={11} className="text-[var(--app-accent)]"/> Speed</div>
                                    <div className="text-[var(--app-text)] font-extrabold text-xs">SUPER FAST</div>
                                </div>
                            </div>
                            
                            {/* Description Toggle/Preview */}
                            <div className="text-xs text-[var(--app-text-muted)] bg-[var(--app-input-bg)] p-3 rounded-xl border border-[var(--app-border)] leading-relaxed">
                                <p className="mb-2 text-[var(--app-text)] font-bold flex items-center gap-1">
                                    <ShieldCheck size={14} className="text-[var(--app-accent)]"/> Service Description:
                                </p>
                                <div className="opacity-90 whitespace-pre-wrap break-words leading-relaxed max-h-[150px] overflow-y-auto custom-scrollbar pr-2">
                                    {selectedService.description ? (
                                        selectedService.description
                                    ) : (
                                        <ul className="list-disc pl-4 space-y-1">
                                            <li>Link must be public.</li>
                                            <li>Do not change username.</li>
                                            <li>Start time varies by server load.</li>
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Link & Qty */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-[var(--app-text-muted)] mb-2 block ml-1 uppercase tracking-wider">Link</label>
                            <input className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl px-4 py-3.5 text-sm text-[var(--app-text)] focus:border-[var(--app-accent)] focus:ring-1 focus:ring-[var(--app-accent)]/30 outline-none placeholder-[var(--app-text-muted)]" placeholder="https://..." value={link} onChange={e => setLink(e.target.value)} />
                            <p className="text-[10px] text-[var(--app-text-muted)] mt-1 ml-1 font-medium">Account must be public.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-[var(--app-text-muted)] mb-2 block ml-1 uppercase tracking-wider">Quantity</label>
                                <input className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl px-4 py-3.5 text-sm text-[var(--app-text)] focus:border-[var(--app-accent)] focus:ring-1 focus:ring-[var(--app-accent)]/30 outline-none" type="number" placeholder="1000" value={quantity} onChange={e => setQuantity(e.target.value)} />
                                {selectedService && <p className="text-[10px] text-[var(--app-text-muted)] mt-1 ml-1 font-medium">Min: {selectedService.min} - Max: {selectedService.max}</p>}
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--app-text-muted)] mb-2 block ml-1 uppercase tracking-wider">Charge</label>
                                <div className="w-full bg-[var(--app-bg)] border border-[var(--app-border)] rounded-xl px-4 py-3.5 text-sm text-[var(--app-text)] font-mono flex items-center justify-between">
                                    <span className="text-[var(--app-accent)] font-black text-base">{CURRENCY_SYMBOL}{finalTotal.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <Button onClick={handleSubmit} isLoading={loading} className="w-full py-4 rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-[var(--app-accent)]/15" disabled={!selectedService || !link || !quantity}>
                        Place Order
                    </Button>
                </div>
            </div>
        </div>
    );
};

const OrdersSection = () => {
    const { user } = useAuth();
    const orders = useStore('suh_orders', fetchOrders) as Order[];
    const [filter, setFilter] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    const userOrders = useMemo(() => { 
        if (!user) return []; 
        let filtered = orders.filter(o => o.userId === user.id); 
        if (filter !== 'ALL') filtered = filtered.filter(o => o.status === filter); 
        if (searchTerm) filtered = filtered.filter(o => o.id.includes(searchTerm) || o.link.includes(searchTerm));
        return filtered.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()); 
    }, [user, orders, filter, searchTerm]);

    const statusColors: Record<string, string> = { 
        'Pending': 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20', 
        'Processing': 'text-blue-400 bg-blue-500/10 border-blue-500/20', 
        'Completed': 'text-green-500 bg-green-500/10 border-green-500/20', 
        'Partial': 'text-orange-500 bg-orange-500/10 border-orange-500/20', 
        'Canceled': 'text-red-500 bg-red-500/10 border-red-500/20', 
        'Failed': 'text-red-500 bg-red-500/10 border-red-500/20' 
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            {/* Header Controls */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                    {['ALL', 'Pending', 'Processing', 'Completed', 'Canceled'].map(s => (
                        <button 
                            key={s} 
                            onClick={() => setFilter(s)} 
                            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border transition-all ${filter === s ? 'bg-[var(--app-accent)] text-white border-[var(--app-accent)] shadow-[0_4px_12px_rgba(34,197,94,0.3)]' : 'bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border-[var(--app-border)] hover:border-[var(--app-accent)]/30'}`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
                <div className="relative">
                    <input 
                        className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl px-4 py-3 text-sm text-[var(--app-text)] focus:border-[var(--app-accent)] outline-none"
                        placeholder="Search orders..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)]"/>
                </div>
            </div>

            {/* Mobile Cards Layout */}
            <div className="grid gap-4 md:hidden">
                {userOrders.map(order => (
                    <div key={order.id} className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-2xl p-5 relative overflow-hidden shadow-sm">
                        <div className="flex flex-wrap justify-between items-center gap-2 mb-3 pb-2.5 border-b border-[var(--app-border)]/40">
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                <div className="bg-[var(--app-bg)] border border-[var(--app-border)] px-2 py-1 rounded-lg text-[var(--app-text)] font-mono text-[10px] sm:text-xs font-semibold shrink-0">{order.id}</div>
                                <a href={order.link} target="_blank" rel="noreferrer" className="text-blue-500 text-[11px] truncate max-w-[90px] xs:max-w-[120px] sm:max-w-[180px] flex items-center gap-0.5 font-bold hover:underline py-1">
                                    <ExternalLink size={10} className="shrink-0"/> Link
                                </a>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-wider shrink-0 shadow-sm ${statusColors[order.status] || 'text-gray-500'}`}>
                                {order.status}
                            </span>
                        </div>
                        
                        <h4 className="text-[var(--app-text)] font-extrabold text-sm mb-4 line-clamp-2">{order.serviceName}</h4>
                        
                        <div className="grid grid-cols-3 gap-2 bg-[var(--app-bg)] rounded-xl p-3 border border-[var(--app-border)]/50 mb-3">
                            <div className="text-center border-r border-[var(--app-border)]">
                                <p className="text-[10px] text-[var(--app-text-muted)] font-bold uppercase">Start</p>
                                <p className="text-[var(--app-text)] font-mono text-xs font-semibold">{order.start_count}</p>
                            </div>
                            <div className="text-center border-r border-[var(--app-border)]">
                                <p className="text-[10px] text-[var(--app-text-muted)] font-bold uppercase">Remains</p>
                                <p className="text-[var(--app-text)] font-mono text-xs font-semibold">{order.remains || '-'}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-[var(--app-text-muted)] font-bold uppercase">Qty</p>
                                <p className="text-[var(--app-text)] font-mono text-xs font-semibold">{order.quantity}</p>
                            </div>
                        </div>

                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[var(--app-text-muted)] font-medium">{new Date(order.date).toLocaleString()}</span>
                            <span className="text-lg font-black text-[var(--app-text)]">{CURRENCY_SYMBOL}{order.charge}</span>
                        </div>
                    </div>
                ))}
                {userOrders.length === 0 && <div className="text-center text-[var(--app-text-muted)] py-10">No orders found.</div>}
            </div>

            {/* Desktop Table Layout */}
            <div className="hidden md:block overflow-x-auto bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-2xl shadow-sm">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-[var(--app-sidebar-bg)] border-b border-[var(--app-border)] text-[var(--app-text-muted)] uppercase text-[10px] font-black tracking-wider">
                        <tr>
                            <th className="px-6 py-4">ID</th>
                            <th className="px-6 py-4">Service</th>
                            <th className="px-6 py-4">Link</th>
                            <th className="px-6 py-4">Charge</th>
                            <th className="px-6 py-4">Quantity</th>
                            <th className="px-6 py-4">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border)]">
                        {userOrders.map(order => (
                            <tr key={order.id} className="hover:bg-[var(--app-accent)]/5 transition-colors">
                                <td className="px-6 py-4 font-mono text-xs text-[var(--app-text-muted)]">{order.id}</td>
                                <td className="px-6 py-4 max-w-[250px] truncate" title={order.serviceName}>{order.serviceName}</td>
                                <td className="px-6 py-4 max-w-[150px] truncate text-blue-500 font-medium"><a href={order.link} target="_blank" rel="noreferrer" className="hover:underline">{order.link}</a></td>
                                <td className="px-6 py-4 font-black text-[var(--app-text)]">{CURRENCY_SYMBOL}{order.charge}</td>
                                <td className="px-6 py-4 font-medium">{order.quantity}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded text-[10px] font-bold border uppercase ${statusColors[order.status]}`}>
                                        {order.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const AddFundsSection = () => {
    const { user } = useAuth();
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const transactions = useStore('suh_transactions', fetchTransactions) as Transaction[];
    const userTransactions = useMemo(() => { if (!user) return []; return transactions.filter(t => t.userId === user.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10); }, [user, transactions]);
    
    const handleRazorpayPayment = async () => {
        if (!user || !amount || parseFloat(amount) < 1) { setNotification({ msg: "Please enter a valid amount (Min 1 INR)", type: 'error' }); return; }
        setLoading(true);
        try {
            const order = await createRazorpayOrder(parseFloat(amount), user.id);
            const options: any = { 
                key: RAZORPAY_KEY_ID, 
                amount: order.amount, 
                currency: order.currency, 
                name: RAZORPAY_MERCHANT_NAME, 
                description: "Add Funds to Wallet", 
                image: "https://picsum.photos/seed/socialuphub/200/200", 
                handler: async function (response: any) { 
                    try { 
                        setNotification({ msg: "Payment Verified! Adding funds...", type: 'success' }); 
                        await handleRazorpaySuccess(user.id, parseFloat(amount), response.razorpay_payment_id, response.razorpay_order_id, response.razorpay_signature); 
                        setNotification({ msg: `Successfully added ${CURRENCY_SYMBOL}${amount} to your wallet!`, type: 'success' }); 
                        setAmount(''); 
                    } catch (e: any) { 
                        setNotification({ msg: e.message, type: 'error' }); 
                    } finally { 
                        setLoading(false); 
                    } 
                }, 
                prefill: { 
                    name: user.name, 
                    email: user.email, 
                    // RAZORPAY FIX: Correctly use the user's mobile number from their profile.
                    contact: user.mobile || undefined 
                }, 
                theme: { color: "#22c55e" }, 
                modal: { ondismiss: function() { setLoading(false); } } 
            };
            if (order.id) { options.order_id = order.id; }
            const rzp1 = new Razorpay(options);
            rzp1.on('payment.failed', function (response: any){ setNotification({ msg: `Payment Failed: ${response.error.description}`, type: 'error' }); setLoading(false); });
            rzp1.open();
        } catch (e: any) { setNotification({ msg: e.message, type: 'error' }); setLoading(false); }
    };

    return (<div className="max-w-xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500 px-1 md:px-0">{notification && <Notification message={notification.msg} type={notification.type} onClose={() => setNotification(null)} />}<div className="text-center"><h2 className="text-2xl md:text-3xl font-black italic tracking-tighter text-[var(--app-text)]">ADD <span className="text-[var(--app-accent)]">FUNDS</span></h2><p className="text-[var(--app-text-muted)] text-xs md:text-sm mt-2">Instant deposit via Razorpay (UPI, Cards, Netbanking).</p></div><Card className="border-t-4 border-t-[var(--app-accent)] p-4 md:p-6"><div className="space-y-6"><div className="bg-[var(--app-accent)]/10 p-4 rounded-lg border border-[var(--app-accent)]/20 flex items-start gap-3"><ShieldCheck className="text-[var(--app-accent)] shrink-0 mt-1" /><div className="text-sm text-[var(--app-text-muted)]"><p className="font-bold text-[var(--app-text)] mb-1">Secure Payment Gateway</p><p>Your payment is processed securely by Razorpay. Funds are added instantly after success.</p></div></div><Input label="Amount (INR)" type="number" placeholder="e.g. 500" value={amount} onChange={e => setAmount(e.target.value)} /><Button onClick={handleRazorpayPayment} isLoading={loading} className="w-full neon-box bg-[var(--app-accent)] text-white hover:opacity-95" size="lg">Add Funds</Button><div className="flex justify-center gap-4 opacity-50 grayscale hover:grayscale-0 transition-all"><div className="text-[10px] md:text-xs text-[var(--app-text-muted)] text-center">Supported: UPI (GPay/PhonePe), Credit/Debit Cards, Netbanking</div></div></div></Card><div className="pt-8 border-t border-[var(--app-border)]"><h3 className="text-lg font-bold text-[var(--app-text)] mb-4 flex items-center gap-2"><Clock size={18} className="text-[var(--app-accent)]"/> Transaction History</h3><div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl overflow-hidden">{userTransactions.length > 0 ? (<table className="w-full text-left text-xs"><thead className="bg-[var(--app-bg)] text-[var(--app-text-muted)] uppercase font-bold"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">ID</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3 text-right">Status</th></tr></thead><tbody className="divide-y divide-[var(--app-border)]">{userTransactions.map(t => (<tr key={t.id} className="hover:bg-[var(--app-accent)]/5 transition-colors"><td className="px-4 py-3 text-[var(--app-text-muted)]">{new Date(t.date).toLocaleDateString()}</td><td className="px-4 py-3 font-mono text-[var(--app-text-muted)]">{t.paymentId || t.id.substring(0,8)}</td><td className={`px-4 py-3 font-bold ${t.type === 'DEPOSIT' || t.type === 'REFUND' || t.type === 'REFERRAL_PAYOUT' || t.type === 'REFERRAL_COMMISSION' ? 'text-[var(--app-accent)]' : 'text-[var(--app-text-muted)]'}`}>{t.type === 'DEPOSIT' || t.type === 'REFUND' || t.type === 'REFERRAL_PAYOUT' || t.type === 'REFERRAL_COMMISSION' ? '+' : '-'}{CURRENCY_SYMBOL}{t.amount}</td><td className="px-4 py-3 text-right"><Badge variant={t.status === 'SUCCESS' ? 'success' : t.status === 'FAILED' ? 'danger' : 'warning'}>{t.status}</Badge></td></tr>))}</tbody></table>) : (<div className="p-8 text-center text-[var(--app-text-muted)] text-sm">No transactions found yet.</div>)}{userTransactions.length > 0 && <div className="p-2 text-center text-[10px] text-[var(--app-text-muted)] bg-black/10">Showing last 10 transactions</div>}</div></div></div>);
};

const ProfileSection = () => {
    const { user } = useAuth();
    const [oldPass, setOldPass] = useState('');
    const [newPass, setNewPass] = useState('');
    const [notification, setNotification] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const handlePassUpdate = async () => { try { await updateUserPassword(oldPass, newPass); setNotification({ msg: "Password updated!", type: 'success' }); setOldPass(''); setNewPass(''); } catch (e: any) { setNotification({ msg: e.message, type: 'error' }); } };
    return (<div className="max-w-2xl mx-auto animate-in slide-in-from-bottom-4 duration-500 px-1 md:px-0">{notification && <Notification message={notification.msg} type={notification.type} onClose={() => setNotification(null)} />}<div className="flex flex-col md:flex-row items-center gap-6 mb-8 text-center md:text-left"><div className="w-20 h-20 bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-full flex items-center justify-center text-4xl font-bold text-[var(--app-accent)] shadow-[0_0_20px_rgba(46,189,89,0.2)]">{user?.name.charAt(0).toUpperCase()}</div><div><h2 className="text-2xl font-bold text-[var(--app-text)]">{user?.name}</h2><p className="text-[var(--app-text-muted)] text-sm">{user?.email}</p><div className="flex gap-2 mt-2 justify-center md:justify-start"><Badge variant="info">{user?.role}</Badge><Badge variant={user?.isBanned ? 'danger' : 'success'}>{user?.isBanned ? 'Banned' : 'Active'}</Badge></div></div></div><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Card className="p-4 md:p-6 bg-[var(--app-card-bg)] border border-[var(--app-border)]"><h3 className="text-lg font-bold text-[var(--app-text)] mb-4 flex items-center gap-2"><Lock size={18} className="text-[var(--app-accent)]"/> Security</h3><div className="space-y-4"><Input label="Current Password" type="password" value={oldPass} onChange={e => setOldPass(e.target.value)} /><Input label="New Password" type="password" value={newPass} onChange={e => setNewPass(e.target.value)} /><Button onClick={handlePassUpdate} className="w-full bg-[var(--app-accent)] hover:opacity-90 text-white">Update Password</Button></div></Card><Card className="p-4 md:p-6 bg-[var(--app-card-bg)] border border-[var(--app-border)]"><h3 className="text-lg font-bold text-[var(--app-text)] mb-4 flex items-center gap-2"><Wallet size={18} className="text-[var(--app-accent)]"/> Account Stats</h3><div className="space-y-4"><div className="flex justify-between p-3 bg-[var(--app-bg)] rounded border border-[var(--app-border)]"><span className="text-[var(--app-text-muted)] text-sm">Total Spent</span><span className="font-bold text-[var(--app-text)]">{CURRENCY_SYMBOL}{(user?.totalSpent || 0).toFixed(2)}</span></div><div className="flex justify-between p-3 bg-[var(--app-bg)] rounded border border-[var(--app-border)]"><span className="text-[var(--app-text-muted)] text-sm">Joined</span><span className="font-bold text-[var(--app-text)]">{new Date(user?.createdAt || '').toLocaleDateString()}</span></div></div></Card></div></div>);
};

const SupportSection = () => {
    const { user } = useAuth();
    const orders = useStore('suh_orders', fetchOrders) as Order[];
    const transactions = useStore('suh_transactions', fetchTransactions) as Transaction[];
    const generateWhatsappLink = () => { 
        if (!user) return CONTACT_WHATSAPP_URL; 
        const userOrders = orders.filter(o => o.userId === user.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()); 
        const userTxns = transactions.filter(t => t.userId === user.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()); 
        const lastOrder = userOrders[0]; 
        const lastTxn = userTxns[0]; 
        const msg = `Hello Support Team,\n\n*User Details:*\nName: ${user.name}\nEmail: ${user.email}\nBalance: ${CURRENCY_SYMBOL}${(user.balance || 0).toFixed(2)}\n\n*Recent Transaction:*\n${lastTxn ? `ID: ${lastTxn.id}\nAmount: ${CURRENCY_SYMBOL}${lastTxn.amount}\nDate: ${new Date(lastTxn.date).toLocaleString()}\nStatus: ${lastTxn.status}` : 'No recent transactions'}\n\n*Recent Order:*\n${lastOrder ? `ID: ${lastOrder.id}\nService: ${lastOrder.serviceName}\nCharge: ${CURRENCY_SYMBOL}${lastOrder.charge}\nStatus: ${lastOrder.status}` : 'No recent orders'}\n\n*Issue Description:*\n[Type your issue here]`; 
        return `https://wa.me/?text=${encodeURIComponent(msg)}`; 
    };
    return (<div className="max-w-xl mx-auto text-center space-y-6 animate-in slide-in-from-bottom-4 duration-500 px-1 md:px-0"><div className="mb-4"><h2 className="text-2xl md:text-3xl font-black italic tracking-tighter text-white">24/7 <span className="text-red-600 neon-text">SUPPORT</span></h2><p className="text-gray-400 text-xs md:text-sm mt-2">Need help? WhatsApp us directly with your account details pre-filled.</p></div><a href={generateWhatsappLink()} target="_blank" rel="noreferrer" className="block w-full bg-[#25D366]/10 border border-[#25D366]/30 hover:bg-[#25D366]/20 p-6 md:p-8 rounded-2xl transition-all group relative overflow-hidden"><div className="absolute inset-0 bg-[#25D366]/5 blur-xl group-hover:bg-[#25D366]/10 transition-all"></div><MessageCircle size={48} className="mx-auto mb-4 text-[#25D366] group-hover:scale-110 transition-transform relative z-10" /><h3 className="text-xl font-bold text-white mb-2 relative z-10">Chat on WhatsApp</h3><p className="text-sm text-gray-400 relative z-10 max-w-sm mx-auto">Click to open a support chat with your account details attached for faster resolution.</p></a><div className="bg-neutral-900/50 p-6 rounded-xl border border-white/5 text-left"><h4 className="font-bold text-white mb-4 flex items-center gap-2"><AlertTriangle size={18} className="text-yellow-500"/> FAQ</h4><div className="space-y-4 text-sm text-gray-400"><p><strong className="text-gray-300">Q: Order marked as completed but not delivered?</strong><br/>A: Please allow up to 24 hours. If stuck, use the button above.</p><p><strong className="text-gray-300">Q: Funds not reflected?</strong><br/>A: Send the transaction screenshot via WhatsApp.</p></div></div></div>);
};

export const Dashboard: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    
    const view = useMemo(() => {
        const path = location.pathname.split('/').pop() || 'dashboard';
        return path === 'dashboard' ? 'dashboard' : path;
    }, [location.pathname]);

    // On mobile, "dashboard" and "new-order" show the main ordering interface
    const currentView = () => {
        switch(view) {
            case 'dashboard': return <NewOrderSection />;
            case 'orders': return <OrdersSection />;
            case 'add-funds': return <AddFundsSection />;
            case 'profile': return <ProfileSection />;
            case 'support': return <SupportSection />;
            case 'referrals': return <ReferralSection />;
            default: return <NewOrderSection />;
        }
    };

    return (
        <div className="min-h-[80vh] pb-20 lg:pb-0">
            {/* Header Title (Desktop Only) */}
            <div className="hidden lg:flex mb-6 flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Logo iconOnly className="scale-75" />
                    <div>
                        <h1 className="text-xl md:text-2xl font-black italic tracking-tighter text-white uppercase">{view.replace('-', ' ')}</h1>
                        <p className="text-gray-500 text-xs font-mono">Welcome back, {user?.name}</p>
                    </div>
                </div>
                {view !== 'dashboard' && (
                    <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-400 hover:text-white flex items-center gap-1">
                        <ArrowDownLeft size={16}/> Back to Home
                    </button>
                )}
            </div>

            {currentView()}
        </div>
    );
};
