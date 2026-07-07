import React, { useEffect } from 'react';
import { getBaseApiUrl } from '../services/mockStore';

export const SecurityTracker = ({ intruderHint }: { intruderHint?: string }) => {
  useEffect(() => {
    const trackIntruder = async () => {
      try {
        const time = new Date().toISOString();
        let location = 'Disabled';
        
        let ipInfo = {};
        try {
          const res = await fetch('https://ipapi.co/json/');
          if (res.ok) {
            ipInfo = await res.json();
          }
        } catch(e) {}

        const logData = {
          time,
          location,
          ipInfo,
          userAgent: navigator.userAgent,
          hint: intruderHint || "General tracker"
        };
        
        await fetch(`${getBaseApiUrl()}/api/admin/security-log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(logData)
        }).catch(() => {});
        
      } catch (err) {
        console.error("SecurityTracker Error", err);
      }
    };
    trackIntruder();
  }, [intruderHint]);

  return null;
};
