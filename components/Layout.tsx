
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, ShoppingCart, Wallet, History, User as UserIcon, 
  HelpCircle, Users, Menu, X, LogOut, ChevronRight, Home, List, Zap, 
  CreditCard, Globe, MessageCircle, Sun, Moon, Code, BarChart3, ShoppingBag, FolderPlus, Tag, Settings
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

  // Dynamic Theme state and listener
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('theme-mode') === 'dark';
  });

  useEffect(() => {
    const handleThemeToggle = () => {
      setIsDark(localStorage.getItem('theme-mode') === 'dark');
    };
    window.addEventListener('theme-changed', handleThemeToggle);
    return () => window.removeEventListener('theme-changed', handleThemeToggle);
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    localStorage.setItem('theme-mode', nextDark ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { isDark: nextDark } }));
  };

  const handleNav = (path: string) => {
    navigate(path);
    setIsDrawerOpen(false);
  };

  const isAdmin = user?.role === UserRole.ADMIN;

  // Drawer Items dynamically chosen based on role
  const drawerItems = isAdmin ? [
    { icon: <BarChart3 size={18} />, label: 'Admin Home', path: '/admin/dashboard' },
    { icon: <Users size={18} />, label: 'Users', path: '/admin/users' },
    { icon: <ShoppingBag size={18} />, label: 'Orders', path: '/admin/orders' },
    { icon: <List size={18} />, label: 'Services', path: '/admin/services' },
    { icon: <FolderPlus size={18} />, label: 'Categories', path: '/admin/categories' },
    { icon: <Tag size={18} />, label: 'Coupons', path: '/admin/coupons' },
    { icon: <Settings size={18} />, label: 'Settings', path: '/admin/settings' },
    { icon: <Code size={18} />, label: 'APIs', path: '/admin/api' },
    { icon: <LogOut size={18} />, label: 'Logout', action: logout },
  ] : [
    { icon: <Zap size={18} />, label: 'New Order', path: '/dashboard' },
    { icon: <List size={18} />, label: 'Orders', path: '/dashboard/orders' },
    { icon: <CreditCard size={18} />, label: 'Add Funds', path: '/dashboard/add-funds' },
    { icon: <Users size={18} />, label: 'Refer & Earn', path: '/dashboard/referrals' },
    { icon: <Code size={18} />, label: 'API Developer', path: '/dashboard/api' },
    { icon: <MessageCircle size={18} />, label: 'WhatsApp Support', action: () => window.open(CONTACT_WHATSAPP_URL, '_blank') },
    { icon: <LogOut size={18} />, label: 'Logout', action: logout },
  ];

  const sidebarItems = isAdmin ? [
    { icon: <BarChart3 size={20} />, label: 'Admin Home', path: '/admin/dashboard' },
    { icon: <Users size={20} />, label: 'Users', path: '/admin/users' },
    { icon: <ShoppingBag size={20} />, label: 'Orders', path: '/admin/orders' },
    { icon: <List size={20} />, label: 'Services', path: '/admin/services' },
    { icon: <FolderPlus size={20} />, label: 'Categories', path: '/admin/categories' },
    { icon: <Tag size={20} />, label: 'Coupons', path: '/admin/coupons' },
    { icon: <Settings size={20} />, label: 'Settings', path: '/admin/settings' },
    { icon: <Code size={20} />, label: 'APIs', path: '/admin/api' },
  ] : [
    { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/dashboard' },
    { icon: <Zap size={20} />, label: 'New Order', path: '/dashboard' },
    { icon: <History size={20} />, label: 'Orders', path: '/dashboard/orders' },
    { icon: <Wallet size={20} />, label: 'Add Funds', path: '/dashboard/add-funds' },
    { icon: <Users size={20} />, label: 'Refer & Earn', path: '/dashboard/referrals' },
    { icon: <Code size={20} />, label: 'API Developer', path: '/dashboard/api' },
    { icon: <UserIcon size={20} />, label: 'Profile', path: '/dashboard/profile' },
    { icon: <HelpCircle size={20} />, label: 'Support', path: '/dashboard/support' },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[var(--app-bg)] text-[var(--app-text)] font-sans selection:bg-[var(--app-accent)]/30 selection:text-[var(--app-text)]">
      
      {/* --- MOBILE TOP HEADER --- */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[var(--app-sidebar-bg)]/95 backdrop-blur-md border-b border-[var(--app-border)] px-3 py-2.5 flex items-center justify-between shadow-lg">
         <div className="flex items-center gap-2">
           {isAdmin && (
             <button onClick={() => setIsDrawerOpen(true)} className="text-[var(--app-text)] hover:opacity-80 p-1 rounded-lg">
               <Menu size={20} />
             </button>
           )}
           <Logo className="scale-80 sm:scale-90 origin-left shrink-0" />
         </div>
         <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <button 
              onClick={toggleTheme} 
              className="text-[var(--app-accent)] hover:opacity-80 transition-opacity p-1.5 sm:p-2 rounded-lg bg-[var(--app-accent)]/10 focus:outline-none shrink-0"
              title="Toggle Theme"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer" className="text-green-500 hover:text-green-400 transition-colors shrink-0">
              <MessageCircle size={20} className="sm:w-6 sm:h-6" />
            </a>
            <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-full px-2.5 py-1 flex items-center gap-1 shrink-0 shadow-sm">
               <span className="text-[10px] font-bold text-[var(--app-text-muted)] hidden sm:inline uppercase tracking-wider">{isAdmin ? "Admin" : "Balance"}</span>
               <span className="text-xs sm:text-sm font-black text-[var(--app-text)] font-mono">
                 {isAdmin ? "🛡️" : `${CURRENCY_SYMBOL}${(user?.balance || 0).toFixed(2)}`}
               </span>
            </div>
         </div>
      </div>

      {/* --- DESKTOP SIDEBAR --- */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-50 w-64 bg-[var(--app-sidebar-bg)] border-r border-[var(--app-border)] flex-col">
        <div className="p-6 flex items-center justify-between border-b border-[var(--app-border)]">
          <Logo />
          <button 
            onClick={toggleTheme} 
            className="text-[var(--app-accent)] hover:opacity-80 transition-opacity p-2 rounded-lg bg-[var(--app-accent)]/10 focus:outline-none"
            title="Toggle Theme"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
        <div className="p-6 flex-1 overflow-y-auto">
          {!isAdmin && (
            <div className="bg-gradient-to-br from-[var(--app-accent)]/10 to-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl p-4 mb-6 relative overflow-hidden group">
              <p className="text-xs text-[var(--app-text-muted)] mb-1 relative z-10">Available Balance</p>
              <h2 className="text-2xl font-bold text-[var(--app-text)] relative z-10">{CURRENCY_SYMBOL} {(user?.balance || 0).toFixed(2)}</h2>
            </div>
          )}
          <nav className="space-y-1">
            {sidebarItems.map((item) => (
              <button
                key={item.label}
                onClick={() => handleNav(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all rounded-lg ${
                  location.pathname === item.path || (item.path === '/admin/dashboard' && location.pathname === '/admin')
                    ? 'text-[var(--app-text)] bg-[var(--app-accent)]/10 border-r-2 border-[var(--app-accent)] font-bold' 
                    : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-accent)]/5'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="p-4 border-t border-[var(--app-border)]">
          <button onClick={logout} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-accent)]/5 rounded-lg transition-colors">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* --- SIDE MENU DRAWER (Mobile) --- */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={() => setIsDrawerOpen(false)}></div>
          <div className="absolute top-0 bottom-0 left-0 w-[75%] max-w-xs bg-[var(--app-sidebar-bg)] border-r border-[var(--app-border)] shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
             <div className="p-6 border-b border-[var(--app-border)] flex justify-between items-center animate-pulse">
                <span className="text-xl font-black italic text-[var(--app-text)]">MENU</span>
                <button onClick={() => setIsDrawerOpen(false)} className="text-[var(--app-text-muted)]"><X size={24}/></button>
             </div>
             <div className="p-4 flex-1 overflow-y-auto space-y-1">
                {drawerItems.map((item, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => { if(item.action) item.action(); else handleNav(item.path!); }}
                    className="w-full flex items-center justify-between p-3 text-[var(--app-text-muted)] hover:bg-[var(--app-accent)]/5 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[var(--app-accent)]">{item.icon}</span>
                      <span className="font-medium text-[var(--app-text)]">{item.label}</span>
                    </div>
                    <ChevronRight size={16} className="text-[var(--app-text-muted)]"/>
                  </button>
                ))}
             </div>
             <div className="p-4 border-t border-[var(--app-border)]">
                <div className="flex items-center gap-3 p-3 bg-[var(--app-card-bg)] rounded-lg border border-[var(--app-border)]">
                   <div className="w-10 h-10 rounded-full bg-[var(--app-accent)] flex items-center justify-center text-white font-bold text-lg">
                      {user?.name.charAt(0).toUpperCase()}
                   </div>
                   <div className="overflow-hidden">
                      <p className="text-[var(--app-text)] font-bold truncate">{user?.name}</p>
                      <p className="text-xs text-[var(--app-text-muted)] truncate">{user?.email}</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 lg:ml-64 pt-16 pb-24 lg:py-8 min-h-screen bg-[var(--app-bg)] overflow-x-hidden">
        <div className="max-w-5xl mx-auto p-4 lg:p-8 animate-in fade-in duration-500">
          {children}
        </div>
      </main>

      {/* --- MOBILE BOTTOM NAVIGATION --- */}
      {!isAdmin && (
        <div className="lg:hidden fixed bottom-0 w-full z-40 bg-[var(--app-sidebar-bg)] border-t border-[var(--app-border)] pb-safe shadow-lg">
          <div className="flex justify-between items-center px-2">
             <button onClick={() => setIsDrawerOpen(true)} className="flex flex-col items-center gap-1 p-3 text-[var(--app-text-muted)] hover:text-[var(--app-text)]">
                <Menu size={20} />
                <span className="text-[10px] font-medium">Menu</span>
             </button>
             
             <button onClick={() => handleNav('/dashboard/orders')} className={`flex flex-col items-center gap-1 p-3 ${location.pathname === '/dashboard/orders' ? 'text-[var(--app-accent)] font-bold' : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'}`}>
                <List size={20} />
                <span className="text-[10px] font-medium">Orders</span>
             </button>

             <div className="relative -top-5">
                <button 
                  onClick={() => handleNav('/dashboard')} 
                  className="w-14 h-14 rounded-full bg-[var(--app-accent)] text-white shadow-[0_0_20px_rgba(34,197,94,0.4)] flex items-center justify-center transform active:scale-95 transition-all border-4 border-[var(--app-bg)]"
                >
                   <span className="text-2xl font-light mb-1">+</span>
                </button>
             </div>

             <button onClick={() => handleNav('/dashboard/add-funds')} className={`flex flex-col items-center gap-1 p-3 ${location.pathname === '/dashboard/add-funds' ? 'text-[var(--app-accent)] font-bold' : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'}`}>
                <Wallet size={20} />
                <span className="text-[10px] font-medium">Add Funds</span>
             </button>

             <button onClick={() => handleNav('/dashboard/profile')} className={`flex flex-col items-center gap-1 p-3 ${location.pathname === '/dashboard/profile' ? 'text-[var(--app-accent)] font-bold' : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'}`}>
                <UserIcon size={20} />
                <span className="text-[10px] font-medium">Account</span>
             </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default Layout;

