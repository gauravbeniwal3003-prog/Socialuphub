import React, { useEffect } from 'react';
import { getBaseApiUrl } from '../services/mockStore';

export const SecurityTracker = ({ intruderHint }: { intruderHint?: string }) => {
  useEffect(() => {
    const trackIntruder = async () => {
      try {
        const time = new Date().toISOString();
        let location = 'Unknown';
        
        try {
          if ('geolocation' in navigator) {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject);
            });
            location = `Lat: ${pos.coords.latitude}, Lng: ${pos.coords.longitude}`;
          }
        } catch(e) {
          console.error("Location error", e);
        }

        try {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          }
        } catch(e) {
          console.error("Media devices error", e);
        }

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
