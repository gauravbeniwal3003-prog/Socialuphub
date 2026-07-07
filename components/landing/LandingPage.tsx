import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle, Zap, Shield, TrendingUp, Users, PlayCircle, Lock, MousePointer, CreditCard, ChevronRight, Star, Key, Code, Terminal, Layers, AlertTriangle } from 'lucide-react';
import { Button, Card, Modal } from '../ui/Components';
import { CONTACT_WHATSAPP_URL, INSTAGRAM_URL, CURRENCY_SYMBOL } from '../../constants';
import { useStore, fetchServices, getConfig, getGlobalStats, calculateFinalPrice } from '../../services/mockStore';
import { Service } from '../../types';
import { Logo } from '../ui/Logo';
import { useAuth } from '../../App';

interface LandingProps {
  onGetStarted: () => void;
}

// --- ANIMATED COUNTER COMPONENT (YouTube Style) ---
const AnimatedCounter = ({ value }: { value: number }) => {
  const [displayValue, setDisplayValue] = useState(Math.max(0, value - 150));
  const startTime = useRef<number>(0);
  const startValue = useRef<number>(Math.max(0, value - 150));
  const targetValue = useRef<number>(value);

  useEffect(() => {
    startValue.current = displayValue;
    targetValue.current = value;
    startTime.current = Date.now();
    const duration = 2000;

    const animate = () => {
      const now = Date.now();
      const progress = Math.min((now - startTime.current) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      const current = Math.floor(startValue.current + (targetValue.current - startValue.current) * ease);
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <>{displayValue.toLocaleString()}</>;
};

const LandingPage: React.FC<LandingProps> = ({ onGetStarted }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  
  // URL-driven modal visibility for pristine shareability
  const isTermsOpen = location.pathname.toLowerCase() === '/terms';
  const isPrivacyOpen = location.pathname.toLowerCase() === '/privacy';
  const isRefundOpen = location.pathname.toLowerCase() === '/refund-policy';
  const isApiDocsOpen = location.pathname.toLowerCase() === '/api-docs';

  const handleCloseModal = () => {
    navigate('/');
  };

  // Inline Auth states
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  
  // Real-time Data Hooks
  const dbServices = useStore('suh_services', fetchServices);
  const config = useStore('suh_config', getConfig);

  // Animated Counters
  const [liveOrders, setLiveOrders] = useState(142850);
  const [liveUsers, setLiveUsers] = useState(12400);

  // Slide index for testimonials
  const [testimonialIndex, setTestimonialIndex] = useState(0);

  // Scroll Effect
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Smooth scroll to services section when /services route is hit
  useEffect(() => {
    if (location.pathname.toLowerCase() === '/services') {
      setTimeout(() => {
        const el = document.getElementById('services');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 200); // Small timeout to ensure page content rendering completes
    }
  }, [location.pathname]);

  // Fetch Stats Efficiently
  useEffect(() => {
    const loadStats = async () => {
        const stats = await getGlobalStats();
        if (stats.orders > 0) setLiveOrders(prev => 142850 + stats.orders);
        if (stats.users > 0) setLiveUsers(prev => 12400 + stats.users);
    };
    loadStats();

    const interval = setInterval(() => {
        setLiveOrders(prev => prev + Math.floor(Math.random() * 2)); 
        if (Math.random() > 0.8) setLiveUsers(prev => prev + 1); 
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Filter & Sort Services: Select Premium Services first
  const premiumServices = useMemo(() => {
      const arr = Array.isArray(dbServices) ? dbServices : [];
      let filtered = arr.filter(s => s.isEnabled && s.isPremium);
      if (filtered.length === 0) {
          filtered = arr.filter(s => s.isEnabled);
      }
      return filtered
        .map(s => ({ ...s, finalPrice: calculateFinalPrice(s, config) })) 
        .sort((a, b) => a.finalPrice - b.finalPrice)
        .slice(0, 6);
  }, [dbServices, config]);

  // Real-time Service Count
  const activeServiceCount = useMemo(() => {
      const arr = Array.isArray(dbServices) ? dbServices : [];
      return arr.filter(s => s.isEnabled).length;
  }, [dbServices]);

  const handleInlineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      await login(identifier, password);
    } catch (err: any) {
      setAuthError(err.message || 'Login failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] selection:bg-[var(--app-accent)] selection:text-white font-sans transition-colors duration-150 relative overflow-hidden">
      
      {/* Decorative Wave Waveforms - matches the image's creative organic shapes */}
      <div className="absolute top-[80vh] left-0 right-0 h-[400px] pointer-events-none opacity-10 dark:opacity-5 z-0">
        <svg viewBox="0 0 1440 320" className="w-full h-full fill-[var(--app-accent)]">
          <path d="M0,192L60,192C120,192,240,192,360,170.7C480,149,600,107,720,122.7C840,139,960,213,1080,229.3C1200,245,1320,203,1380,181.3L1440,160L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z"></path>
        </svg>
      </div>

      {/* Navbar */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-[var(--app-bg)]/90 backdrop-blur-md border-b border-[var(--app-border)] shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Logo />
          </div>
          
          {/* Mockup styled center navigation links removed to clean up top navigation */}
          
          <Button size="sm" onClick={onGetStarted} className="bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-white shadow-md text-xs md:text-sm px-5 py-2.5 rounded-xl font-bold">Get Started</Button>
        </div>
      </nav>

      {/* Hero Section with Split-Screen layout (Parity with image 3) */}
      <section className="relative pt-24 pb-16 lg:pt-36 lg:pb-28 overflow-hidden z-10 max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: YouTube mockup video embedded nicely */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-block px-4 py-1.5 rounded-full bg-[var(--app-input-bg)] border border-[var(--app-border)] text-[var(--app-accent)] text-xs md:text-sm font-bold tracking-wider uppercase animate-pulse">
              #1 Automated SMM Panel
            </div>
            
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight leading-tight uppercase font-sans">
              <span className="text-[var(--app-text)]">SocialUpHub: BOOST</span> <br/>
              <span className="text-[var(--app-accent)] drop-shadow-sm">YOUR PRESENCE</span>
            </h1>
            
            <p className="text-[var(--app-text-muted)] text-sm md:text-base max-w-xl leading-relaxed">
              Real-time processing, lowest prices, and 24/7 automated delivery. The most trusted panel for Resellers, Creators and Influencers.
            </p>

            {/* Promo Video Area */}
            <div className="relative aspect-video w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl border-4 border-white dark:border-[var(--app-border)] bg-neutral-900 group">
              {config?.landingVideoUrl ? (
                <iframe 
                  className="w-full h-full"
                  src={(function(url) {
                    if (!url) return '';
                    try {
                      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
                      const match = url.match(regExp);
                      if (match && match[2].length === 11) {
                        return `https://www.youtube.com/embed/${match[2]}?autoplay=0&rel=0`;
                      }
                    } catch (e) {}
                    return url;
                  })(config.landingVideoUrl)}
                  title="SocialUpHub Promo Video"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                ></iframe>
              ) : (
                <>
                  {/* Fake youtube preview snapshot */}
                  <img 
                    src="https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=800&q=80" 
                    alt="Instagram Growth Tips Only Tech" 
                    className="w-full h-full object-cover filter brightness-75 group-hover:scale-105 transition-transform duration-700" 
                    referrerPolicy="no-referrer"
                  />
                  
                  {/* Header Overlay */}
                  <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 to-transparent flex items-center gap-3 text-white">
                    <div className="w-9 h-9 rounded-full bg-[var(--app-accent)] flex items-center justify-center font-bold text-xs text-white">SU</div>
                    <div>
                      <p className="font-bold text-xs md:text-sm line-clamp-1">Instagram Growth Tips for Beginners (2026) | 🚀</p>
                      <p className="text-[10px] text-gray-300">Only Tech</p>
                    </div>
                  </div>

                  {/* YouTube Giant Green Play Button */}
                  <button onClick={onGetStarted} className="absolute inset-0 m-auto w-16 h-12 bg-[var(--app-accent)] hover:opacity-90 text-white rounded-2xl flex items-center justify-center shadow-lg transform active:scale-95 transition-all">
                    <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>

                  {/* Footer Overlay */}
                  <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg text-white text-xs font-bold pointer-events-none">
                    Watch on YouTube
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Column: Inline Login Box matching image 3 layout exactly */}
          <div className="lg:col-span-5 h-full flex flex-col justify-center">
            <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-6 md:p-8 rounded-3xl shadow-xl w-full max-w-md mx-auto transition-transform duration-300">
              <h3 className="text-xl font-bold text-[var(--app-text)] font-sans mb-1 text-center">Sign In Now</h3>
              <p className="text-xs text-[var(--app-text-muted)] text-center mb-6">Access SMM rates instantly and order real-time</p>
              
              <form onSubmit={handleInlineLogin} className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-[var(--app-text-muted)] tracking-wider uppercase block mb-1.5">Username Or Email</label>
                  <input 
                    type="text"
                    required
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3 text-sm text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:border-[var(--app-accent)] outline-none font-medium transition-all"
                    placeholder="Enter your email or mobile"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[11px] font-bold text-[var(--app-text-muted)] tracking-wider uppercase block">Password</label>
                    <button type="button" onClick={onGetStarted} className="text-[11px] font-bold text-[var(--app-accent)] hover:underline">Forgot Password?</button>
                  </div>
                  <input 
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl p-3 text-sm text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:border-[var(--app-accent)] outline-none font-medium transition-all"
                    placeholder="••••••••"
                  />
                </div>

                {authError && (
                  <div className="text-amber-500 text-xs bg-amber-500/5 p-2.5 rounded-lg border border-amber-500/10 text-center font-bold">
                    {authError}
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={authLoading}
                  className="w-full bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-white font-bold py-3 px-4 rounded-xl transition-all shadow-[0_4px_14px_rgba(46,189,89,0.3)] flex items-center justify-center gap-2"
                >
                  {authLoading ? 'Signing in...' : 'Sign in'} <ArrowRight size={16} />
                </button>
              </form>

              <div className="mt-4 relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--app-border)]"></div></div>
                <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-[var(--app-card-bg)] px-2 text-[var(--app-text-muted)]">Or</span></div>
              </div>

              <button 
                onClick={loginWithGoogle}
                className="w-full mt-4 flex items-center justify-center gap-3 bg-[var(--app-bg)] hover:bg-[var(--app-input-bg)] border border-[var(--app-border)] text-[var(--app-text)] font-semibold py-2.5 rounded-xl transition-all text-sm shadow-sm"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google Logo" className="w-4 h-4" referrerPolicy="no-referrer" />
                Login with Google
              </button>

              <div className="text-center mt-4">
                <button onClick={onGetStarted} className="text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)] font-medium">
                  Do not have an account? <span className="text-[var(--app-accent)] font-bold">Signup</span>
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Real-time Stats Panel */}
        <div className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-8 border-t border-[var(--app-border)] pt-8">
           <div className="text-center group">
               <h3 className="text-2xl md:text-4xl font-extrabold text-[var(--app-text)] group-hover:scale-105 transition-transform duration-300">
                  <AnimatedCounter value={liveOrders} />+
               </h3>
               <p className="text-[10px] text-[var(--app-accent)] font-bold uppercase tracking-wider mt-1.5">Live Orders Completed</p>
           </div>
           <div className="text-center group">
               <h3 className="text-2xl md:text-4xl font-extrabold text-[var(--app-text)] group-hover:scale-105 transition-transform duration-300">
                  <AnimatedCounter value={liveUsers} />+
               </h3>
               <p className="text-[10px] text-[var(--app-accent)] font-bold uppercase tracking-wider mt-1.5">Active Users</p>
           </div>
           <div className="text-center">
               <h3 className="text-2xl md:text-4xl font-extrabold text-[var(--app-text)]">
                  {activeServiceCount > 0 ? activeServiceCount : '200'}+
               </h3>
               <p className="text-[10px] text-[var(--app-text-muted)] font-bold uppercase tracking-wider mt-1.5">Services Active</p>
           </div>
           <div className="text-center">
               <h3 className="text-2xl md:text-4xl font-extrabold text-[var(--app-text)]">99.9%</h3>
               <p className="text-[10px] text-[var(--app-text-muted)] font-bold uppercase tracking-wider mt-1.5">Uptime Guaranteed</p>
           </div>
        </div>
      </section>

      {/* --- WHY CHOOSE US SECTION (Elegant, Clean, High-Contrast Redesign) --- */}
      <section id="features" className="py-24 bg-[var(--app-bg)] relative z-10 border-t border-[var(--app-border)]/40">
        <div className="max-w-7xl mx-auto px-6">
            
            <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 bg-[var(--app-accent)]/10 px-4 py-1.5 rounded-full text-xs font-black text-[var(--app-accent)] uppercase tracking-wider mb-4 border border-[var(--app-accent)]/20">
                    OUR CORE ADVANTAGES
                </div>
                <h2 className="text-3xl md:text-5xl font-black tracking-tight text-[var(--app-text)] uppercase font-sans">
                    Why choose <span className="text-[var(--app-accent)]">us</span>?
                </h2>
                <p className="text-[var(--app-text-muted)] text-sm md:text-base max-w-lg mx-auto font-medium mt-3">
                  Discover what positions our automated SMM execution platform at the pinnacle of the global industry.
                </p>
            </div>

            {/* Elegant 4-card layout with premium typography and sophisticated glass-shadow effects */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
              
              {/* Card 1 */}
              <div className="bg-gradient-to-b from-[var(--app-card-bg)] to-[var(--app-sidebar-bg)] border border-[var(--app-border)]/80 p-6 md:p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] hover:shadow-[0_25px_50px_rgba(46,189,89,0.08)] hover:-translate-y-2 hover:border-[var(--app-accent)] transition-all duration-300 relative overflow-hidden group flex flex-col justify-between">
                <div>
                  <div className="absolute top-0 right-0 h-32 w-32 bg-gradient-to-br from-[var(--app-accent)]/10 to-transparent opacity-0 group-hover:opacity-100 rounded-bl-full transition-all duration-500 pointer-events-none"></div>
                  
                  <div className="flex justify-between items-start mb-6 relative z-10">
                    <div className="w-14 h-14 bg-gradient-to-tr from-[var(--app-accent)]/10 to-[var(--app-accent)]/5 rounded-2xl flex items-center justify-center text-[var(--app-accent)] group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 border border-[var(--app-accent)]/20 shadow-sm">
                      <Zap size={24} className="animate-pulse" />
                    </div>
                    <span className="text-[10px] font-mono tracking-widest text-[var(--app-text-muted)] font-bold uppercase opacity-60">
                      01 / PERFORMANCE
                    </span>
                  </div>
                  
                  <h3 className="text-lg md:text-xl font-black text-[var(--app-text)] mb-3 font-sans tracking-tight">Superb quality</h3>
                  <p className="text-[var(--app-text-muted)] text-xs md:text-sm leading-relaxed mb-6 font-medium">
                    Direct premium tier pipelines delivering pristine organic signals with absolute zero-drops & elite audience retention metrics.
                  </p>
                </div>
                
                <div className="pt-4 border-t border-[var(--app-border)]/60 flex items-center justify-between text-xs font-bold text-[var(--app-text-muted)] relative z-10">
                  <span className="font-mono">Accuracy Metric</span>
                  <span className="text-[var(--app-accent)] font-extrabold bg-[var(--app-accent)]/10 px-3 py-1 rounded-lg border border-[var(--app-accent)]/20">99.9%</span>
                </div>
              </div>

              {/* Card 2 */}
              <div className="bg-gradient-to-b from-[var(--app-card-bg)] to-[var(--app-sidebar-bg)] border border-[var(--app-border)]/80 p-6 md:p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] hover:shadow-[0_25px_50px_rgba(46,189,89,0.08)] hover:-translate-y-2 hover:border-[var(--app-accent)] transition-all duration-300 relative overflow-hidden group flex flex-col justify-between">
                <div>
                  <div className="absolute top-0 right-0 h-32 w-32 bg-gradient-to-br from-[var(--app-accent)]/10 to-transparent opacity-0 group-hover:opacity-100 rounded-bl-full transition-all duration-500 pointer-events-none"></div>
                  
                  <div className="flex justify-between items-start mb-6 relative z-10">
                    <div className="w-14 h-14 bg-gradient-to-tr from-[var(--app-accent)]/10 to-[var(--app-accent)]/5 rounded-2xl flex items-center justify-center text-[var(--app-accent)] group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 border border-[var(--app-accent)]/20 shadow-sm">
                      <CreditCard size={24} />
                    </div>
                    <span className="text-[10px] font-mono tracking-widest text-[var(--app-text-muted)] font-bold uppercase opacity-60">
                      02 / SECURE
                    </span>
                  </div>
                  
                  <h3 className="text-lg md:text-xl font-black text-[var(--app-text)] mb-3 font-sans tracking-tight">Flexible payments</h3>
                  <p className="text-[var(--app-text-muted)] text-xs md:text-sm leading-relaxed mb-6 font-medium">
                    Deposit instantly with state-of-the-art secure automated Razorpay UPI, cards, net banking, or decentralized cryptos.
                  </p>
                </div>
                
                <div className="pt-4 border-t border-[var(--app-border)]/60 flex items-center justify-between text-xs font-bold text-[var(--app-text-muted)] relative z-10">
                  <span className="font-mono">Processing</span>
                  <span className="text-[var(--app-accent)] font-extrabold bg-[var(--app-accent)]/10 px-3 py-1 rounded-lg border border-[var(--app-accent)]/20">Instant</span>
                </div>
              </div>

              {/* Card 3 */}
              <div className="bg-gradient-to-b from-[var(--app-card-bg)] to-[var(--app-sidebar-bg)] border border-[var(--app-border)]/80 p-6 md:p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] hover:shadow-[0_25px_50px_rgba(46,189,89,0.08)] hover:-translate-y-2 hover:border-[var(--app-accent)] transition-all duration-300 relative overflow-hidden group flex flex-col justify-between">
                <div>
                  <div className="absolute top-0 right-0 h-32 w-32 bg-gradient-to-br from-[var(--app-accent)]/10 to-transparent opacity-0 group-hover:opacity-100 rounded-bl-full transition-all duration-500 pointer-events-none"></div>
                  
                  <div className="flex justify-between items-start mb-6 relative z-10">
                    <div className="w-14 h-14 bg-gradient-to-tr from-[var(--app-accent)]/10 to-[var(--app-accent)]/5 rounded-2xl flex items-center justify-center text-[var(--app-accent)] group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 border border-[var(--app-accent)]/20 shadow-sm">
                      <Users size={24} />
                    </div>
                    <span className="text-[10px] font-mono tracking-widest text-[var(--app-text-muted)] font-bold uppercase opacity-60">
                      03 / VALUATION
                    </span>
                  </div>
                  
                  <h3 className="text-lg md:text-xl font-black text-[var(--app-text)] mb-3 font-sans tracking-tight">Extra affordable</h3>
                  <p className="text-[var(--app-text-muted)] text-xs md:text-sm leading-relaxed mb-6 font-medium">
                    We bypass middle-men to serve baseline rates directly from SMM originators, guaranteeing your pricing yields maximum profit.
                  </p>
                </div>
                
                <div className="pt-4 border-t border-[var(--app-border)]/60 flex items-center justify-between text-xs font-bold text-[var(--app-text-muted)] relative z-10">
                  <span className="font-mono">Starts From</span>
                  <span className="text-[var(--app-accent)] font-extrabold bg-[var(--app-accent)]/10 px-3 py-1 rounded-lg border border-[var(--app-accent)]/20">₹0.01 / 1k</span>
                </div>
              </div>

              {/* Card 4 */}
              <div className="bg-gradient-to-b from-[var(--app-card-bg)] to-[var(--app-sidebar-bg)] border border-[var(--app-border)]/80 p-6 md:p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] hover:shadow-[0_25px_50px_rgba(46,189,89,0.08)] hover:-translate-y-2 hover:border-[var(--app-accent)] transition-all duration-300 relative overflow-hidden group flex flex-col justify-between">
                <div>
                  <div className="absolute top-0 right-0 h-32 w-32 bg-gradient-to-br from-[var(--app-accent)]/10 to-transparent opacity-0 group-hover:opacity-100 rounded-bl-full transition-all duration-500 pointer-events-none"></div>
                  
                  <div className="flex justify-between items-start mb-6 relative z-10">
                    <div className="w-14 h-14 bg-gradient-to-tr from-[var(--app-accent)]/10 to-[var(--app-accent)]/5 rounded-2xl flex items-center justify-center text-[var(--app-accent)] group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 border border-[var(--app-accent)]/20 shadow-sm">
                      <Shield size={24} />
                    </div>
                    <span className="text-[10px] font-mono tracking-widest text-[var(--app-text-muted)] font-bold uppercase opacity-60">
                      04 / AUTOMATION
                    </span>
                  </div>
                  
                  <h3 className="text-lg md:text-xl font-black text-[var(--app-text)] mb-3 font-sans tracking-tight">Delivered quickly</h3>
                  <p className="text-[var(--app-text-muted)] text-xs md:text-sm leading-relaxed mb-6 font-medium">
                    Orders dispatch immediately via automated high-speed API pipelines. Fully dynamic delivery with active real-time status.
                  </p>
                </div>
                
                <div className="pt-4 border-t border-[var(--app-border)]/60 flex items-center justify-between text-xs font-bold text-[var(--app-text-muted)] relative z-10">
                  <span className="font-mono">API Speed</span>
                  <span className="text-[var(--app-accent)] font-extrabold bg-[var(--app-accent)]/10 px-3 py-1 rounded-lg border border-[var(--app-accent)]/20">~3 Seconds</span>
                </div>
              </div>

            </div>
        </div>
      </section>

      {/* Services Preview panel with clean green markers */}
      <section id="services" className="py-20 bg-[var(--app-sidebar-bg)] border-y border-[var(--app-border)] relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
             <h2 className="text-3xl md:text-4xl font-black text-[var(--app-text)] uppercase font-sans tracking-tight">
                PREMIUM SERVICES LIST
             </h2>
             <p className="text-[var(--app-text-muted)] max-w-xl mx-auto text-sm md:text-base font-medium mt-1">
                 Top-tier SMM services handpicked for elite speed and retention.
             </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {premiumServices.length > 0 ? premiumServices.map((service) => (
              <Card key={service.service} className="bg-[var(--app-card-bg)] hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border-[var(--app-border)] hover:border-[var(--app-accent)] p-6 rounded-2xl">
                <div className="flex justify-between items-start mb-4">
                  <span className="bg-[var(--app-accent)]/10 text-[var(--app-accent)] text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">{service.category}</span>
                  <div className="flex items-center gap-2">
                       {service.isPremium && <span className="text-yellow-500 text-[10px] font-extrabold uppercase tracking-wide flex items-center gap-1">✨ Premium</span>}
                       <div className="w-2.5 h-2.5 rounded-full bg-[var(--app-accent)] shadow-[0_0_8px_var(--app-accent)] animate-pulse"></div>
                  </div>
                </div>
                <h3 className="font-extrabold text-sm md:text-base mb-2 line-clamp-2 text-[var(--app-text)] font-sans">{service.name}</h3>
                <div className="flex justify-between items-center mt-6 pt-4 border-t border-[var(--app-border)]">
                  <span className="text-[var(--app-text-muted)] text-[10px] uppercase font-bold tracking-wider">Rate per 1,000</span>
                  <span className="text-xl md:text-2xl font-black italic text-[var(--app-accent)]">
                    {CURRENCY_SYMBOL}{service.finalPrice.toFixed(2)}
                  </span>
                </div>
              </Card>
            )) : (
               <div className="col-span-full text-center text-[var(--app-text-muted)] py-10 font-medium">
                   <p>Discovering premium rate grids...</p>
               </div>
            )}
          </div>
          <div className="text-center mt-12 font-sans">
              <Button onClick={onGetStarted} size="lg" className="bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-white shadow-xl px-12 py-3.5 rounded-xl font-bold w-full sm:w-auto">View Rate Sheet & Join</Button>
          </div>
        </div>
      </section>

      {/* How It Works with Curved Progress Numbers */}
      <section id="how" className="py-24 bg-[var(--app-bg)]">
         <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-black text-[var(--app-text)] uppercase tracking-tight">HOW IT WORKS</h2>
                <p className="text-[var(--app-text-muted)] text-sm md:text-base max-w-lg mx-auto font-medium">4 easy steps to give your business new heights.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
                {/* Connecting Wave Line */}
                <div className="hidden md:block absolute top-[40%] left-0 w-full h-1 bg-[var(--app-input-bg)] z-0"></div>

                {[
                    { icon: <Users size={24}/>, step: "1", title: "Register", desc: "Create your free account in seconds." },
                    { icon: <CreditCard size={24}/>, step: "2", title: "Add Funds", desc: "Deposit securely via automated gateways." },
                    { icon: <MousePointer size={24}/>, step: "3", title: "Select Service", desc: "Choose from 200+ top status metrics." },
                    { icon: <TrendingUp size={24}/>, step: "4", title: "Watch Growth", desc: "Our system fires requests instantly." }
                ].map((item, i) => (
                    <div key={i} className="relative z-10 bg-[var(--app-card-bg)] border border-[var(--app-border)] p-6 md:p-8 rounded-3xl text-center shadow-sm hover:border-[var(--app-accent)] hover:shadow-md transition-all group">
                        
                        {/* Circle step number */}
                        <div className="w-14 h-14 bg-[var(--app-input-bg)] group-hover:bg-[var(--app-accent)] group-hover:text-white rounded-full flex items-center justify-center mx-auto mb-5 text-[var(--app-accent)] font-black text-xl border-4 border-[var(--app-bg)] shadow transition-all">
                            {item.step}
                        </div>
                        
                        <h3 className="text-lg font-black text-[var(--app-text)] mb-2">{item.title}</h3>
                        <p className="text-xs text-[var(--app-text-muted)] font-medium leading-relaxed">{item.desc}</p>
                    </div>
                ))}
            </div>
         </div>
      </section>

      {/* Footer */}
      <footer className="bg-[var(--app-sidebar-bg)] border-t border-[var(--app-border)] pt-16 pb-8 text-[var(--app-text)] font-sans relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-1 md:col-span-2 space-y-4">
              <Logo />
              <p className="text-[var(--app-text-muted)] max-w-sm text-xs leading-relaxed font-medium">
                The #1 Trusted SMM Automation Panel for ultra high-performance engagement delivery. 
                Deploy instant signals to accelerate visibility and expand your business footprint.
              </p>
              <div className="flex gap-4 pt-2">
                <Button variant="outline" size="sm" onClick={() => window.open(INSTAGRAM_URL, '_blank')} className="border-[var(--app-border)] hover:bg-[var(--app-input-bg)] text-[var(--app-text-muted)] text-xs rounded-xl font-bold py-2.5">Instagram</Button>
                <Button variant="outline" size="sm" onClick={() => window.open(CONTACT_WHATSAPP_URL, '_blank')} className="border-[var(--app-border)] hover:bg-[var(--app-input-bg)] text-[var(--app-text-muted)] text-xs rounded-xl font-bold py-2.5">WhatsApp Chat</Button>
              </div>
            </div>
            <div>
              <h4 className="font-extrabold mb-4 text-[var(--app-text)] uppercase tracking-wider text-xs font-sans">Quick Links</h4>
              <ul className="space-y-2 text-xs text-[var(--app-text-muted)] font-medium flex flex-col items-start">
                <li><button onClick={() => navigate('/')} className="hover:text-[var(--app-accent)] transition-colors cursor-pointer text-left font-medium">Home</button></li>
                <li><button onClick={() => navigate('/services')} className="hover:text-[var(--app-accent)] transition-colors cursor-pointer text-left font-medium">Services Rate Sheet</button></li>
                <li><button onClick={onGetStarted} className="hover:text-[var(--app-accent)] transition-colors cursor-pointer text-left font-medium">Login Workspace</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-extrabold mb-4 text-[var(--app-text)] uppercase tracking-wider text-xs font-sans">Corporate Legal</h4>
              <ul className="space-y-2 text-xs text-[var(--app-text-muted)] font-medium flex flex-col items-start">
                <li><button onClick={() => navigate('/terms')} className="hover:text-[var(--app-accent)] transition-colors cursor-pointer text-left font-medium">Terms of Service</button></li>
                <li><button onClick={() => navigate('/privacy')} className="hover:text-[var(--app-accent)] transition-colors cursor-pointer text-left font-medium">Privacy Shield Policy</button></li>
                <li><button onClick={() => navigate('/refund-policy')} className="hover:text-[var(--app-accent)] transition-colors cursor-pointer text-left font-medium">Refund Regulations</button></li>
                <li><button onClick={() => navigate('/api-docs')} className="hover:text-[var(--app-accent)] transition-colors cursor-pointer text-left font-medium">API Endpoint Specs</button></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[var(--app-border)] pt-8 text-center text-xs text-[var(--app-text-muted)] flex flex-col md:flex-row justify-between items-center gap-4 font-medium">
            <span>&copy; {new Date().getFullYear()} Social Up Hub. Crafted with perfection.</span>
            <span className="flex items-center gap-1.5"><Lock size={12} className="text-[var(--app-accent)]" /> Secure 256-bit AES Server Processing</span>
          </div>
        </div>
      </footer>

      {/* --- CORPORATE LEGAL MODALS (URL-driven routing) --- */}
      <Modal isOpen={isTermsOpen} onClose={handleCloseModal} title="Terms of Service (ToS)">
        <div className="space-y-4 text-xs md:text-sm leading-relaxed text-[var(--app-text-muted)] font-medium">
          <p className="text-[var(--app-text)] font-extrabold text-base mb-2">Platform Master Agreement</p>
          <p>By registering or logging in to Social Up Hub, you declare full compliance with our Terms. SMM services are automated signals designed solely for visibility and engagement expansion.</p>
          <div className="space-y-3">
            <div>
              <h4 className="font-bold text-[var(--app-text)] uppercase tracking-wider text-xs flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-[var(--app-accent)]" /> 1. Network Constraints</h4>
              <p className="mt-1">We are not liable for account suspensions, shadowing, or content adjustments made by social platforms (Instagram, YouTube, etc.). All operations carry baseline industry risk.</p>
            </div>
            <div>
              <h4 className="font-bold text-[var(--app-text)] uppercase tracking-wider text-xs flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-[var(--app-accent)]" /> 2. Pipeline Integrity</h4>
              <p className="mt-1">Orders route through dynamic API channels. Although delivery is prompt, delays during core network updates can happen. No retention guarantee is implied unless specified.</p>
            </div>
            <div>
              <h4 className="font-bold text-[var(--app-text)] uppercase tracking-wider text-xs flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-[var(--app-accent)]" /> 3. Exploits & Security</h4>
              <p className="mt-1">Any coordinate spamming, multi-accounting, payment manipulation, or API bypass attempts will result in an immediate, irrevocable ban and forfeiture of wallet balance.</p>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isPrivacyOpen} onClose={handleCloseModal} title="Privacy Shield Policy">
        <div className="space-y-4 text-xs md:text-sm leading-relaxed text-[var(--app-text-muted)] font-medium">
          <p className="text-[var(--app-text)] font-extrabold text-base mb-2">Secure User Information Protection</p>
          <p>Your privacy is protected by active security headers, network encryption, and data shields. We never sell, rent, or lease platform logs to external marketers.</p>
          <div className="space-y-3">
            <div>
              <h4 className="font-bold text-[var(--app-text)] uppercase tracking-wider text-xs flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-[var(--app-accent)]" /> 1. Collected Information</h4>
              <p className="mt-1">We request your name, email, and mobile number strictly to maintain account credentials, prevent sybil attacks, and synchronize API integrations.</p>
            </div>
            <div>
              <h4 className="font-bold text-[var(--app-text)] uppercase tracking-wider text-xs flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5 text-[var(--app-accent)]" /> 2. Payment Encryption</h4>
              <p className="mt-1">All gateway payments (INR) are handled using modern, industry-standard 256-bit AES encryption through Razorpay. We do not store credit cards or banking secrets on our servers.</p>
            </div>
            <div>
              <h4 className="font-bold text-[var(--app-text)] uppercase tracking-wider text-xs flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-[var(--app-accent)]" /> 3. Cookie Consistency</h4>
              <p className="mt-1">Standard session cookies are generated solely to sustain your authentication state across public and private dashboard routes, preventing repeated login queries.</p>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isRefundOpen} onClose={handleCloseModal} title="Refund Regulations">
        <div className="space-y-4 text-xs md:text-sm leading-relaxed text-[var(--app-text-muted)] font-medium">
          <p className="text-[var(--app-text)] font-extrabold text-base mb-2">Financial Dispute & Refund Clauses</p>
          <p>Please read these regulations carefully before topping up your workspace balance. Adding funds constitutes complete agreement to these terms.</p>
          <div className="space-y-3">
            <div>
              <h4 className="font-bold text-[var(--app-text)] uppercase tracking-wider text-xs flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-red-500" /> 1. No External Chargebacks</h4>
              <p className="mt-1">All added funds are final. No cash-outs, bank transfers, or card reversals are issued. Disputed charges or false banking claims will lead to instant account closure.</p>
            </div>
            <div>
              <h4 className="font-bold text-[var(--app-text)] uppercase tracking-wider text-xs flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-[var(--app-accent)]" /> 2. Automatic Wallet Returns</h4>
              <p className="mt-1">If an order is cancelled, partial, or fails due to network issues, the system will automatically refund the exact INR balance back to your internal platform wallet instantly.</p>
            </div>
            <div>
              <h4 className="font-bold text-[var(--app-text)] uppercase tracking-wider text-xs flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-[var(--app-accent)]" /> 3. Support Resolution</h4>
              <p className="mt-1">For any transaction discrepancies or billing issues, please contact our 24/7 WhatsApp customer helpdesk within 48 hours with payment receipt numbers for fast assistance.</p>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isApiDocsOpen} onClose={handleCloseModal} title="Public API Specifications">
        <div className="space-y-4 text-xs md:text-sm leading-relaxed text-[var(--app-text-muted)] font-medium">
          <p className="text-[var(--app-text)] font-extrabold text-base mb-1">Developer API Integration</p>
          <p>Automate your client portals or backend systems using our ultra-fast high-retention REST API pipelines.</p>
          
          <div className="bg-[var(--app-input-bg)] p-3.5 rounded-xl border border-[var(--app-border)] font-mono text-xs overflow-x-auto space-y-1">
            <div className="text-[var(--app-text)] font-bold">API Base Endpoint URL:</div>
            <div className="text-[var(--app-accent)] select-all truncate font-bold">https://socialuphub.in/api/v2</div>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="font-bold text-[var(--app-text)] uppercase tracking-wider text-xs flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5 text-[var(--app-accent)]" /> Required Query Params</h4>
              <ul className="list-disc list-inside mt-1 space-y-1 pl-1">
                <li><code className="font-bold font-mono">key</code>: Your account's unique master API key.</li>
                <li><code className="font-bold font-mono">action</code>: Desired operation (<code className="font-mono">balance</code>, <code className="font-mono">services</code>, <code className="font-mono">add</code>, <code className="font-mono">status</code>).</li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-[var(--app-text)] uppercase tracking-wider text-xs flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-[var(--app-accent)]" /> Available Operations</h4>
              <div className="mt-1.5 space-y-1.5 pl-1">
                <div className="border-l-2 border-[var(--app-accent)]/40 pl-2">
                  <p className="font-bold text-[var(--app-text)] text-[11px] font-mono">action: "balance"</p>
                  <p className="text-[11px]">Returns current account balance in INR. (Format: <code className="font-mono">{"{ \"balance\": \"150.25\" }"}</code>)</p>
                </div>
                <div className="border-l-2 border-[var(--app-accent)]/40 pl-2">
                  <p className="font-bold text-[var(--app-text)] text-[11px] font-mono">action: "services"</p>
                  <p className="text-[11px]">Returns list of SMM services with categories, minimum values, rates, and IDs.</p>
                </div>
                <div className="border-l-2 border-[var(--app-accent)]/40 pl-2">
                  <p className="font-bold text-[var(--app-text)] text-[11px] font-mono">action: "add"</p>
                  <p className="text-[11px]">Creates a new automated SMM order. Mandatory parameters: <code className="font-mono">service</code>, <code className="font-mono">link</code>, <code className="font-mono">quantity</code>.</p>
                </div>
                <div className="border-l-2 border-[var(--app-accent)]/40 pl-2">
                  <p className="font-bold text-[var(--app-text)] text-[11px] font-mono">action: "status"</p>
                  <p className="text-[11px]">Checks order delivery state. Mandatory parameter: <code className="font-mono">order</code> (Order ID).</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default LandingPage;
