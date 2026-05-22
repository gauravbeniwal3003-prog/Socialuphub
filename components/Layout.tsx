
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, ShoppingCart, Wallet, History, User as UserIcon, 
  HelpCircle, Users, Menu, X, LogOut, ChevronRight, Home, List, Zap, 
  CreditCard, Globe, MessageCircle 
} from 'lucide-react';
import { useAuth } from '../App';
import { UserRole } from '../types';
import { CURRENCY_SYMBOL, CONTACT_WHATSAPP_URL } from '../constants';
import { Logo } from './ui/Logo';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleNav = (path: string) => {
    navigate(path);
    setIsDrawerOpen(false);
  };

  const isAdmin = user?.role === UserRole.ADMIN;

  // Drawer Items
  const drawerItems = [
    { icon: <Zap size={18} />, label: 'New Order', path: '/dashboard' },
    { icon: <List size={18} />, label: 'Orders', path: '/dashboard/orders' },
    { icon: <CreditCard size={18} />, label: 'Add Funds', path: '/dashboard/add-funds' },
    { icon: <Users size={18} />, label: 'Refer & Earn', path: '/dashboard/referrals' },
    { icon: <Globe size={18} />, label: 'Services', path: '/dashboard' }, // Placeholder
    { icon: <MessageCircle size={18} />, label: 'WhatsApp Support', action: () => window.open(CONTACT_WHATSAPP_URL, '_blank') },
    { icon: <LogOut size={18} />, label: 'Logout', action: logout },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#050505] text-gray-100 font-sans selection:bg-red-900 selection:text-white">
      
      {/* --- MOBILE TOP HEADER --- */}
      <div className="lg:hidden fixed top-0 w-full z-40 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/5 px-4 py-3 flex items-center justify-between shadow-lg">
         <Logo className="scale-90 origin-left" />
         <div className="flex items-center gap-3">
            <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer" className="text-green-500 hover:text-green-400 transition-colors">
              <MessageCircle size={24} />
            </a>
            <div className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 flex items-center gap-2">
               <span className="text-xs font-bold text-gray-400">Balance</span>
               <span className="text-sm font-black text-white">{CURRENCY_SYMBOL}{(user?.balance || 0).toFixed(2)}</span>
            </div>
         </div>
      </div>

      {/* --- DESKTOP SIDEBAR (Keep existing for large screens) --- */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-50 w-64 bg-neutral-900 border-r border-red-900/20 flex-col">
        <div className="p-6 flex items-center justify-center border-b border-white/5">
          <Logo />
        </div>
        <div className="p-6 flex-1 overflow-y-auto">
          {!isAdmin && (
            <div className="bg-gradient-to-br from-red-900/20 to-black border border-red-900/30 rounded-xl p-4 mb-6 relative overflow-hidden group">
              <p className="text-xs text-gray-400 mb-1 relative z-10">Available Balance</p>
              <h2 className="text-2xl font-bold text-white relative z-10 neon-text">{CURRENCY_SYMBOL} {(user?.balance || 0).toFixed(2)}</h2>
            </div>
          )}
          <nav className="space-y-1">
            {[
              { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/dashboard' },
              { icon: <ShoppingCart size={20} />, label: 'New Order', path: '/dashboard' },
              { icon: <History size={20} />, label: 'Orders', path: '/dashboard/orders' },
              { icon: <Wallet size={20} />, label: 'Add Funds', path: '/dashboard/add-funds' },
              { icon: <Users size={20} />, label: 'Refer & Earn', path: '/dashboard/referrals' },
              { icon: <UserIcon size={20} />, label: 'Profile', path: '/dashboard/profile' },
              { icon: <HelpCircle size={20} />, label: 'Support', path: '/dashboard/support' },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => handleNav(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all rounded-lg ${location.pathname === item.path ? 'text-white bg-red-600/10 border-r-2 border-red-600' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="p-4 border-t border-white/5">
          <button onClick={logout} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* --- SIDE MENU DRAWER (Mobile) --- */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsDrawerOpen(false)}></div>
          <div className="absolute top-0 bottom-0 left-0 w-[75%] max-w-xs bg-[#0a0a0a] border-r border-neutral-800 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
             <div className="p-6 border-b border-neutral-800 flex justify-between items-center">
                <span className="text-xl font-black italic text-white">MENU</span>
                <button onClick={() => setIsDrawerOpen(false)} className="text-gray-400"><X size={24}/></button>
             </div>
             <div className="p-4 flex-1 overflow-y-auto space-y-1">
                {drawerItems.map((item, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => { if(item.action) item.action(); else handleNav(item.path!); }}
                    className="w-full flex items-center justify-between p-3 text-gray-300 hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-red-500">{item.icon}</span>
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <ChevronRight size={16} className="text-neutral-600"/>
                  </button>
                ))}
             </div>
             <div className="p-4 border-t border-neutral-800">
                <div className="flex items-center gap-3 p-3 bg-neutral-900 rounded-lg">
                   <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white font-bold text-lg">
                      {user?.name.charAt(0).toUpperCase()}
                   </div>
                   <div className="overflow-hidden">
                      <p className="text-white font-bold truncate">{user?.name}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 lg:ml-64 pt-16 pb-24 lg:py-8 min-h-screen bg-[#050505] overflow-x-hidden">
        <div className="max-w-5xl mx-auto p-4 lg:p-8 animate-in fade-in duration-500">
          {children}
        </div>
      </main>

      {/* --- MOBILE BOTTOM NAVIGATION --- */}
      <div className="lg:hidden fixed bottom-0 w-full z-40 bg-[#0a0a0a] border-t border-neutral-800 pb-safe">
        <div className="flex justify-between items-center px-2">
           <button onClick={() => setIsDrawerOpen(true)} className="flex flex-col items-center gap-1 p-3 text-gray-500 hover:text-white">
              <Menu size={20} />
              <span className="text-[10px] font-medium">Menu</span>
           </button>
           
           <button onClick={() => handleNav('/dashboard/orders')} className={`flex flex-col items-center gap-1 p-3 ${location.pathname === '/dashboard/orders' ? 'text-red-500' : 'text-gray-500 hover:text-white'}`}>
              <List size={20} />
              <span className="text-[10px] font-medium">Orders</span>
           </button>

           <div className="relative -top-5">
              <button 
                onClick={() => handleNav('/dashboard')} 
                className="w-14 h-14 rounded-full bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.5)] flex items-center justify-center transform active:scale-95 transition-all border-4 border-[#050505]"
              >
                 <span className="text-2xl font-light mb-1">+</span>
              </button>
           </div>

           <button onClick={() => handleNav('/dashboard/add-funds')} className={`flex flex-col items-center gap-1 p-3 ${location.pathname === '/dashboard/add-funds' ? 'text-red-500' : 'text-gray-500 hover:text-white'}`}>
              <Wallet size={20} />
              <span className="text-[10px] font-medium">Add Funds</span>
           </button>

           <button onClick={() => handleNav('/dashboard/profile')} className={`flex flex-col items-center gap-1 p-3 ${location.pathname === '/dashboard/profile' ? 'text-red-500' : 'text-gray-500 hover:text-white'}`}>
              <UserIcon size={20} />
              <span className="text-[10px] font-medium">Account</span>
           </button>
        </div>
      </div>

    </div>
  );
};

export default Layout;
