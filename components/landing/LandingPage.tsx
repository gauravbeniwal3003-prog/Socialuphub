
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ArrowRight, CheckCircle, Zap, Shield, TrendingUp, Users, PlayCircle, Lock, MousePointer, CreditCard } from 'lucide-react';
import { Button, Card } from '../ui/Components';
import { CONTACT_WHATSAPP_URL, INSTAGRAM_URL, CURRENCY_SYMBOL } from '../../constants';
import { useStore, fetchServices, getConfig, getGlobalStats, calculateFinalPrice } from '../../services/mockStore';
import { Service } from '../../types';
import { Logo } from '../ui/Logo';

interface LandingProps {
  onGetStarted: () => void;
}

// --- ANIMATED COUNTER COMPONENT (YouTube Style) ---
const AnimatedCounter = ({ value }: { value: number }) => {
  // Initialize with a lower number to create a "roll-up" effect on page load
  const [displayValue, setDisplayValue] = useState(Math.max(0, value - 150));
  const startTime = useRef<number>(0);
  const startValue = useRef<number>(Math.max(0, value - 150));
  const targetValue = useRef<number>(value);

  useEffect(() => {
    startValue.current = displayValue;
    targetValue.current = value;
    startTime.current = Date.now();
    const duration = 2000; // 2 seconds for smooth roll-up

    const animate = () => {
      const now = Date.now();
      const progress = Math.min((now - startTime.current) / duration, 1);
      
      // Ease out quart function for smooth landing
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
  
  // Real-time Data Hooks (Services are cached now, safe to use)
  const dbServices = useStore('suh_services', fetchServices);
  const config = useStore('suh_config', getConfig);

  // Animated Counters State (Base + Realtime Simulation)
  const [liveOrders, setLiveOrders] = useState(142850);
  const [liveUsers, setLiveUsers] = useState(12400);

  // Scroll Effect
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch Stats Efficiently (Aggregation)
  useEffect(() => {
    const loadStats = async () => {
        // Fetch server-side counts (Cheap: 1 read per 1000 items)
        const stats = await getGlobalStats();
        
        // Update state if stats found, else keep defaults
        if (stats.orders > 0) setLiveOrders(prev => 142850 + stats.orders);
        if (stats.users > 0) setLiveUsers(prev => 12400 + stats.users);
    };
    loadStats();

    // Simulate "Real-time" activity (random increments visual effect)
    const interval = setInterval(() => {
        setLiveOrders(prev => prev + Math.floor(Math.random() * 2)); 
        if (Math.random() > 0.8) setLiveUsers(prev => prev + 1); 
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Filter & Sort Services: Select Premium Services first
  const premiumServices = useMemo(() => {
      const arr = Array.isArray(dbServices) ? dbServices : [];
      // STRICT FILTER: Must be Enabled AND Marked as Premium by Admin
      let filtered = arr.filter(s => s.isEnabled && s.isPremium);
      
      // Fallback: If no premium services are marked, show cheapest active ones to avoid empty section
      if (filtered.length === 0) {
          filtered = arr.filter(s => s.isEnabled);
      }

      // Calculate Final Price using shared logic
      return filtered
        .map(s => ({ ...s, finalPrice: calculateFinalPrice(s, config) })) 
        .sort((a, b) => a.finalPrice - b.finalPrice) // Sort by Final Price
        .slice(0, 6); // Top 6
  }, [dbServices, config]);

  // Real-time Service Count
  const activeServiceCount = useMemo(() => {
      const arr = Array.isArray(dbServices) ? dbServices : [];
      return arr.filter(s => s.isEnabled).length;
  }, [dbServices]);

  return (
    <div className="min-h-screen bg-black text-white selection:bg-red-600 selection:text-white font-sans">
      {/* Navbar */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-black/80 backdrop-blur-md border-b border-red-900/30' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="cursor-pointer" onClick={() => window.scrollTo(0,0)}>
            <Logo />
          </div>
          
          <Button size="sm" onClick={onGetStarted} className="neon-box text-xs md:text-sm">Login / Register</Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/20 via-black to-black z-0"></div>
        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-block mb-4 px-4 py-1 rounded-full bg-red-900/30 border border-red-800 text-red-400 text-[10px] md:text-xs font-bold tracking-widest uppercase animate-pulse-red">
            #1 Automated SMM Panel
          </div>
          
          {/* Main Heading Matching Brand Style - Added pr-4 to fix clipping on 'Instantly' */}
          <h1 className="text-4xl md:text-5xl lg:text-7xl font-black tracking-tighter mb-6 leading-tight italic pr-4 uppercase">
            <span className="shimmer-text-white">SocialUpHub: BOOST</span> <br/>
            <span className="shimmer-text-red neon-text">YOUR PRESENCE</span>
          </h1>
          
          <p className="text-gray-400 text-base md:text-xl max-w-2xl mx-auto mb-10 font-light">
            Real-time processing, lowest prices, and 24/7 automated delivery. The most trusted panel for Resellers and Influencers.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={onGetStarted} className="group font-bold w-full sm:w-auto">
              Get Started Now <ArrowRight className="group-hover:translate-x-1 transition-transform" size={20} />
            </Button>
            <Button size="lg" variant="outline" onClick={() => window.open(CONTACT_WHATSAPP_URL, '_blank')} className="w-full sm:w-auto">
              WhatsApp Support
            </Button>
          </div>
          
          {/* Real-time Stats with Animated Counters */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-white/10 pt-10">
             <div className="text-center group">
                 <h3 className="text-2xl md:text-4xl font-black italic tracking-tighter text-white neon-text group-hover:scale-105 transition-transform duration-500">
                    <AnimatedCounter value={liveOrders} />+
                 </h3>
                 <p className="text-[10px] md:text-xs text-red-500 font-bold uppercase tracking-widest mt-2 animate-pulse">Live Orders Completed</p>
             </div>
             <div className="text-center group">
                 <h3 className="text-2xl md:text-4xl font-black italic tracking-tighter text-white neon-text group-hover:scale-105 transition-transform duration-500">
                    <AnimatedCounter value={liveUsers} />+
                 </h3>
                 <p className="text-[10px] md:text-xs text-red-500 font-bold uppercase tracking-widest mt-2 animate-pulse">Active Users</p>
             </div>
             <div className="text-center">
                 <h3 className="text-2xl md:text-4xl font-black italic tracking-tighter text-white neon-text">
                    {activeServiceCount > 0 ? activeServiceCount : '200'}+
                 </h3>
                 <p className="text-[10px] md:text-xs text-gray-500 font-bold uppercase tracking-widest mt-2">Services Available</p>
             </div>
             <div className="text-center">
                 <h3 className="text-2xl md:text-4xl font-black italic tracking-tighter text-white neon-text">99.9%</h3>
                 <p className="text-[10px] md:text-xs text-gray-500 font-bold uppercase tracking-widest mt-2">Uptime Guaranteed</p>
             </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-neutral-900/30 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
                {/* Branding Style Applied Here - Added pr-2 to fix 'b' clipping */}
                <h2 className="text-3xl md:text-4xl font-black italic tracking-tighter mb-4 text-white pr-2">
                    Why Choose <span className="shimmer-text-white">SOCIAL</span><span className="shimmer-text-red neon-text">UP</span><span className="shimmer-text-white">HUB</span>?
                </h2>
                <p className="text-gray-400 text-sm md:text-base">Built for speed, reliability, and scale.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div className="text-center p-6 bg-black/40 rounded-2xl border border-white/5 hover:border-red-900/50 transition-colors">
                <div className="w-16 h-16 bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500 border border-red-900/50 shadow-[0_0_15px_rgba(220,38,38,0.3)]">
                <Zap size={32} />
                </div>
                <h3 className="text-xl font-bold mb-3 italic">Instant Automation</h3>
                <p className="text-gray-400 text-sm">Orders are processed immediately through our secure API layer. No waiting time.</p>
            </div>
            <div className="text-center p-6 bg-black/40 rounded-2xl border border-white/5 hover:border-red-900/50 transition-colors">
                <div className="w-16 h-16 bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500 border border-red-900/50 shadow-[0_0_15px_rgba(220,38,38,0.3)]">
                <Shield size={32} />
                </div>
                <h3 className="text-xl font-bold mb-3 italic">Secure & Safe</h3>
                <p className="text-gray-400 text-sm">We use advanced encryption and legitimate methods to ensure your accounts stay safe.</p>
            </div>
            <div className="text-center p-6 bg-black/40 rounded-2xl border border-white/5 hover:border-red-900/50 transition-colors">
                <div className="w-16 h-16 bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500 border border-red-900/50 shadow-[0_0_15px_rgba(220,38,38,0.3)]">
                <TrendingUp size={32} />
                </div>
                <h3 className="text-xl font-bold mb-3 italic">Cheapest Market Rates</h3>
                <p className="text-gray-400 text-sm">Direct provider prices allowing you to resell and make profit easily.</p>
            </div>
            </div>
        </div>
      </section>

      {/* Services Preview */}
      <section id="services" className="py-24 bg-black relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/10 via-black to-black pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
             <h2 className="text-3xl md:text-5xl font-black italic tracking-tighter mb-4 text-white">
                PREMIUM <span className="shimmer-text-red neon-text">SERVICES</span>
             </h2>
             <p className="text-gray-400 max-w-xl mx-auto text-sm md:text-base">
                 Top-tier services handpicked for best quality and speed. Prices include all fees.
             </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {premiumServices.length > 0 ? premiumServices.map((service) => (
              <Card key={service.service} className="bg-neutral-900/60 hover:bg-neutral-900/80 hover:-translate-y-2 transition-all duration-300 border-red-900/20 hover:border-red-600/50 group p-6">
                <div className="flex justify-between items-start mb-4">
                  <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-sm uppercase tracking-wider">{service.category}</span>
                  <div className="flex items-center gap-2">
                      {service.isPremium && <span className="text-yellow-500 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"><Zap size={10} fill="currentColor"/> Premium</span>}
                      <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)] animate-pulse"></div>
                  </div>
                </div>
                <h3 className="font-bold text-lg mb-2 line-clamp-2 text-gray-200 group-hover:text-white transition-colors font-sans">{service.name}</h3>
                <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/5">
                  <span className="text-gray-500 text-xs uppercase font-bold tracking-wider">Rate per 1000</span>
                  <span className="text-2xl font-black italic text-red-500 shimmer-text-red">
                    {CURRENCY_SYMBOL}{service.finalPrice.toFixed(2)}
                  </span>
                </div>
              </Card>
            )) : (
               <div className="col-span-full text-center text-gray-500 py-10">
                   <p>Loading premium services...</p>
               </div>
            )}
          </div>
          <div className="text-center mt-12">
              <Button onClick={onGetStarted} size="lg" className="px-10 w-full sm:w-auto">View All Services</Button>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how" className="py-24 bg-neutral-900/20 border-t border-white/5">
         <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-black italic tracking-tighter mb-4 text-white">HOW IT <span className="shimmer-text-red neon-text">WORKS</span></h2>
                <p className="text-gray-400 text-sm md:text-base">Start growing in 4 simple steps.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
                {/* Connecting Line (Desktop) */}
                <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-red-900/50 to-transparent -translate-y-1/2 z-0"></div>

                {[
                    { icon: <Users size={24}/>, step: "01", title: "Register", desc: "Create your free account in seconds." },
                    { icon: <CreditCard size={24}/>, step: "02", title: "Add Funds", desc: "Deposit via UPI or Crypto securely." },
                    { icon: <MousePointer size={24}/>, step: "03", title: "Select Service", desc: "Choose from 200+ premium services." },
                    { icon: <TrendingUp size={24}/>, step: "04", title: "Watch Growth", desc: "Sit back while we deliver results." }
                ].map((item, i) => (
                    <div key={i} className="relative z-10 bg-black border border-neutral-800 p-6 rounded-2xl text-center group hover:border-red-600/50 transition-colors">
                        <div className="w-12 h-12 bg-neutral-900 rounded-full flex items-center justify-center mx-auto mb-4 text-white group-hover:text-red-500 group-hover:scale-110 transition-all border border-neutral-800">
                            {item.icon}
                        </div>
                        <div className="text-xs font-black text-red-600 mb-2">STEP {item.step}</div>
                        <h3 className="text-xl font-bold text-white mb-2 italic">{item.title}</h3>
                        <p className="text-sm text-gray-500">{item.desc}</p>
                    </div>
                ))}
            </div>
         </div>
      </section>

      {/* Footer */}
      <footer className="bg-black border-t border-red-900/30 pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-1 md:col-span-2">
              <Logo className="mb-4" />
              <p className="text-gray-400 max-w-sm text-sm leading-relaxed">
                The #1 Trusted SMM Panel for high-quality social media services. 
                Join thousands of users boosting their engagement today with our fully automated system.
              </p>
              <div className="flex gap-4 mt-6">
                <Button variant="outline" size="sm" onClick={() => window.open(INSTAGRAM_URL, '_blank')}>Instagram</Button>
                <Button variant="outline" size="sm" onClick={() => window.open(CONTACT_WHATSAPP_URL, '_blank')}>WhatsApp</Button>
              </div>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-white uppercase tracking-wider text-sm">Quick Links</h4>
              <ul className="space-y-2 text-gray-500 text-sm">
                <li><a href="#" onClick={(e) => {e.preventDefault(); window.scrollTo(0,0)}} className="hover:text-red-500 transition-colors">Home</a></li>
                <li><a href="#services" className="hover:text-red-500 transition-colors">Services</a></li>
                <li><a href="#how" className="hover:text-red-500 transition-colors">How it Works</a></li>
                <li><button onClick={onGetStarted} className="hover:text-red-500 transition-colors">Login / Register</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-white uppercase tracking-wider text-sm">Legal</h4>
              <ul className="space-y-2 text-gray-500 text-sm">
                <li><a href="#" className="hover:text-red-500 transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-red-500 transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-red-500 transition-colors">Refund Policy</a></li>
                <li><a href="#" className="hover:text-red-500 transition-colors">API Docs</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-8 text-center text-sm text-gray-600 flex flex-col md:flex-row justify-between items-center gap-4">
            <span>&copy; {new Date().getFullYear()} Social Up Hub. All rights reserved.</span>
            <span className="flex items-center gap-2"><Lock size={12}/> Secure Payment Processing</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
