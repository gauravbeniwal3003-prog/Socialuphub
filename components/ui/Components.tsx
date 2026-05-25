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
  const base = "relative overflow-hidden font-semibold transition-all duration-300 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl flex items-center justify-center gap-2";
  
  const variants = {
    primary: "bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-white shadow-[0_4px_14px_rgba(46,189,89,0.3)] border border-[var(--app-accent)]/20",
    secondary: "bg-[var(--app-input-bg)] hover:bg-[var(--app-border)] text-[var(--app-text)] border border-[var(--app-border)]",
    danger: "bg-red-600 hover:bg-red-700 text-white border border-red-500",
    outline: "bg-transparent border border-[var(--app-accent)] text-[var(--app-accent)] hover:bg-[var(--app-accent)]/10 font-semibold",
    success: "bg-green-600 hover:bg-green-700 text-white border border-green-500"
  };
  
  const sizes = {
    sm: "px-3.5 py-2 text-xs",
    md: "px-5 py-2.5 text-sm",
    lg: "px-8 py-3.5 text-base"
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
        <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10 pointer-events-none"></span>
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
    {label && <label className="block text-xs font-bold text-[var(--app-text-muted)] mb-1.5 uppercase tracking-wider">{label}</label>}
    <input 
      className={`w-full bg-[var(--app-input-bg)] border ${error ? 'border-red-500' : 'border-[var(--app-border)] focus:border-[var(--app-accent)]'} rounded-xl px-4 py-3 text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--app-accent)]/50 transition-all ${className}`}
      {...props}
    />
    {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
  </div>
);

// --- CARD ---
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-2xl p-6 shadow-sm ${className}`}>
    {children}
  </div>
);

// --- MODAL ---
export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-2xl w-[95%] max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-[var(--app-border)] shrink-0">
          <h3 className="text-xl font-extrabold text-[var(--app-text)]">{title}</h3>
          <button onClick={onClose} className="text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar text-[var(--app-text)]">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- BADGE ---
export const Badge: React.FC<{ children: React.ReactNode; variant?: 'success' | 'warning' | 'danger' | 'info' }> = ({ children, variant = 'info' }) => {
  const colors = {
    success: 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900/30',
    warning: 'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-900/30',
    danger: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/30',
    info: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900/30',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colors[variant]}`}>
      {children}
    </span>
  );
};

// --- BRAND TEXT ---
export const BrandText: React.FC<{ size?: string; className?: string }> = ({ size = 'text-2xl', className = '' }) => (
  <span className={`font-black italic tracking-tighter ${size} ${className}`}>
    <span className="text-[var(--app-text)]">SOCIAL</span>
    <span className="text-[var(--app-accent)] italic ml-1">UP</span>
    <span className="text-[var(--app-text)] ml-1">HUB</span>
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
    <div className={`fixed top-6 right-6 z-[100] flex items-center gap-4 px-6 py-5 rounded-2xl shadow-xl border backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-500 w-auto max-w-md ${
      type === 'success' 
        ? 'bg-[var(--app-card-bg)] border-[var(--app-accent)]/30 text-[var(--app-text)]' 
        : 'bg-[var(--app-card-bg)] border-red-500/35 text-[var(--app-text)]'
    }`}>
      <div className={`p-3 rounded-full shrink-0 ${type === 'success' ? 'bg-[#ebf7ed] text-[var(--app-accent)]' : 'bg-red-50 text-red-600'}`}>
        {type === 'success' ? <Check size={24} /> : <AlertTriangle size={24} />}
      </div>
      <div className="flex-1">
        <h4 className={`font-black text-sm uppercase tracking-wider mb-1 ${type === 'success' ? 'text-[var(--app-accent)]' : 'text-red-500'}`}>{type === 'success' ? 'Successful' : 'Action Failed'}</h4>
        <p className="text-[var(--app-text-muted)] text-sm font-medium leading-relaxed">{message}</p>
      </div>
      <button onClick={onClose} className="ml-4 text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors p-1">
        <X size={20} />
      </button>
      <div className="absolute bottom-0 left-0 h-[2px] w-full bg-[var(--app-border)] overflow-hidden rounded-b-2xl">
         <style>{`
           @keyframes shrinkWidth { from { width: 100%; } to { width: 0%; } }
           .animate-shrink-width { animation-name: shrinkWidth; animation-timing-function: linear; animation-fill-mode: forwards; }
         `}</style>
         <div className={`h-full ${type === 'success' ? 'bg-[var(--app-accent)]' : 'bg-red-500'} animate-shrink-width`} style={{ animationDuration: '5s' }}></div>
      </div>
    </div>
  );
};
