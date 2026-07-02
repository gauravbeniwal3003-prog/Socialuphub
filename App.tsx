
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import LandingPage from './components/landing/LandingPage';
import { Dashboard } from './components/dashboard/Dashboard';
import { AdminPanel } from './components/admin/AdminPanel';
import { User, UserRole, GlobalConfig } from './types';
import { supabase } from './services/supabase'; // Using Supabase Auth
import { createUserDoc, checkUsernameUnique, startAutoSync, checkMobileUnique, getEmailByMobile, getConfig, useStore } from './services/mockStore';
import { ShieldAlert, Clock, LogOut, Wrench, AlertCircle, ChevronDown, ChevronUp, Terminal, AlertTriangle, HelpCircle, RefreshCw } from 'lucide-react';
import { Logo } from './components/ui/Logo';

const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

interface DynamicThemeProps {
  config: GlobalConfig | null;
}

const DynamicTheme: React.FC<DynamicThemeProps> = () => {
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('theme-mode') === 'dark';
  });

  useEffect(() => {
    const handleThemeToggle = (e: any) => {
      setIsDark(e.detail?.isDark);
    };
    window.addEventListener('theme-changed', handleThemeToggle);
    return () => window.removeEventListener('theme-changed', handleThemeToggle);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  const bg = isDark ? '#0a110c' : '#ffffff';
  const accent = '#2ebd59';
  const accentHover = '#24a14a';
  
  const text = isDark ? '#e2ece5' : '#0f1711';
  const textMuted = isDark ? '#8fa896' : '#4a574d';
  const border = isDark ? '#1b2a1f' : '#e2ece5';
  const cardBg = isDark ? '#101913' : '#ffffff';
  const sidebarBg = isDark ? '#0a110c' : '#f3faf5';
  const inputBg = isDark ? '#0d1710' : '#ebf7ed';

  return (
    <style>{`
      :root {
        --app-bg: ${bg};
        --app-card-bg: ${cardBg};
        --app-accent: ${accent};
        --app-accent-hover: ${accentHover};
        --app-text: ${text};
        --app-text-muted: ${textMuted};
        --app-border: ${border};
        --app-sidebar-bg: ${sidebarBg};
        --app-input-bg: ${inputBg};
      }
    `}</style>
  );
};

interface AuthContextType {
  user: User | null;
  login: (identifier: string, pass: string) => Promise<void>;
  loginWithGoogle: (refCode?: string) => Promise<void>;
  register: (email: string, pass: string, name: string, mobile: string, refCode?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
export const useAuth = () => useContext(AuthContext);

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [view, setView] = useState<'LANDING' | 'DASHBOARD' | 'AUTH' | 'BANNED' | 'MAINTENANCE'>('LANDING');
  const [authLoading, setAuthLoading] = useState(true);
  const [banTimeRemaining, setBanTimeRemaining] = useState<string>('');

  // Scroll to top of viewport on any view or route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view]);

  // Capture referral code from URL and persist in localStorage so it is remembered
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref') || params.get('referral');
    if (ref) {
      localStorage.setItem('pending_ref_code', ref.toUpperCase());
    }
  }, []);
  
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
        // Automation is handled securely and automatically server-side.
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
          try {
              // Retrieve pending referral code from localStorage
              const referredByCode = localStorage.getItem('pending_ref_code') || '';
              const fallbackName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || "User";
              const fallbackMobile = session.user.user_metadata?.phone || "";

              // Sync user on the backend safely bypassing client-side RLS policies and race conditions
              const getActiveBackendUrl = () => {
                  if (config?.renderBackendUrl?.trim()) {
                      return config.renderBackendUrl.trim();
                  }
                  const origin = window.location.origin.toLowerCase();
                  if (origin.includes('socialuphub.in') || origin.includes('socialuphub-smm.web.app')) {
                      return 'https://socialuphub-backend.onrender.com';
                  }
                  return window.location.origin;
              };
              const backendBase = getActiveBackendUrl();
              const syncUrl = `${backendBase.replace(/\/$/, "")}/api/sync-user`;
              const response = await fetch(syncUrl, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${session.access_token}`
                  },
                  body: JSON.stringify({
                      name: fallbackName,
                      mobile: fallbackMobile,
                      referredByCode
                  })
              });

              if (!response.ok) {
                  const errData = await response.json().catch(() => ({}));
                  throw new Error(errData.error || `HTTP ${response.status}`);
              }

              const data = await response.json();
              if (data?.user) {
                  // If successfully synced, remove referral code from localStorage
                  localStorage.removeItem('pending_ref_code');
                  setSyncError(null);
                  
                  const banStatus = checkBanStatus(data.user);
                  setUser({ ...data.user, id: session.user.id });
                  if (banStatus !== 'ALLOWED') setView('BANNED');
                  else if (view === 'AUTH' || view === 'LANDING') setView('DASHBOARD');
              } else {
                  throw new Error("No user profile returned from sync API.");
              }
          } catch (e: any) {
              console.warn("Server sync failed. Attempting direct client-side Supabase profile fetch fallback:", e.message || String(e));
              try {
                  const { data: dbUser, error: dbError } = await supabase
                      .from('users')
                      .select('*')
                      .eq('id', session.user.id)
                      .maybeSingle();

                  if (dbError) throw dbError;

                  if (dbUser) {
                      console.log("Client-side Supabase user profile fallback successful.");
                      setSyncError(null);
                      const banStatus = checkBanStatus(dbUser as User);
                      setUser({ ...dbUser, id: session.user.id } as User);
                      if (window.location.pathname.includes('/auth/callback') || window.location.hash.includes('access_token')) {
                          window.history.replaceState({}, document.title, window.location.origin);
                      }
                      if (banStatus !== 'ALLOWED') setView('BANNED');
                      else if (view === 'AUTH' || view === 'LANDING') setView('DASHBOARD');
                  } else {
                      console.log("No profile found. Creating client-side fallback user profile...");
                      const referredByCode = localStorage.getItem('pending_ref_code') || '';
                      let referredBy = null;
                      if (referredByCode) {
                          try {
                              const { data: refUser } = await supabase
                                  .from('users')
                                  .select('id')
                                  .eq('referral_code', referredByCode.toUpperCase())
                                  .maybeSingle();
                              if (refUser) {
                                  referredBy = refUser.id;
                              }
                          } catch (refErr) {
                              console.warn("Could not query referrer client-side:", refErr);
                          }
                      }

                      const referralCode = `U${session.user.id.substring(0, 4)}${Math.floor(10000 + Math.random() * 90000)}`.toUpperCase();
                      const fallbackName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || "User";
                      const fallbackMobile = session.user.user_metadata?.phone || null;

                      const newUserProfile: User = {
                          id: session.user.id,
                          email: session.user.email || "",
                          name: fallbackName,
                          mobile: fallbackMobile,
                          role: UserRole.USER,
                          balance: 0,
                          totalSpent: 0,
                          isBanned: false,
                          createdAt: new Date().toISOString(),
                          lastLogin: new Date().toISOString(),
                          referral_code: referralCode,
                          referred_by: referredBy,
                          referral_balance: 0,
                          total_referral_earnings: 0
                      };

                      const { data: insertedUser, error: insertErr } = await supabase
                          .from('users')
                          .upsert(newUserProfile, { onConflict: 'id' })
                          .select()
                          .single();

                      if (insertErr) {
                          // Handle name unique constraints gracefully by appending random numbers
                          if (insertErr.message?.includes('users_name_key') || insertErr.details?.includes('name')) {
                              newUserProfile.name = `${fallbackName}_${Math.floor(1000 + Math.random() * 9000)}`;
                              const { data: retriedUser, error: retryErr } = await supabase
                                  .from('users')
                                  .upsert(newUserProfile, { onConflict: 'id' })
                                  .select()
                                  .single();
                              if (retryErr) throw retryErr;
                              console.log("Client-side fallback user profile creation successful (retried).");
                              localStorage.removeItem('pending_ref_code');
                              setSyncError(null);
                              const banStatus = checkBanStatus(retriedUser as User);
                              setUser({ ...retriedUser, id: session.user.id } as User);
                              if (window.location.pathname.includes('/auth/callback') || window.location.hash.includes('access_token')) {
                                  window.history.replaceState({}, document.title, window.location.origin);
                              }
                              if (banStatus !== 'ALLOWED') setView('BANNED');
                              else if (view === 'AUTH' || view === 'LANDING') setView('DASHBOARD');
                              return;
                          }
                          throw insertErr;
                      }

                      console.log("Client-side fallback user profile creation successful.");
                      localStorage.removeItem('pending_ref_code');
                      setSyncError(null);
                      const banStatus = checkBanStatus(insertedUser as User);
                      setUser({ ...insertedUser, id: session.user.id } as User);
                      if (window.location.pathname.includes('/auth/callback') || window.location.hash.includes('access_token')) {
                          window.history.replaceState({}, document.title, window.location.origin);
                      }
                      if (banStatus !== 'ALLOWED') setView('BANNED');
                      else if (view === 'AUTH' || view === 'LANDING') setView('DASHBOARD');
                  }
              } catch (fallbackError: any) {
                  console.error("Failed to sync user via server AND client-side fallback:", fallbackError.message || String(fallbackError));
                  setSyncError(e.message || "Failed to synchronize user profile");
                  await supabase.auth.signOut();
                  setUser(null);
                  setView('AUTH');
              }
          }
      } else {
          setUser(null);
          if (view !== 'AUTH' && view !== 'MAINTENANCE' && view !== 'BANNED') {
              setView('LANDING');
          }
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
          window.opener.postMessage({ type: 'SUPABASE_AUTH_CALLBACK', hash: window.location.hash, search: window.location.search }, '*');
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
        const hash = event.data?.hash || '';
        const cleanHash = hash.startsWith('#') ? hash.substring(1) : hash;
        const params = new URLSearchParams(cleanHash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          }).then(({ data: { session }, error }) => {
            if (error) {
              console.error("Failed to set session from popup parameters:", error.message);
              setSyncError(error.message);
            } else if (session) {
              handleSession(session);
            }
          });
        } else {
          // Fallback to checking current session
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) handleSession(session);
          });
        }
      }
    };
    window.addEventListener('message', handleMessage);

//    // 3. Initial session check
//    supabase.auth.getSession().then(({ data: { session } }) => {
//        handleSession(session);
//    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        handleSession(session);
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const login = async (identifier: string, pass: string) => {
    let email = identifier.trim();
    const isMobile = /^\d{10}$/.test(identifier);

    if (isMobile) {
        const foundEmail = await getEmailByMobile(identifier);
        if (!foundEmail) throw new Error("Mobile number not registered.");
        email = foundEmail;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) throw new Error(error.message);
  };

  const loginWithGoogle = async (refCode?: string) => {
    setSyncError(null);
    if (refCode) {
      localStorage.setItem('pending_ref_code', refCode);
    }
    const inIframe = window.self !== window.top;
    const redirectUrl = `${window.location.origin}/auth/callback`;
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: inIframe, // Skip redirect only in iframe to handle popups
      }
    });
    
    if (error) throw new Error(error.message);
    
    if (inIframe && data?.url) {
      // Open in a popup to avoid iframe redirect issues (bad_oauth_state) in the sandbox
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      const popup = window.open(
        data.url, 
        'supabase-auth', 
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // If the popup was blocked by a popup blocker, inform the user
      if (!popup) {
        setSyncError("Popup blocked by browser. Please allow popups or open this app in a new tab to use Google Login.");
      }
    }
  };

  const register = async (email: string, pass: string, name: string, mobile: string, refCode?: string) => {
    if (!/^\d{10}$/.test(mobile)) throw new Error("Please enter a valid 10-digit mobile number.");
    
    // Check uniqueness client-side first to avoid DB error spam
    if (!(await checkUsernameUnique(name))) throw new Error("Username already taken. Please choose another.");
    if (!(await checkMobileUnique(mobile))) throw new Error("Mobile number already registered. Try logging in.");
    
    // Pass metadata so the DB Trigger can populate fields immediately
    const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
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

    if (data.user && refCode) {
        localStorage.setItem('pending_ref_code', refCode);
    }
  };

  const logout = async () => { 
      await supabase.auth.signOut(); 
      setView('LANDING'); 
  };

  interface EnhancedError {
    message: string;
    code?: string;
    details?: string;
    timestamp: string;
    diagnostics?: {
      userAgent: string;
      origin: string;
      backendUrl: string;
      supabaseUrl: string;
      isWebView: boolean;
      isIframe: boolean;
      likelyCause: string;
      recommendation: string;
    };
  }

  const AuthModal = () => {
    const [identifier, setIdentifier] = useState(''); 
    const [email, setEmail] = useState('');
    const [pass, setPass] = useState('');
    const [name, setName] = useState('');
    const [mobile, setMobile] = useState('');
    const [refCode, setRefCode] = useState(''); // New State for Referral Code
    const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
    const [error, setError] = useState<EnhancedError | null>(null);
    const [loading, setLoading] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [isTestingBackend, setIsTestingBackend] = useState(false);
    const [backendStatus, setBackendStatus] = useState<'IDLE' | 'WAKING' | 'ONLINE' | 'ERROR'>('IDLE');
    const [backendPingTime, setBackendPingTime] = useState<number | null>(null);

    const analyzeError = (err: any): EnhancedError => {
      const errMsg = err?.message || String(err);
      const userAgent = navigator.userAgent;
      const isWebView = /FBAN|FBAV|Instagram|Twitter|LinkedIn|Pinterest|Snapchat|Slack|MicroMessenger|WhatsApp|Line|FB_IAB|FBSS/i.test(userAgent) || 
                        ( /iPhone|iPad|iPod/i.test(userAgent) && !/Safari/i.test(userAgent) ) ||
                        ( /Android/i.test(userAgent) && /wv/i.test(userAgent) );
      const isIframe = window.self !== window.top;
      
      let likelyCause = "An unknown error occurred during authentication.";
      let recommendation = "Please try again or contact support if the issue persists.";
      
      const lowerMsg = errMsg.toLowerCase();
      if (lowerMsg.includes("disallowed_useragent") || lowerMsg.includes("403") || lowerMsg.includes("disallowed user agent") || lowerMsg.includes("comply with google policies")) {
        likelyCause = "Google Blocks OAuth logins in embedded WebViews / In-App browsers or iframes to protect user credentials.";
        recommendation = "Open this website directly in a separate standard web browser window (e.g. Google Chrome, Safari, Firefox, or Microsoft Edge) and enable popups.";
      } else if (lowerMsg.includes("failed to fetch") || lowerMsg.includes("networkerror") || lowerMsg.includes("load failed") || lowerMsg.includes("network error")) {
        likelyCause = "The browser failed to communicate with the secure backend API server. This typically happens if the Render free-tier server is currently booting up (sleeping due to inactivity) or your internet connection is unstable.";
        recommendation = "Please wait 30-40 seconds for the backend server to wake up, and click the Login/Register button again.";
      } else if (lowerMsg.includes("invalid login credentials") || lowerMsg.includes("invalid credentials")) {
        likelyCause = "The password entered is incorrect, or no user exists with this email / phone number.";
        recommendation = "Double-check your email/phone number and password. If you don't have an account, switch to 'Register' mode to create one.";
      } else if (lowerMsg.includes("username already taken") || lowerMsg.includes("name already taken")) {
        likelyCause = "Another user has already registered with the exact full name / username you entered.";
        recommendation = "Please choose a slightly different full name (e.g. add a middle name, initial, or last name) to ensure unique database profile creation.";
      } else if (lowerMsg.includes("mobile number already registered") || lowerMsg.includes("mobile_key")) {
        likelyCause = "This 10-digit mobile number is already connected to another registered account.";
        recommendation = "Try logging in using this mobile number instead, or use a different mobile number if you are registering a new account.";
      } else if (lowerMsg.includes("confirm email") || lowerMsg.includes("email confirmation")) {
        likelyCause = "Supabase Auth email confirmation is enabled on this project's dashboard, which prevents instant session creation.";
        recommendation = "Please go to the Supabase Dashboard -> Authentication -> Providers -> Email and turn off 'Confirm Email' to allow immediate login and sync.";
      } else if (lowerMsg.includes("user_already_exists") || lowerMsg.includes("user already exists")) {
        likelyCause = "An account with this email address has already been registered.";
        recommendation = "Switch to 'Login' mode and enter this email address with your password, or click Forgot Password if you need to reset it.";
      } else if (lowerMsg.includes("weak_password") || lowerMsg.includes("password should be")) {
        likelyCause = "The password does not meet safety requirements (e.g., must be at least 6 characters long).";
        recommendation = "Please enter a stronger password with at least 6 characters (using combinations of letters, numbers, and symbols is recommended).";
      } else if (lowerMsg.includes("rate limit") || lowerMsg.includes("too many requests")) {
        likelyCause = "Too many login/registration attempts from your network within a short time window (anti-spam protection).";
        recommendation = "Please wait 60 seconds before trying again, or try connecting through a different network/cellular data connection.";
      } else if (lowerMsg.includes("invalid email") || lowerMsg.includes("email address is invalid")) {
        likelyCause = "The email format you entered is incorrect.";
        recommendation = "Double check your email address format (e.g. user@example.com) and verify there are no spaces or typos.";
      } else if (lowerMsg.includes("user profile returned") || lowerMsg.includes("profile creation") || lowerMsg.includes("synchronize user profile")) {
        likelyCause = "Supabase logged you in successfully, but the backend API failed to synchronize and save your custom profile metadata.";
        recommendation = "Click register or login again, or check your internet connection to ensure our server on Render can write to the PostgreSQL database.";
      }
      
      const getBackendUrl = () => {
        if (config?.renderBackendUrl?.trim()) return config.renderBackendUrl.trim();
        const origin = window.location.origin.toLowerCase();
        if (origin.includes('socialuphub.in') || origin.includes('socialuphub-smm.web.app')) {
          return 'https://socialuphub-backend.onrender.com';
        }
        return window.location.origin;
      };

      return {
        message: errMsg,
        code: err?.status || err?.code || "AUTH_ERROR",
        details: err?.stack || "No extended trace available.",
        timestamp: new Date().toLocaleTimeString(),
        diagnostics: {
          userAgent,
          origin: window.location.origin,
          backendUrl: getBackendUrl(),
          supabaseUrl: (import.meta as any).env?.VITE_SUPABASE_URL || "Configured",
          isWebView,
          isIframe,
          likelyCause,
          recommendation
        }
      };
    };

    const testBackendConnection = async () => {
      setIsTestingBackend(true);
      setBackendStatus('WAKING');
      const start = Date.now();
      try {
          const getActiveBackendUrl = () => {
              if (config?.renderBackendUrl?.trim()) return config.renderBackendUrl.trim();
              const origin = window.location.origin.toLowerCase();
              if (origin.includes('socialuphub.in') || origin.includes('socialuphub-smm.web.app')) {
                  return 'https://socialuphub-backend.onrender.com';
              }
              return window.location.origin;
          };
          const testUrl = `${getActiveBackendUrl().replace(/\/$/, "")}/api/health`;
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 6000); // 6s timeout for wake up

          const res = await fetch(testUrl, { signal: controller.signal });
          clearTimeout(id);

          if (res.ok) {
              setBackendStatus('ONLINE');
              setBackendPingTime(Date.now() - start);
          } else {
              setBackendStatus('ERROR');
          }
      } catch (e) {
          console.error("Healthcheck probe failed:", e);
          setBackendStatus('ERROR');
      } finally {
          setIsTestingBackend(false);
      }
    };

    useEffect(() => {
        if (syncError) {
            setError(analyzeError(new Error(syncError)));
        } else {
            setError(null);
        }
    }, [syncError]);

    // Auto-fill referral code from URL hash, search query, or localStorage
    useEffect(() => {
        // 1. Check URL Hash
        const hash = window.location.hash;
        let code = '';
        if (hash.includes('?ref=')) {
            code = hash.split('?ref=')[1];
        } else if (hash.includes('?referral=')) {
            code = hash.split('?referral=')[1];
        }
        
        // 2. Check URL Search Params if not in hash
        if (!code) {
            const params = new URLSearchParams(window.location.search);
            code = params.get('ref') || params.get('referral') || '';
        }

        // 3. Check localStorage if still not found
        if (!code) {
            code = localStorage.getItem('pending_ref_code') || '';
        }

        if (code) {
            setRefCode(code.toUpperCase());
            localStorage.setItem('pending_ref_code', code.toUpperCase());
            setMode('REGISTER');
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault(); 
      
      setError(null); setLoading(true);
      try { 
          if (mode === 'REGISTER') {
              await register(email, pass, name, mobile, refCode);
          } else {
              await login(identifier, pass);
          }
      } catch (err: any) { 
          setError(analyzeError(err)); 
      } finally { 
          setLoading(false); 
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a110c]/80 backdrop-blur-sm p-4">
        <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-6 md:p-8 rounded-3xl w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in duration-200 text-[var(--app-text)] max-h-[95vh] overflow-y-auto">
            <button onClick={() => setView('LANDING')} className="absolute top-5 right-5 text-[var(--app-text-muted)] hover:text-[var(--app-text)] text-lg">✕</button>
            <div className="flex justify-center mb-6">
                <Logo />
            </div>
            <h2 className="text-2xl font-black mb-6 text-center text-[var(--app-text)]">{mode === 'LOGIN' ? 'Welcome Back' : 'Create Account'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
               {mode === 'REGISTER' && (
                   <>
                       <input className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3.5 text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-1 focus:ring-[var(--app-accent)] outline-none transition-all text-sm font-medium" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} required />
                       <input className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3.5 text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-1 focus:ring-[var(--app-accent)] outline-none transition-all text-sm font-medium" placeholder="Mobile Number (10 Digits)" value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} required />
                       <input className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3.5 text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-1 focus:ring-[var(--app-accent)] outline-none transition-all text-sm font-medium" placeholder="Email Address" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                       {/* Referral Input */}
                       <input className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3.5 text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-1 focus:ring-[var(--app-accent)] outline-none transition-all text-sm font-medium" placeholder="Referral Code (Optional)" value={refCode} onChange={e => setRefCode(e.target.value)} />
                   </>
               )}
               {mode === 'LOGIN' && (
                   <input className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3.5 text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-1 focus:ring-[var(--app-accent)] outline-none transition-all text-sm font-medium" placeholder="Email or Mobile Number" value={identifier} onChange={e => setIdentifier(e.target.value)} required />
               )}
               <input className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3.5 text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-1 focus:ring-[var(--app-accent)] outline-none transition-all text-sm font-medium" placeholder="Password" type="password" value={pass} onChange={e => setPass(e.target.value)} required />
               
               {error && (
                  <div className="space-y-3">
                    {/* Simple error text banner */}
                    <div className="text-red-600 text-xs bg-red-50 dark:bg-red-950/20 p-3.5 rounded-xl border border-red-200 dark:border-red-900/40 font-bold flex items-start gap-2 text-left">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">{error.message}</p>
                        <p className="text-[10px] text-red-500/80 dark:text-red-400/80 font-normal mt-0.5">Time: {error.timestamp}</p>
                      </div>
                    </div>

                    {/* Live Diagnostics Toggle */}
                    <div className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800/60 rounded-xl p-3 text-left">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDiagnostics(!showDiagnostics);
                          if (!showDiagnostics && backendStatus === 'IDLE') {
                            testBackendConnection();
                          }
                        }}
                        className="w-full flex items-center justify-between text-xs font-bold text-[var(--app-text)] hover:opacity-80 transition-all"
                      >
                        <span className="flex items-center gap-1.5 text-[var(--app-accent)]">
                          <Terminal className="w-3.5 h-3.5" />
                          Live Diagnostics & Solutions
                        </span>
                        {showDiagnostics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {showDiagnostics && (
                        <div className="mt-3 space-y-3 text-[11px] border-t border-neutral-200 dark:border-neutral-800/60 pt-3 animate-in fade-in duration-200">
                          
                          {/* Diagnostic status checklist */}
                          <div className="grid grid-cols-2 gap-2 font-medium">
                            <div className="bg-neutral-100 dark:bg-neutral-800/40 p-2 rounded-lg border border-neutral-200/50 dark:border-neutral-800/40">
                              <span className="text-[var(--app-text-muted)] block mb-0.5">Environment:</span>
                              <span className="text-[var(--app-text)] font-semibold">
                                {error.diagnostics?.isIframe ? 'Iframe Sandbox' : 'Direct Browser'}
                              </span>
                            </div>
                            <div className="bg-neutral-100 dark:bg-neutral-800/40 p-2 rounded-lg border border-neutral-200/50 dark:border-neutral-800/40">
                              <span className="text-[var(--app-text-muted)] block mb-0.5">User Agent Safe?</span>
                              <span className={`font-semibold ${error.diagnostics?.isWebView ? 'text-amber-500' : 'text-green-500'}`}>
                                {error.diagnostics?.isWebView ? 'WebView (Risk)' : 'Standard Web'}
                              </span>
                            </div>
                          </div>

                          {/* Backend Health Check Prober */}
                          <div className="bg-neutral-100 dark:bg-neutral-800/40 p-2 rounded-lg border border-neutral-200/50 dark:border-neutral-800/40 flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="text-[var(--app-text-muted)] block">Backend Live Connection:</span>
                              <span className="text-[var(--app-text)] font-semibold block truncate">
                                {error.diagnostics?.backendUrl}
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={isTestingBackend}
                              onClick={testBackendConnection}
                              className="flex items-center gap-1 bg-[var(--app-accent)] text-white text-[10px] px-2 py-1 rounded-md hover:opacity-90 disabled:opacity-50 transition-all font-bold shrink-0"
                            >
                              {isTestingBackend ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3 h-3" />
                              )}
                              {backendStatus === 'IDLE' ? 'Check' : backendStatus === 'WAKING' ? 'Probing...' : 'Re-Check'}
                            </button>
                          </div>

                          {/* Backend Status Display */}
                          {backendStatus !== 'IDLE' && (
                            <div className="p-2 rounded-lg text-[10px] font-bold flex items-center gap-1.5 bg-neutral-100 dark:bg-neutral-800/40">
                              <span className="text-[var(--app-text-muted)] font-medium">Status Result:</span>
                              {backendStatus === 'ONLINE' && (
                                <span className="text-green-500 flex items-center gap-1">
                                  ● ACTIVE ({backendPingTime}ms) - Server is responsive & running.
                                </span>
                              )}
                              {backendStatus === 'WAKING' && (
                                <span className="text-amber-500 animate-pulse flex items-center gap-1">
                                  ● WAKING UP - Server is starting (takes ~30s on Render).
                                </span>
                              )}
                              {backendStatus === 'ERROR' && (
                                <span className="text-red-500 flex items-center gap-1">
                                  ● OFFLINE / TIMEOUT - Server is sleeping or unreachable.
                                </span>
                              )}
                            </div>
                          )}

                          {/* Root cause and recommendation */}
                          <div className="bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-900/30 p-2.5 rounded-lg space-y-1.5 text-left text-amber-800 dark:text-amber-300">
                            <h4 className="font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Likely Root Cause:
                            </h4>
                            <p className="leading-relaxed font-medium">{error.diagnostics?.likelyCause}</p>
                            
                            <h4 className="font-bold flex items-center gap-1 pt-1.5 border-t border-amber-200/30 dark:border-amber-900/20">
                              <HelpCircle className="w-3.5 h-3.5 text-green-500" />
                              Step-by-Step Resolution:
                            </h4>
                            <p className="leading-relaxed font-semibold text-green-700 dark:text-green-400">{error.diagnostics?.recommendation}</p>
                          </div>

                          {/* Raw Error dump */}
                          <div className="space-y-1 text-left">
                            <span className="text-[var(--app-text-muted)] font-semibold block">Full Technical Error Log:</span>
                            <pre className="p-2 bg-neutral-900 text-red-400 rounded-lg overflow-x-auto text-[10px] font-mono whitespace-pre-wrap max-h-[100px] border border-neutral-800">
                              {error.message} (Code: {error.code})
                              {"\n"}Origin: {error.diagnostics?.origin}
                              {"\n"}UserAgent: {error.diagnostics?.userAgent}
                              {"\n\n"}Stack trace:
                              {"\n"}{error.details}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
               )}

               <button disabled={loading} className="w-full bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] disabled:opacity-50 text-white font-black uppercase text-sm tracking-wider py-3.5 rounded-xl transition-all shadow-[0_4px_14px_rgba(46,189,89,0.3)]">{loading ? 'Processing...' : (mode === 'LOGIN' ? 'Login' : 'Register')}</button>
            </form>

            <div className="mt-6 relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--app-border)]"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-[var(--app-card-bg)] px-2 text-[var(--app-text-muted)]">Or continue with</span></div>
            </div>

            <button 
                onClick={() => loginWithGoogle(refCode)}
                disabled={loading}
                className="w-full mt-4 flex items-center justify-center gap-3 bg-white hover:bg-gray-50 border border-gray-200 text-black font-bold py-3.5 rounded-xl transition-all text-sm"
            >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" referrerPolicy="no-referrer" />
                Google
            </button>

            <p className="text-[10px] text-[var(--app-text-muted)] text-center mt-3 leading-relaxed max-w-[90%] mx-auto">
                * If Google login is blocked (403 disallowed user-agent), please open this page in a separate browser window (e.g. Chrome/Safari) and allow popups.
            </p>

            <p className="text-center mt-6 text-[var(--app-text-muted)] hover:text-[var(--app-text)] text-sm cursor-pointer font-medium transition-colors" onClick={() => setMode(mode === 'LOGIN' ? 'REGISTER' : 'LOGIN')}>{mode === 'LOGIN' ? "Don't have an account? Register" : "Already have an account? Login"}</p>
        </div>
      </div>
    );
  };

  const BannedScreen = () => (
      <div className="min-h-screen bg-[var(--app-bg)] flex flex-col items-center justify-center p-4 text-center">
          <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-8 rounded-3xl max-w-md w-full shadow-2xl animate-in zoom-in text-[var(--app-text)]">
              <ShieldAlert className="w-20 h-20 text-[var(--app-accent)] mx-auto mb-6 animate-bounce" />
              <h1 className="text-3xl font-black text-[var(--app-text)] mb-2 uppercase tracking-tighter">{!user?.banExpires ? 'ACCOUNT BLOCKED' : 'TEMPORARY BAN'}</h1>
              <p className="text-[var(--app-text-muted)] font-medium mb-6">{user?.banReason || "Suspicious activity detected."}</p>
              {user?.banExpires && <div className="bg-[var(--app-input-bg)] p-4 rounded-xl border border-[var(--app-border)] mb-6"><p className="text-[var(--app-text-muted)] text-xs uppercase font-bold mb-2">Access Restored In</p><div className="text-4xl font-mono font-bold text-[var(--app-text)] flex items-center justify-center gap-3"><Clock className="text-[var(--app-accent)] animate-pulse" />{banTimeRemaining || "Loading..."}</div></div>}
              <button onClick={logout} className="w-full flex items-center justify-center gap-2 bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-white py-3.5 rounded-xl font-bold transition-all"><LogOut size={18} /> Sign Out</button>
          </div>
      </div>
  );

  const MaintenanceScreen = () => (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-6 text-center selection:bg-emerald-100 selection:text-emerald-900 relative overflow-hidden font-sans">
          {/* Subtle background radial light-green glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.06)_0%,_rgba(255,255,255,0)_70%)] z-0"></div>
          
          {/* Subtle decorative blurred ambient light green blobs */}
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl"></div>

          <div className="relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 max-w-xl w-full">
              {/* Premium card with soft shadows */}
              <div className="bg-white border border-emerald-100/80 p-8 md:p-12 rounded-3xl shadow-xl shadow-emerald-900/[0.02]">
                  {/* Icon container with delicate light green backdrop and smooth floating transition */}
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-8 border border-emerald-100/50 shadow-sm animate-pulse duration-1000">
                      <Wrench size={36} className="text-emerald-600 md:w-10 md:h-10" />
                  </div>

                  <h1 className="text-3xl md:text-5xl font-black tracking-tighter mb-4 leading-tight italic">
                      <span className="text-neutral-800">UNDER</span> <br/>
                      <span className="text-emerald-600 font-extrabold" style={{ textShadow: "0 0 10px rgba(16, 185, 129, 0.15)" }}>MAINTENANCE</span>
                  </h1>

                  <p className="text-neutral-600 text-sm md:text-base max-w-md mx-auto mb-8 font-medium leading-relaxed">
                      We are currently upgrading our servers to provide you with faster services. We will be back online shortly. Thank you for your patience!
                  </p>

                  {/* Status pill badge */}
                  <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5 rounded-full text-xs font-semibold text-emerald-700 mb-2 tracking-wide">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      SYSTEM UPGRADE IN PROGRESS
                  </div>

                  <div className="text-[10px] text-neutral-400 font-bold tracking-widest uppercase font-mono mt-6">SOCIAL UP HUB</div>
              </div>

              {/* Discreet Administrator access button */}
              <button 
                  onClick={() => setView('AUTH')} 
                  className="mt-8 text-xs font-semibold text-neutral-400 hover:text-emerald-600 transition-colors duration-200 cursor-pointer"
              >
                  Admin Access Bypass
              </button>
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

  return (
    <AuthContext.Provider value={{ user, login, loginWithGoogle, register, logout }}>
      <ScrollToTop />
      <DynamicTheme config={config} />
      <CurrentView />
    </AuthContext.Provider>
  );
};
export default App;
