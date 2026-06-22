
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN'
}

export enum OrderStatus {
  PENDING = 'Pending',
  PROCESSING = 'Processing',
  COMPLETED = 'Completed',
  PARTIAL = 'Partial',
  CANCELED = 'Canceled',
  FAILED = 'Failed'
}

export interface User {
  id: string;
  email: string;
  name: string;
  mobile: string; 
  role: UserRole;
  balance: number;
  totalSpent: number;
  lastLogin?: string;
  isBanned: boolean;
  banReason?: string;
  banExpires?: string;
  createdAt: string;
  lastPaymentAt?: string;
  ip?: string;
  api_key?: string;
  
  // Referral System
  referral_code?: string;
  referred_by?: string; // ID of the referrer
  referral_balance: number;
  total_referral_earnings: number;
}

export interface Service {
  service: string; 
  name: string;
  category: string;
  rate: number; 
  min: number;
  max: number;
  type: string;
  isEnabled: boolean;
  isPremium?: boolean; // Controls visibility on Landing Page
  description?: string;
  sortOrder?: number;
  customMarginPercent?: number;
  customMarginFixed?: number;
}

export interface Order {
  id: string;
  externalId?: string; 
  userId: string;
  serviceId: string;
  serviceName: string;
  link: string;
  quantity: number;
  charge: number; 
  originalCharge?: number; 
  couponCode?: string; 
  start_count: number;
  remains?: number;
  status: OrderStatus;
  date: string;
  error?: string;
}

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  type: 'DEPOSIT' | 'REFUND' | 'SPEND' | 'ADJUSTMENT' | 'REFERRAL_PAYOUT' | 'REFERRAL_COMMISSION';
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'REVERTED';
  method: string; 
  paymentId?: string; 
  utr?: string; 
  date: string;
  ip?: string;
}

export type CouponCategory = 'DEPOSIT' | 'ORDER';

export interface Coupon {
  code: string;
  category: CouponCategory; 
  type: 'PERCENTAGE' | 'FIXED';
  value: number; 
  minAmount: number; 
  expiryDate?: string; 
  usageLimit: number; 
  usedBy: string[]; 
  isEnabled: boolean;
}

export interface GlobalConfig {
  globalMarginPercent: number;
  globalMarginFixed: number;
  maintenanceMode: boolean;
  
  // Custom Dynamic Theme & Backend URL Configs
  themeBg?: string;
  themeDarkBg?: string;
  themeAccent?: string;
  renderBackendUrl?: string;
  landingVideoUrl?: string;

  // Referral Config
  referralSignupBonus: number;
  referralDepositBonus: number; // Used as % commission now
  referralMinDeposit: number;
  isReferralSystemEnabled: boolean;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isEnabled: boolean;
  isPinned: boolean;
}

export interface PaymentSession {
  id: string;
  userId: string;
  amount: number;
  status: string;
}

export interface ReferralReward {
    id: string;
    referrer_id: string;
    referred_user_id: string;
    amount: number;
    reward_type: 'SIGNUP' | 'DEPOSIT' | 'COMMISSION';
    created_at: string;
}