
import React from 'react';
import { Check, AlertTriangle, X } from 'lucide-react';

// --- BUTTON ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, variant = 'primary', size = 'md', isLoading, className = '', ...props 
}) => {
  const base = "relative overflow-hidden font-semibold transition-all duration-300 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2";
  
  const variants = {
    primary: "bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)] hover:shadow-[0_0_25px_rgba(220,38,38,0.7)] border border-red-500/30",
    secondary: "bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700",
    danger: "bg-red-900/80 hover:bg-red-800 text-red-100 border border-red-700",
    outline: "bg-transparent border border-red-600 text-red-500 hover:bg-red-600/10 hover:text-red-400",
    success: "bg-green-900/80 hover:bg-green-800 text-green-100 border border-green-700"
  };
  
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-5 py-2.5 text-sm",
    lg: "px-8 py-4 text-base"
  };

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} disabled={isLoading || props.disabled} {...props}>
      {isLoading ? (
        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : children}
      {variant === 'primary' && !isLoading && (
        <span className="absolute inset-0 rounded-lg ring-1 ring-inset ring-white/10 pointer-events-none"></span>
      )}
    </button>
  );
};

// --- INPUT ---
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => (
  <div className="w-full">
    {label && <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">{label}</label>}
    <input 
      className={`w-full bg-neutral-900 border ${error ? 'border-red-500' : 'border-neutral-800 focus:border-red-600'} rounded-lg px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-red-600/50 transition-all ${className}`}
      {...props}
    />
    {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
  </div>
);

// --- CARD ---
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-neutral-900/60 backdrop-blur-md border border-red-900/20 rounded-xl p-6 shadow-xl ${className}`}>
    {children}
  </div>
);

// --- MODAL ---
export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-neutral-900 border border-red-900/40 rounded-2xl w-[95%] max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-red-900/20 shrink-0">
          <h3 className="text-xl font-bold text-white neon-text">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- BADGE ---
export const Badge: React.FC<{ children: React.ReactNode; variant?: 'success' | 'warning' | 'danger' | 'info' }> = ({ children, variant = 'info' }) => {
  const colors = {
    success: 'bg-green-900/30 text-green-400 border-green-800',
    warning: 'bg-yellow-900/30 text-yellow-400 border-yellow-800',
    danger: 'bg-red-900/30 text-red-400 border-red-800',
    info: 'bg-blue-900/30 text-blue-400 border-blue-800',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[variant]}`}>
      {children}
    </span>
  );
};

// --- BRAND TEXT ---
export const BrandText: React.FC<{ size?: string; className?: string }> = ({ size = 'text-2xl', className = '' }) => (
  <span className={`font-black italic tracking-tighter ${size} ${className}`}>
    <span className="shimmer-text-white">SOCIAL</span>
    <span className="shimmer-text-red neon-text">UP</span>
    <span className="shimmer-text-white">HUB</span>
  </span>
);

// --- NOTIFICATION ---
export const Notification: React.FC<{
  message: string;
  type?: 'success' | 'error';
  onClose: () => void;
}> = ({ message, type = 'success', onClose }) => {
  React.useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-6 right-6 z-[100] flex items-center gap-4 px-6 py-5 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] border backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-500 w-auto max-w-md ${
      type === 'success' 
        ? 'bg-neutral-950/90 border-green-500/30 text-white' 
        : 'bg-neutral-950/90 border-red-500/30 text-white'
    }`}>
      <div className={`p-3 rounded-full shrink-0 ${type === 'success' ? 'bg-green-500/10 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-red-500/10 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]'}`}>
        {type === 'success' ? <Check size={24} /> : <AlertTriangle size={24} />}
      </div>
      <div className="flex-1">
        <h4 className={`font-black text-sm uppercase tracking-widest mb-1 ${type === 'success' ? 'text-green-500' : 'text-red-500'}`}>{type === 'success' ? 'Order Successful' : 'Action Failed'}</h4>
        <p className="text-gray-300 text-sm font-medium leading-relaxed">{message}</p>
      </div>
      <button onClick={onClose} className="ml-4 text-gray-600 hover:text-white transition-colors p-1">
        <X size={20} />
      </button>
      <div className="absolute bottom-0 left-0 h-[2px] w-full bg-neutral-800 overflow-hidden rounded-b-xl">
         <style>{`
           @keyframes shrinkWidth { from { width: 100%; } to { width: 0%; } }
           .animate-shrink-width { animation-name: shrinkWidth; animation-timing-function: linear; animation-fill-mode: forwards; }
         `}</style>
         <div className={`h-full ${type === 'success' ? 'bg-green-500' : 'bg-red-500'} animate-shrink-width`} style={{ animationDuration: '5s' }}></div>
      </div>
    </div>
  );
};
