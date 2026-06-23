
import { Service } from './types';

export const APP_NAME = "Social Up Hub";
export const CURRENCY_SYMBOL = "₹";
export const CONTACT_WHATSAPP_URL = "https://wa.me/919729480795";
export const INSTAGRAM_URL = "https://www.instagram.com/socialuphub?igsh=MWdla3BxOXZvajEydA==";

// Razorpay Config
export const RAZORPAY_KEY_ID = "rzp_live_RzLdEkePrpnfd4";
export const RAZORPAY_MERCHANT_NAME = "Social Up Hub";
// Secret Key moved to Backend (Supabase Edge Function)

// SMM API Configuration
export const SMM_API_URL = "https://socialuphub-backend.onrender.com/api/v2"; // Masked SMM API URL
// SMM_API_KEY moved to Backend for security

// Initial fallback services (used if API fails or DB empty)
export const INITIAL_SERVICES: Service[] = [
  { service: "101", category: "Instagram Followers", name: "Instagram Followers [Real]", rate: 45.00, min: 10, max: 50000, type: "Default", isEnabled: true },
  { service: "102", category: "Instagram Followers", name: "Instagram Followers [Super Fast] [Non-Drop]", rate: 80.00, min: 50, max: 20000, type: "Default", isEnabled: true },
  { service: "201", category: "Instagram Likes", name: "Instagram Likes [Real Mixed] [Instant]", rate: 8.50, min: 20, max: 10000, type: "Default", isEnabled: true },
  { service: "202", category: "Instagram Likes", name: "Instagram Likes [Indian]", rate: 25.00, min: 10, max: 5000, type: "Default", isEnabled: true },
  { service: "301", category: "Instagram Views", name: "Instagram Reels Views [Instant]", rate: 1.20, min: 100, max: 1000000, type: "Default", isEnabled: true },
  { service: "401", category: "YouTube Subscribers", name: "YouTube Subscribers [Non-Drop] [Slow]", rate: 850.00, min: 100, max: 2000, type: "Default", isEnabled: true },
  { service: "501", category: "Telegram Members", name: "Telegram Channel Members [0 Drop]", rate: 120.00, min: 100, max: 20000, type: "Default", isEnabled: true },
];

export const ALLOWED_UPI_APPS = [
  "Google Pay", "Fam Pay", "Paytm", "Navi", "Pop UPI"
];