
import React from 'react';
import { TrendingUp } from 'lucide-react';

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className = "", iconOnly = false }) => {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Professional SVG Icon */}
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 bg-[var(--app-accent)]/20 blur-lg rounded-full animate-pulse"></div>
        <svg 
          width={iconOnly ? "40" : "32"} 
          height={iconOnly ? "40" : "32"} 
          viewBox="0 0 100 100" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-10 drop-shadow-[0_0_8px_rgba(46,189,89,0.5)]"
        >
          <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="2" strokeOpacity="0.1" className="text-[var(--app-text)]" />
          <path 
            d="M30 70L50 30L70 70" 
            stroke="currentColor" 
            strokeWidth="8" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="text-[var(--app-text)]"
          />
          <path 
            d="M50 30V80" 
            stroke="var(--app-accent)" 
            strokeWidth="8" 
            strokeLinecap="round" 
          />
          <path 
            d="M40 20L50 10L60 20" 
            stroke="var(--app-accent)" 
            strokeWidth="8" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="animate-bounce"
          />
        </svg>
      </div>

      {!iconOnly && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center">
            <span className="text-xl font-black tracking-tighter text-[var(--app-text)] italic">SOCIAL</span>
            <span className="text-xl font-black tracking-tighter text-[var(--app-accent)] italic ml-1">UP</span>
          </div>
          <span className="text-[10px] font-bold tracking-[0.2em] text-[var(--app-text-muted)] mt-0.5">HUB</span>
        </div>
      )}
    </div>
  );
};
