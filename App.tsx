
import React, { createContext, useContext, useState, useEffect } from 'react';
import Layout from './components/Layout';
import LandingPage from './components/landing/LandingPage';
import { Dashboard } from './components/dashboard/Dashboard';
import { AdminPanel } from './components/admin/AdminPanel';
import { User, UserRole } from './types';
import { supabase } from './services/supabase'; // Using Supabase Auth
import { createUserDoc, checkUsernameUnique, startAutoSync, checkMobileUnique, getEmailByMobile, getConfig, useStore } from './services/mockStore';
import { ShieldAlert, Clock, LogOut, Wrench } from 'lucide-react';
import { Logo } from './components/ui/Logo';

interface AuthContextType {
  user: User | null;
  login: (identifier: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (email: string, pass: string, name: string, mobile: string, refCode?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
export const useAuth = () => useContext(AuthContext);

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'LANDING' | 'DASHBOARD' | 'AUTH' | 'BANNED' | 'MAINTENANCE'>('LANDING');
  const [authLoading, setAuthLoading] = useState(true);
  const [banTimeRemaining, setBanTimeRemaining] = useState<string>('');
  
  // Load Config for Maintenance Mode Check
  const config = useStore('suh_config', getConfig);

  const checkBanStatus = (userData: User) => {
      if (userData.isBanned) {
          if (!userData.banExpires) return 'PERMANENT';
          if (Date.now() < new Date(userData.banExpires).getTime()) return 'TEMP';
      }
      return 'ALLOWED';
  };

  useEffect(() => {
    // Check maintenance mode on config change or user change
    if (config?.maintenanceMode) {
        if (!user || user.role !== UserRole.ADMIN) {
            setView('MAINTENANCE');
            return;
        }
    }
    
    if (user && view === 'MAINTENANCE' && user.role === UserRole.ADMIN) {
        setView('DASHBOARD');
    }
  }, [config, user, view]);

  useEffect(() => {
    if (user) {
        // AUTOMATION: Run background processes (Order status, Forwarding) from user device
        // This ensures orders are processed without a dedicated autonomous server loop.
        const stopSync = startAutoSync();
        return () => stopSync();
    }
  }, [user]);

  // Real-time User Data Subscription (Public Table)
  useEffect(() => {
      if (!user?.id) return;
      
      const channel = supabase.channel(`realtime_user_${user.id}`)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` }, (payload) => {
              setUser(current => current ? { ...current, ...payload.new as User } : null);
          })
          .subscribe();
      
      const handleForceUpdate = (e: any) => {
          if (e.detail?.balance !== undefined) {
              setUser(prev => prev ? { ...prev, balance: e.detail.balance } : null);
          }
      };
      
      window.addEventListener('force_balance_update', handleForceUpdate);

      return () => { 
          supabase.removeChannel(channel); 
          window.removeEventListener('force_balance_update', handleForceUpdate);
      };
  }, [user?.id]);

  useEffect(() => {
      let interval: any;
      if (view === 'BANNED' && user?.banExpires) {
          interval = setInterval(() => {
              const diff = new Date(user.banExpires!).getTime() - Date.now();
              if (diff <= 0) { clearInterval(interval); setView('DASHBOARD'); return; }
              const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
              const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
              setBanTimeRemaining(`${h}h ${m}m`);
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [view, user]);

  // Handle Supabase Auth Session
  const handleSession = async (session: any) => {
      if (session?.user) {
          const { data: userData } = await supabase
              .from('users')
              .select('*')
              .eq('id', session.user.id)
              .single();

          if (userData) {
               const banStatus = checkBanStatus(userData);
               setUser({ ...userData, id: session.user.id });
               if (banStatus !== 'ALLOWED') setView('BANNED');
               else if (view === 'AUTH' || view === 'LANDING') setView('DASHBOARD');
               
               const lastLoginKey = `last_login_${session.user.id}`;
               const lastUpdate = localStorage.getItem(lastLoginKey);
               if (!lastUpdate || Date.now() - parseInt(lastUpdate) > 1000 * 60 * 60) {
                   await supabase.from('users').update({ lastLogin: new Date().toISOString() }).eq('id', session.user.id);
                   localStorage.setItem(lastLoginKey, Date.now().toString());
               }

          } else {
               // Fallback: If trigger failed or user doesn't exist yet, try client-side creation
               console.warn("Syncing Supabase User (Fallback)...");
               try {
                  const fallbackName = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || "User";
                  const fallbackMobile = session.user.user_metadata?.phone || ""; 
                  
                  await createUserDoc(session.user.id, session.user.email || "", fallbackName, fallbackMobile); 
                  
                  // Small delay to ensure DB consistency
                  await new Promise(r => setTimeout(r, 500)); 

                  // Re-fetch created user to update state correctly
                   const { data: newUserData } = await supabase.from('users').select('*').eq('id', session.user.id).single();
                   if (newUserData) {
                       setUser(newUserData);
                       setView('DASHBOARD');
                   }
               } catch (e: any) {
                  console.error("Failed to sync user:", e.message || JSON.stringify(e));
                  await supabase.auth.signOut();
                  setUser(null);
                  setView('LANDING');
               }
          }
      } else {
          setUser(null);
          setView('LANDING');
      }
      setAuthLoading(false);
  };

  useEffect(() => {
    // 1. Handle OAuth Popup Callback (if this is the popup window)
    const isPopup = window.opener && window.opener !== window;
    const hasAuthParams = window.location.hash.includes('access_token') || 
                         window.location.search.includes('code=') ||
                         window.location.search.includes('error=');
    
    if (isPopup && hasAuthParams) {
      // Send message to the opener and close the popup
      // We use '*' for the target origin here because the popup and opener 
      // are on the same domain, but this ensures it works in both dev and prod.
      setTimeout(() => {
        if (window.opener) {
          window.opener.postMessage({ type: 'SUPABASE_AUTH_CALLBACK' }, '*');
          window.close();
        }
      }, 1000);
      return;
    }

    // 2. Listen for messages from the popup
    const handleMessage = (event: MessageEvent) => {
      // Security: Ensure the message comes from our own domain
      if (event.origin !== window.location.origin) return;
      
      if (event.data?.type === 'SUPABASE_AUTH_CALLBACK') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) handleSession(session);
        });
      }
    };
    window.addEventListener('message', handleMessage);

    // 3. Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
        handleSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        handleSession(session);
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const login = async (identifier: string, pass: string) => {
    let email = identifier;
    const isMobile = /^\d{10}$/.test(identifier);

    if (isMobile) {
        const foundEmail = await getEmailByMobile(identifier);
        if (!foundEmail) throw new Error("Mobile number not registered.");
        email = foundEmail;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) throw new Error(error.message);
  };

  const loginWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: true,
      }
    });
    
    if (error) throw new Error(error.message);
    
    if (data?.url) {
      // Open in a popup to avoid iframe redirect issues (bad_oauth_state)
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      window.open(
        data.url, 
        'supabase-auth', 
        `width=${width},height=${height},left=${left},top=${top}`
      );
    }
  };

  const register = async (email: string, pass: string, name: string, mobile: string, refCode?: string) => {
    if (!/^\d{10}$/.test(mobile)) throw new Error("Please enter a valid 10-digit mobile number.");
    
    // Check uniqueness client-side first to avoid DB error spam
    if (!(await checkUsernameUnique(name))) throw new Error("Username already taken. Please choose another.");
    if (!(await checkMobileUnique(mobile))) throw new Error("Mobile number already registered. Try logging in.");
    
    // Pass metadata so the DB Trigger can populate fields immediately
    const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
            data: { 
                full_name: name, 
                phone: mobile,
                referrer_code: refCode ? refCode.toUpperCase() : null
            }
        }
    });

    if (error) throw new Error(error.message);
    
    if (data.user && !data.session) {
        throw new Error("Registration successful, but 'Confirm Email' is enabled in Supabase settings. Please disable it to allow instant login.");
    }

    // Trigger should handle creation, but we call this to ensure client state is consistent
    if (data.user) {
        await createUserDoc(data.user.id, email, name, mobile, refCode);
    }
  };

  const logout = async () => { 
      await supabase.auth.signOut(); 
      setView('LANDING'); 
  };

  const AuthModal = () => {
    const [identifier, setIdentifier] = useState(''); 
    const [email, setEmail] = useState('');
    const [pass, setPass] = useState('');
    const [name, setName] = useState('');
    const [mobile, setMobile] = useState('');
    const [refCode, setRefCode] = useState(''); // New State for Referral Code
    const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [hp, setHp] = useState(''); // Honeypot field
    const [startTime] = useState(Date.now()); // Track form load time

    // Auto-fill referral code from URL hash
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.includes('?ref=')) {
            const code = hash.split('?ref=')[1];
            if (code) {
                setRefCode(code);
                setMode('REGISTER');
            }
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault(); 
      
      // BOT DETECTION
      if (hp) return; // Honeypot filled
      if (Date.now() - startTime < 2000) {
          setError("Please wait a moment before submitting.");
          return;
      }

      setError(''); setLoading(true);
      try { 
          if (mode === 'REGISTER') {
              await register(email, pass, name, mobile, refCode);
          } else {
              await login(identifier, pass);
          }
      } catch (err: any) { 
          setError(err.message); 
      } finally { 
          setLoading(false); 
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
        <div className="bg-neutral-900 border border-red-900/50 p-8 rounded-2xl w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button onClick={() => setView('LANDING')} className="absolute top-4 right-4 text-gray-500 hover:text-white">✕</button>
            <div className="flex justify-center mb-6">
                <Logo />
            </div>
            <h2 className="text-2xl font-bold mb-6 text-center">{mode === 'LOGIN' ? 'Welcome Back' : 'Create Account'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
               {/* Honeypot field (hidden from users) */}
               <div className="hidden" aria-hidden="true">
                   <input type="text" value={hp} onChange={e => setHp(e.target.value)} tabIndex={-1} autoComplete="off" />
               </div>
               {mode === 'REGISTER' && (
                   <>
                       <input className="w-full bg-neutral-800 border border-neutral-700 rounded p-3 text-white focus:border-red-600 outline-none" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} required />
                       <input className="w-full bg-neutral-800 border border-neutral-700 rounded p-3 text-white focus:border-red-600 outline-none" placeholder="Mobile Number (10 Digits)" value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} required />
                       <input className="w-full bg-neutral-800 border border-neutral-700 rounded p-3 text-white focus:border-red-600 outline-none" placeholder="Email Address" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                       {/* Referral Input */}
                       <input className="w-full bg-neutral-800 border border-neutral-700 rounded p-3 text-white focus:border-red-600 outline-none" placeholder="Referral Code (Optional)" value={refCode} onChange={e => setRefCode(e.target.value)} />
                   </>
               )}
               {mode === 'LOGIN' && (
                   <input className="w-full bg-neutral-800 border border-neutral-700 rounded p-3 text-white focus:border-red-600 outline-none" placeholder="Email or Mobile Number" value={identifier} onChange={e => setIdentifier(e.target.value)} required />
               )}
               <input className="w-full bg-neutral-800 border border-neutral-700 rounded p-3 text-white focus:border-red-600 outline-none" placeholder="Password" type="password" value={pass} onChange={e => setPass(e.target.value)} required />
               {error && <div className="text-red-500 text-xs bg-red-900/10 p-2 rounded border border-red-900/30 text-center font-bold">{error}</div>}
               <button disabled={loading} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-3 rounded transition-all shadow-[0_0_15px_rgba(220,38,38,0.5)]">{loading ? 'Processing...' : (mode === 'LOGIN' ? 'Login' : 'Register')}</button>
            </form>

            <div className="mt-6 relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-800"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-neutral-900 px-2 text-gray-500">Or continue with</span></div>
            </div>

            <button 
                onClick={loginWithGoogle}
                disabled={loading}
                className="w-full mt-4 flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-black font-bold py-3 rounded transition-all"
            >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" referrerPolicy="no-referrer" />
                Google
            </button>

            <p className="text-center mt-4 text-gray-400 text-sm cursor-pointer hover:text-white" onClick={() => setMode(mode === 'LOGIN' ? 'REGISTER' : 'LOGIN')}>{mode === 'LOGIN' ? "Don't have an account? Register" : "Already have an account? Login"}</p>
        </div>
      </div>
    );
  };

  const BannedScreen = () => (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-red-900/20 border border-red-600 p-8 rounded-2xl max-w-md w-full shadow-[0_0_50px_rgba(220,38,38,0.3)] animate-in zoom-in">
              <ShieldAlert className="w-20 h-20 text-red-600 mx-auto mb-6" />
              <h1 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">{!user?.banExpires ? 'ACCOUNT BLOCKED' : 'TEMPORARY BAN'}</h1>
              <p className="text-red-300 font-medium mb-6">{user?.banReason || "Suspicious activity detected."}</p>
              {user?.banExpires && <div className="bg-black/50 p-4 rounded-xl border border-red-900/50 mb-6"><p className="text-gray-500 text-xs uppercase font-bold mb-2">Access Restored In</p><div className="text-4xl font-mono font-bold text-white flex items-center justify-center gap-3"><Clock className="text-red-500 animate-pulse" />{banTimeRemaining || "Loading..."}</div></div>}
              <button onClick={logout} className="w-full flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white py-3 rounded-lg font-bold transition-colors"><LogOut size={18} /> Sign Out</button>
          </div>
      </div>
  );

  const MaintenanceScreen = () => (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center selection:bg-red-600 selection:text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/20 via-black to-black z-0"></div>
          <div className="relative z-10 animate-in fade-in zoom-in duration-500">
              <div className="w-24 h-24 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-8 border border-red-900/50 shadow-[0_0_30px_rgba(220,38,38,0.4)] animate-pulse">
                  <Wrench size={48} className="text-red-500" />
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-6 leading-tight italic">
                <span className="shimmer-text-white">UNDER</span> <br/>
                <span className="shimmer-text-red neon-text">MAINTENANCE</span>
              </h1>
              <p className="text-gray-400 text-base md:text-xl max-w-xl mx-auto mb-10 font-light">
                  We are upgrading our servers to provide you with faster services. We will be back shortly.
              </p>
              <div className="text-sm text-gray-600 font-mono">SOCIAL UP HUB</div>
              {/* Admin Bypass Link (Hidden/Subtle) */}
              <button onClick={() => setView('AUTH')} className="mt-20 text-[10px] text-gray-800 hover:text-gray-600">Admin Access</button>
          </div>
      </div>
  );

  const CurrentView = () => {
    if (view === 'MAINTENANCE') return <MaintenanceScreen />;
    if (view === 'LANDING') return <LandingPage onGetStarted={() => setView('AUTH')} />;
    if (view === 'AUTH') return <><LandingPage onGetStarted={() => {}} /><AuthModal /></>;
    if (view === 'BANNED') return <BannedScreen />;
    return <Layout>{user?.role === UserRole.ADMIN ? <AdminPanel /> : <Dashboard />}</Layout>;
  };

  return <AuthContext.Provider value={{ user, login, loginWithGoogle, register, logout }}><CurrentView /></AuthContext.Provider>;
};
export default App;
