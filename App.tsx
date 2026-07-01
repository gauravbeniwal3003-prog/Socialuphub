
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import LandingPage from './components/landing/LandingPage';
import { Dashboard } from './components/dashboard/Dashboard';
import { AdminPanel } from './components/admin/AdminPanel';
import { User, UserRole, GlobalConfig } from './types';
import { supabase } from './services/supabase'; // Using Supabase Auth
import { createUserDoc, checkUsernameUnique, startAutoSync, checkMobileUnique, getEmailByMobile, getConfig, useStore } from './services/mockStore';
import { ShieldAlert, Clock, LogOut, Wrench } from 'lucide-react';
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

interface SyncErrorDetails {
  message: string;
  statusCode?: number;
  url?: string;
  contentType?: string;
  responseBody?: string;
  hint?: string;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
export const useAuth = () => useContext(AuthContext);

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncErrorDetails, setSyncErrorDetails] = useState<SyncErrorDetails | null>(null);
  const [blockedOAuthUrl, setBlockedOAuthUrl] = useState<string | null>(null);
  const [view, setView] = useState<'LANDING' | 'DASHBOARD' | 'AUTH' | 'BANNED' | 'MAINTENANCE'>('LANDING');
  const [authLoading, setAuthLoading] = useState(true);
  const [banTimeRemaining, setBanTimeRemaining] = useState<string>('');

  // Scroll to top of viewport on any view or route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view]);
  
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
          let hasSetDetails = false;
          try {
              // Retrieve pending referral code from localStorage
              const referredByCode = localStorage.getItem('pending_ref_code') || '';
              const fallbackName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || "User";
              const fallbackMobile = session.user.user_metadata?.phone || "";

              // Sync user on the backend safely bypassing client-side RLS policies and race conditions
              const isLocalOrAiStudio = typeof window !== 'undefined' && (
                  window.location.hostname.includes('run.app') || 
                  window.location.hostname.includes('localhost') || 
                  window.location.hostname.includes('127.0.0.1') ||
                  window.location.hostname.includes('aistudio')
              );
              
              const backendUrl = isLocalOrAiStudio ? '' : (config?.renderBackendUrl?.trim() || '');
              const baseUrl = backendUrl ? backendUrl.replace(/\/$/, '') : '';
              const syncUrl = `${baseUrl}/api/sync-user`;
              
              console.log(`[Auth Sync] Syncing user profile via: ${syncUrl}`);

              let response;
              let usedBackup = false;

              try {
                  response = await fetch(syncUrl, {
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
              } catch (fetchErr: any) {
                  if (backendUrl) {
                      console.warn(`[Auth Sync] Syncing with custom backend URL failed: ${fetchErr.message}. Falling back to local container backend...`);
                      response = await fetch('/api/sync-user', {
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
                      usedBackup = true;
                  } else {
                      throw fetchErr;
                  }
              }

              // Double-check if we got an error or HTML response from a custom backendUrl, and automatically fall back to local if so
              if (backendUrl && !usedBackup) {
                  const contentType = response.headers.get("content-type") || "";
                  if (!response.ok || !contentType.includes("application/json")) {
                      console.warn(`[Auth Sync] Custom backendUrl returned invalid status or non-JSON. Falling back to local container backend...`);
                      try {
                          const fallbackResponse = await fetch('/api/sync-user', {
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
                          if (fallbackResponse.ok) {
                              const fallbackContentType = fallbackResponse.headers.get("content-type") || "";
                              if (fallbackContentType.includes("application/json")) {
                                  response = fallbackResponse;
                                  usedBackup = true;
                              }
                          }
                      } catch (fallbackErr) {
                          console.error("[Auth Sync] Local container backend fallback failed:", fallbackErr);
                      }
                  }
              }

              if (!response.ok) {
                  const contentType = response.headers.get("content-type") || "";
                  if (contentType.includes("application/json")) {
                      const errData = await response.json().catch(() => ({}));
                      setSyncErrorDetails({
                          message: errData.error || `HTTP ${response.status}: Server Error`,
                          statusCode: response.status,
                          url: '/api/sync-user',
                          contentType,
                          responseBody: JSON.stringify(errData, null, 2),
                          hint: "The backend server rejected the synchronization request. This usually means the authentication token is invalid or expired, or the database rejected user record creation."
                      });
                      hasSetDetails = true;
                      throw new Error(errData.error || `HTTP ${response.status}`);
                  } else {
                      const textBody = await response.text();
                      console.error(`HTTP ${response.status} Error - Expected JSON from /api/sync-user, but received HTML/text:`, textBody.substring(0, 500));
                      setSyncErrorDetails({
                          message: `HTTP ${response.status}: Server Error`,
                          statusCode: response.status,
                          url: '/api/sync-user',
                          contentType,
                          responseBody: textBody,
                          hint: "The backend server returned an HTML page instead of JSON. This typically indicates an Express crash, routing issue, or reverse-proxy error (e.g. 502 Bad Gateway)."
                      });
                      hasSetDetails = true;
                      throw new Error(`HTTP ${response.status}: Server Error`);
                  }
              }

              const contentType = response.headers.get("content-type") || "";
              if (!contentType.includes("application/json")) {
                  const textBody = await response.text();
                  console.error("Expected JSON response from /api/sync-user, but received HTML/text:", textBody.substring(0, 500));
                  setSyncErrorDetails({
                      message: "Invalid Response Content-Type",
                      statusCode: response.status,
                      url: '/api/sync-user',
                      contentType,
                      responseBody: textBody,
                      hint: "The server responded with 200 OK but returned HTML instead of JSON. This happens if the request was redirected to the static SPA fallback index.html page (typically due to a misconfigured endpoint route)."
                  });
                  hasSetDetails = true;
                  throw new Error("Server returned an invalid HTML response instead of JSON data.");
              }

              const data = await response.json();
              if (data?.user) {
                  // If successfully synced, remove referral code from localStorage
                  localStorage.removeItem('pending_ref_code');
                  setSyncError(null);
                  setSyncErrorDetails(null);
                  
                  const banStatus = checkBanStatus(data.user);
                  setUser({ ...data.user, id: session.user.id });
                  if (banStatus !== 'ALLOWED') setView('BANNED');
                  else if (view === 'AUTH' || view === 'LANDING') setView('DASHBOARD');
              } else {
                  setSyncErrorDetails({
                      message: "Empty Profile Data",
                      statusCode: response.status,
                      url: '/api/sync-user',
                      contentType,
                      responseBody: JSON.stringify(data),
                      hint: "The request completed but no user profile record was returned in the response object."
                  });
                  hasSetDetails = true;
                  throw new Error("No user profile returned from sync API.");
              }
          } catch (e: any) {
              console.error("Failed to sync user via server:", e.message || JSON.stringify(e));
              setSyncError(e.message || "Failed to synchronize user profile");
              if (!hasSetDetails) {
                  setSyncErrorDetails({
                      message: e.message || "Failed to synchronize user profile",
                      hint: "An unexpected connection or network error occurred during user synchronization. Please review the browser's console logs for network stack tracing."
                  });
              }
              await supabase.auth.signOut();
              setUser(null);
              setView('AUTH');
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

        const search = event.data?.search || '';
        const cleanSearch = search.startsWith('?') ? search.substring(1) : search;
        const searchParams = new URLSearchParams(cleanSearch);
        const code = searchParams.get('code');

        const errorParam = searchParams.get('error') || params.get('error');
        const errorDescParam = searchParams.get('error_description') || params.get('error_description');

        if (errorParam) {
          console.error("OAuth error received in callback message:", errorParam, errorDescParam);
          setSyncError(`Google Auth Error: ${errorDescParam || errorParam}`);
          setSyncErrorDetails({
            message: errorDescParam || errorParam,
            statusCode: 400,
            url: '/auth/callback',
            contentType: 'application/json',
            responseBody: JSON.stringify({ error: errorParam, error_description: errorDescParam }),
            hint: "The OAuth authorization server or Supabase returned an error during redirect. This happens if the user cancelled the login, or if the Google API client ID and Client Secret credentials are misconfigured or inactive in Supabase Settings."
          });
          return;
        }

        if (accessToken && refreshToken) {
          console.log("Setting session from popup OAuth implicit hash tokens...");
          supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          }).then(({ data: { session }, error }) => {
            if (error) {
              console.error("Failed to set session from popup parameters:", error.message);
              setSyncError(error.message);
              setSyncErrorDetails({
                message: error.message,
                hint: "An error occurred inside the Supabase Auth client while establishing a session with the implicit tokens."
              });
            } else if (session) {
              handleSession(session);
            }
          }).catch(err => {
              console.error("Critical error in setSession:", err);
              setSyncError(err.message || "Failed to set session.");
              setSyncErrorDetails({
                message: err.message || "Set session crash",
                hint: "A critical JS runtime error occurred while passing OAuth tokens to Supabase client library. This may happen if the library fails to parse an HTML error page."
              });
          });
        } else if (code) {
          console.log("Exchanging code for session in opener window from popup callback...");
          supabase.auth.exchangeCodeForSession(code).then(({ data: { session }, error }) => {
            if (error) {
              console.error("Failed to exchange code for session from popup callback:", error.message);
              setSyncError("OAuth code exchange failed: " + error.message);
              setSyncErrorDetails({
                message: error.message,
                hint: "The OAuth authorization code returned in the popup search query could not be exchanged for a session. This usually means the code is expired, invalid, or already redeemed."
              });
            } else if (session) {
              handleSession(session);
            }
          }).catch(err => {
              console.error("Critical error in exchangeCodeForSession:", err);
              setSyncError(err.message || "Code exchange failed");
              setSyncErrorDetails({
                message: err.message || "Code exchange crash",
                hint: "A critical JS runtime error occurred while exchanging the authorization code. This typically happens if the Supabase server is offline or returned HTML instead of JSON."
              });
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

    // Polling backup for sandboxed window.opener null issues
    const syncInterval = setInterval(async () => {
      const projectRef = "igkrcgcrvnocauccebrf";
      const tokenKey = `sb-${projectRef}-auth-token`;
      const localSessionRaw = localStorage.getItem(tokenKey);
      const oauthTrigger = localStorage.getItem('oauth_sync_trigger');
      const oauthErrorTrigger = localStorage.getItem('oauth_error_trigger');
      
      if (oauthErrorTrigger) {
        localStorage.removeItem('oauth_error_trigger');
        console.error("[Auth Sync] Detected OAuth error via localStorage trigger:", oauthErrorTrigger);
        setSyncError(`Google Auth Error: ${oauthErrorTrigger}`);
        setSyncErrorDetails({
          message: oauthErrorTrigger,
          statusCode: 400,
          url: '/auth/callback',
          contentType: 'application/json',
          hint: "The OAuth authorization server or Supabase returned an error during redirect. This happens if the user cancelled the login, or if the Google API client ID and Client Secret credentials are misconfigured or inactive in Supabase Settings."
        });
        return;
      }

      if (localSessionRaw && oauthTrigger) {
        localStorage.removeItem('oauth_sync_trigger'); // Consume trigger
        console.log("[Auth Sync] Detected session written to localStorage by popup!");
        try {
          const parsed = JSON.parse(localSessionRaw);
          if (parsed?.currentSession) {
            const { data: { session }, error } = await supabase.auth.setSession({
              access_token: parsed.currentSession.access_token,
              refresh_token: parsed.currentSession.refresh_token
            });
            if (error) {
              console.error("[Auth Sync] Failed to set session from localStorage polling:", error.message);
              setSyncError(error.message);
            } else if (session) {
              handleSession(session);
            }
          }
        } catch (err: any) {
          console.error("[Auth Sync] Failed to recover session from dynamic polling:", err);
          setSyncError(err.message || "Failed to parse session from secure callback store.");
        }
      }

      const oauthCodeTrigger = localStorage.getItem('oauth_code_trigger');
      if (oauthCodeTrigger) {
        localStorage.removeItem('oauth_code_trigger'); // Consume trigger
        console.log("[Auth Sync] Detected authorization code written to localStorage by popup!");
        try {
          const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(oauthCodeTrigger);
          if (error) {
            console.error("[Auth Sync] Failed to exchange code from localStorage polling:", error.message);
            setSyncError(error.message);
          } else if (session) {
            handleSession(session);
          }
        } catch (err: any) {
          console.error("[Auth Sync] Failed to exchange code from dynamic polling:", err);
          setSyncError(err.message || "Failed to redeem authorization code.");
        }
      }
    }, 500);

    // 3. Initial session check and code/token exchange on startup
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const hashParams = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    if (accessToken && refreshToken) {
      console.log("Startup: setting session from URL hash tokens...");
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      }).then(({ data: { session }, error }) => {
        if (error) {
          console.error("Startup setSession error:", error.message);
          setSyncError("Startup setSession error: " + error.message);
        } else if (session) {
          handleSession(session);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }).catch(err => {
         console.error("Startup setSession critical error:", err);
         setSyncError(err.message || "Startup session establishment failed");
      });
    } else if (code) {
      console.log("Startup: Exchanging URL code for session...");
      supabase.auth.exchangeCodeForSession(code).then(({ data: { session }, error }) => {
        if (error) {
          console.error("Startup exchangeCodeForSession error:", error.message);
          setSyncError("Startup code exchange error: " + error.message);
        } else if (session) {
          handleSession(session);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }).catch(err => {
         console.error("Startup exchangeCodeForSession critical error:", err);
         setSyncError(err.message || "Startup code exchange failed");
      });
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
          handleSession(session);
      }).catch(err => {
          console.error("Startup getSession failed:", err);
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        handleSession(session);
    });

    return () => {
      clearInterval(syncInterval);
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

  const loginWithGoogle = async (refCode?: string) => {
    setSyncError(null);
    setSyncErrorDetails(null);
    setBlockedOAuthUrl(null);
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

      // If the popup was blocked by a popup blocker, set state so we can show user-clickable fallback UI
      if (!popup) {
        console.warn("Popup blocked by browser. Exposing secure URL for direct click handler.");
        setBlockedOAuthUrl(data.url);
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

    if (data.user && refCode) {
        localStorage.setItem('pending_ref_code', refCode);
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
    const [error, setError] = useState(syncError || '');
    const [loading, setLoading] = useState(false);
    const [hp, setHp] = useState(''); // Honeypot field
    const [startTime] = useState(Date.now()); // Track form load time

    useEffect(() => {
        if (syncError) {
            setError(syncError);
        }
    }, [syncError]);

    // Auto-fill referral code from URL hash
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.includes('?ref=')) {
            const code = hash.split('?ref=')[1];
            if (code) {
                setRefCode(code);
                localStorage.setItem('pending_ref_code', code);
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

      setError(''); 
      setSyncError(null);
      setSyncErrorDetails(null);
      setLoading(true);
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a110c]/80 backdrop-blur-sm p-4">
        <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-8 rounded-3xl w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in duration-200 text-[var(--app-text)]">
            <button onClick={() => setView('LANDING')} className="absolute top-5 right-5 text-[var(--app-text-muted)] hover:text-[var(--app-text)] text-lg">✕</button>
            <div className="flex justify-center mb-6">
                <Logo />
            </div>
            <h2 className="text-2xl font-black mb-6 text-center text-[var(--app-text)]">{mode === 'LOGIN' ? 'Welcome Back' : 'Create Account'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
               {/* Honeypot field (hidden from users) */}
               <div className="hidden" aria-hidden="true">
                   <input type="text" value={hp} onChange={e => setHp(e.target.value)} tabIndex={-1} autoComplete="off" />
               </div>
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
                       <div className="text-red-600 text-xs bg-red-50 dark:bg-red-950/20 p-3 rounded-xl border border-red-200 dark:border-red-900/40 text-center font-bold">
                           {error}
                       </div>
                       {syncErrorDetails && (
                           <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-xl text-left font-sans space-y-2">
                               <div className="flex items-center gap-1.5 text-xs font-black text-amber-500 uppercase tracking-wider">
                                   <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                   Diagnostic Console
                               </div>
                               <p className="text-[11px] text-neutral-400 leading-relaxed">
                                   <strong>Status Code:</strong> {syncErrorDetails.statusCode || "N/A"}<br/>
                                   <strong>Endpoint:</strong> {syncErrorDetails.url || "N/A"}<br/>
                                   <strong>Content-Type:</strong> {syncErrorDetails.contentType || "N/A"}<br/>
                                   <strong>Suggested Reason:</strong> {syncErrorDetails.hint || "Check your network connection and database synchronization."}
                               </p>
                               {syncErrorDetails.responseBody && (
                                   <div className="space-y-1">
                                       <div className="text-[10px] uppercase font-bold text-neutral-500">Raw Response:</div>
                                       <pre className="text-[10px] bg-black text-emerald-400 p-2.5 rounded border border-neutral-850 overflow-x-auto font-mono max-h-32 select-all leading-normal">
                                           {syncErrorDetails.responseBody.substring(0, 300)}
                                           {syncErrorDetails.responseBody.length > 300 ? "..." : ""}
                                       </pre>
                                   </div>
                               )}
                               <button 
                                   type="button" 
                                   onClick={() => { setSyncError(null); setSyncErrorDetails(null); setError(''); }}
                                   className="w-full text-center text-[10px] uppercase font-black tracking-widest text-neutral-400 hover:text-white transition-colors pt-1"
                               >
                                   Clear Diagnostic & Retry
                               </button>
                           </div>
                       )}
                   </div>
               )}
               <button disabled={loading} className="w-full bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] disabled:opacity-50 text-white font-black uppercase text-sm tracking-wider py-3.5 rounded-xl transition-all shadow-[0_4px_14px_rgba(46,189,89,0.3)]">{loading ? 'Processing...' : (mode === 'LOGIN' ? 'Login' : 'Register')}</button>
            </form>

            <div className="mt-6 relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--app-border)]"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-[var(--app-card-bg)] px-2 text-[var(--app-text-muted)]">Or continue with</span></div>
            </div>

            <button 
                onClick={() => blockedOAuthUrl ? (() => { const w = window.open(blockedOAuthUrl, 'supabase-auth', 'width=600,height=700'); if (w) setBlockedOAuthUrl(null); })() : loginWithGoogle(refCode)}
                disabled={loading}
                className={`w-full mt-4 flex items-center justify-center gap-3 border font-bold py-3.5 rounded-xl transition-all text-sm ${blockedOAuthUrl ? "bg-amber-500/10 border-amber-500/30 text-amber-500 animate-pulse" : "bg-white hover:bg-gray-50 border-gray-200 text-black"}`}
            >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" referrerPolicy="no-referrer" />
                {blockedOAuthUrl ? "⚠️ Pop-up Blocked - Click to Authorize" : "Google"}
            </button>

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
