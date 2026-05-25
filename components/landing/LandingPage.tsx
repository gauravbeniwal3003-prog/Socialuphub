import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ArrowRight, CheckCircle, Zap, Shield, TrendingUp, Users, PlayCircle, Lock, MousePointer, CreditCard, ChevronRight, Star } from 'lucide-react';
import { Button, Card } from '../ui/Components';
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
  const [scrolled, setScrolled] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  
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
          
          {/* Mockup styled center navigation links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-[var(--app-text-muted)]">
            <button onClick={onGetStarted} className="text-[var(--app-accent)] hover:underline flex items-center gap-1">🟢 Sign in</button>
            <button onClick={onGetStarted} className="text-[var(--app-accent)] hover:underline flex items-center gap-1">🟢 Signup</button>
            <a href="#services" className="hover:text-[var(--app-text)] transition-colors">Services</a>
            <a href="#testimonials" className="hover:text-[var(--app-text)] transition-colors">Success Stories</a>
            <a href="#how" className="hover:text-[var(--app-text)] transition-colors">Terms & Info</a>
            <button onClick={() => window.open(CONTACT_WHATSAPP_URL, '_blank')} className="hover:text-[var(--app-text)] transition-colors">Support</button>
          </div>
          
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

      {/* --- SUCCESS STORIES SECTION (Image 1 Parity) --- */}
      <section id="testimonials" className="py-20 bg-gradient-to-b from-[var(--app-accent)] to-[#24a14a] text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_var(--tw-gradient-stops))] from-black/10 via-transparent to-transparent pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-2 font-sans text-white uppercase">
              Success stories
            </h2>
            <p className="text-emerald-100 text-sm md:text-base max-w-lg mx-auto font-medium">
              Check out what our customers have to say about our panel.
            </p>
          </div>

          {/* Testimonial slider / carousel as shown in Image 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto items-stretch">
            
            {/* Slide Card 1 */}
            <div className="bg-white text-gray-900 rounded-3xl p-6 md:p-8 shadow-xl flex flex-col justify-between hover:scale-[1.02] transition-transform duration-300">
              <div>
                <div className="flex gap-1 mb-4 text-[#2ebd59]">
                  <Star fill="currentColor" size={16} />
                  <Star fill="currentColor" size={16} />
                  <Star fill="currentColor" size={16} />
                  <Star fill="currentColor" size={16} />
                  <Star fill="currentColor" size={16} />
                </div>
                <h4 className="font-extrabold text-lg mb-2 text-[#0f1711]">Jane Kim</h4>
                <p className="text-gray-600 text-sm leading-relaxed font-medium">
                  "I couldn't figure out the best way to promote my business online that could be effective and affordable at the same time. This SMM panel is the best solution I've found so far! Just check their prices — you really can't go wrong with that."
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Reseller</span>
                <span className="text-xs font-bold text-[#2ebd59] flex items-center gap-1">🟢 Verified Buyer</span>
              </div>
            </div>

            {/* Slide Card 2 */}
            <div className="bg-white text-gray-900 rounded-3xl p-6 md:p-8 shadow-xl flex flex-col justify-between hover:scale-[1.02] transition-transform duration-300">
              <div>
                <div className="flex gap-1 mb-4 text-[#2ebd59]">
                  <Star fill="currentColor" size={16} />
                  <Star fill="currentColor" size={16} />
                  <Star fill="currentColor" size={16} />
                  <Star fill="currentColor" size={16} />
                  <Star fill="currentColor" size={16} />
                </div>
                <h4 className="font-extrabold text-lg mb-2 text-[#0f1711]">Olivia Jenkins</h4>
                <p className="text-gray-600 text-sm leading-relaxed font-medium">
                  "If you're wondering how you can help your social media accounts get more attention fast, this is it! No need to wait for a long time either because SMM services on this panel are delivered super quickly. The services are sooo cheap too."
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Influencer</span>
                <span className="text-xs font-bold text-[#2ebd59] flex items-center gap-1">🟢 Verified Buyer</span>
              </div>
            </div>

          </div>

          {/* Pagination Indicators matching Image 1 pagination dots */}
          <div className="flex justify-center gap-2 mt-10">
            <span className="w-2.5 h-2.5 rounded-full bg-white cursor-pointer opacity-100"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-white/40 cursor-pointer hover:bg-white/70"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-white/40 cursor-pointer hover:bg-white/70"></span>
          </div>

        </div>
      </section>

      {/* --- WHY CHOOSE US SECTION (Image 2 Parity) --- */}
      <section id="features" className="py-24 bg-[var(--app-bg)] relative z-10">
        <div className="max-w-7xl mx-auto px-6">
            
            <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-3 text-[var(--app-text)] uppercase text-center">
                    Why choose us?
                </h2>
                <p className="text-[var(--app-text-muted)] text-sm md:text-base max-w-lg mx-auto font-medium">
                  Learn what makes our panel stand out on the market.
                </p>
            </div>

            {/* Elegant 4-card layout as shown on Image 2 with soft-green icon backgrounds */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              
              {/* Card 1 */}
              <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-6 md:p-8 rounded-3xl shadow-sm hover:shadow-md hover:border-[var(--app-accent)] transition-all group">
                <div className="w-16 h-16 bg-[#ebf7ed] dark:bg-[#122316] rounded-2xl flex items-center justify-center mb-6 text-[var(--app-accent)] group-hover:scale-105 transition-transform">
                  <Zap size={28} />
                </div>
                <h3 className="text-lg font-black text-[var(--app-text)] mb-2 font-sans">Superb quality</h3>
                <p className="text-[var(--app-text-muted)] text-sm leading-relaxed">
                  The best SMM services you can find on the market.
                </p>
              </div>

              {/* Card 2 */}
              <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-6 md:p-8 rounded-3xl shadow-sm hover:shadow-md hover:border-[var(--app-accent)] transition-all group">
                <div className="w-16 h-16 bg-[#ebf7ed] dark:bg-[#122316] rounded-2xl flex items-center justify-center mb-6 text-[var(--app-accent)] group-hover:scale-105 transition-transform">
                  <CreditCard size={28} />
                </div>
                <h3 className="text-lg font-black text-[var(--app-text)] mb-2 font-sans">Different payment options</h3>
                <p className="text-[var(--app-text-muted)] text-sm leading-relaxed">
                  You can add funds via a payment option you prefer.
                </p>
              </div>

              {/* Card 3 */}
              <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-6 md:p-8 rounded-3xl shadow-sm hover:shadow-md hover:border-[var(--app-accent)] transition-all group">
                <div className="w-16 h-16 bg-[#ebf7ed] dark:bg-[#122316] rounded-2xl flex items-center justify-center mb-6 text-[var(--app-accent)] group-hover:scale-105 transition-transform">
                  <Users size={28} />
                </div>
                <h3 className="text-lg font-black text-[var(--app-text)] mb-2 font-sans">Extra affordable</h3>
                <p className="text-[var(--app-text-muted)] text-sm leading-relaxed">
                  All SMM services on our panel are extra cheap.
                </p>
              </div>

              {/* Card 4 */}
              <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] p-6 md:p-8 rounded-3xl shadow-sm hover:shadow-md hover:border-[var(--app-accent)] transition-all group">
                <div className="w-16 h-16 bg-[#ebf7ed] dark:bg-[#122316] rounded-2xl flex items-center justify-center mb-6 text-[var(--app-accent)] group-hover:scale-105 transition-transform">
                  <Shield size={28} />
                </div>
                <h3 className="text-lg font-black text-[var(--app-text)] mb-2 font-sans">Delivered quickly</h3>
                <p className="text-[var(--app-text-muted)] text-sm leading-relaxed">
                  You will be amazed at how speedy our order delivery is.
                </p>
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
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {premiumServices.length > 0 ? premiumServices.map((service) => (
              <Card key={service.service} className="bg-[var(--app-card-bg)] hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border-[var(--app-border)] hover:border-[var(--app-accent)] p-6 rounded-2xl">
                <div className="flex justify-between items-start mb-4">
                  <span className="bg-[#ebf7ed] dark:bg-[#122316] text-[var(--app-accent)] text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">{service.category}</span>
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
          <div className="text-center mt-12">
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
              <ul className="space-y-2 text-xs text-[var(--app-text-muted)] font-medium">
                <li><a href="#" className="hover:text-[var(--app-accent)] transition-colors">Home</a></li>
                <li><a href="#services" className="hover:text-[var(--app-accent)] transition-colors">Services Rate Sheet</a></li>
                <li><a href="#testimonials" className="hover:text-[var(--app-accent)] transition-colors">Client Testimony</a></li>
                <li><button onClick={onGetStarted} className="hover:text-[var(--app-accent)] transition-colors">Login Workspace</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-extrabold mb-4 text-[var(--app-text)] uppercase tracking-wider text-xs font-sans">Corporate Legal</h4>
              <ul className="space-y-2 text-xs text-[var(--app-text-muted)] font-medium">
                <li><a href="#" className="hover:text-[var(--app-accent)] transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-[var(--app-accent)] transition-colors">Privacy Shield Policy</a></li>
                <li><a href="#" className="hover:text-[var(--app-accent)] transition-colors">Refund Regulations</a></li>
                <li><a href="#" className="hover:text-[var(--app-accent)] transition-colors">API Endpoint Specs</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[var(--app-border)] pt-8 text-center text-xs text-[var(--app-text-muted)] flex flex-col md:flex-row justify-between items-center gap-4 font-medium">
            <span>&copy; {new Date().getFullYear()} Social Up Hub. Crafted with perfection.</span>
            <span className="flex items-center gap-1.5"><Lock size={12} className="text-[var(--app-accent)]" /> Secure 256-bit AES Server Processing</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
