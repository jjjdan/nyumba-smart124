import React from 'react';
import { 
  Building2, 
  Smartphone, 
  CheckCircle2, 
  ChevronRight, 
  ShieldCheck, 
  Sparkles, 
  Coins, 
  Wifi, 
  Key, 
  ArrowRight,
  Info 
} from 'lucide-react';
import { SubscriptionTier } from '../types';

interface LandingPageProps {
  tiers: SubscriptionTier[];
  onStartAuth: (role: 'landlord' | 'tenant') => void;
  onOpenAdminPortal: () => void;
}

export default function LandingPage({ tiers, onStartAuth, onOpenAdminPortal }: LandingPageProps) {
  return (
    <div className="w-full text-white bg-[#0D0D11] min-h-screen flex flex-col pt-4 overflow-x-hidden">
      {/* Visual Header Grid Wrapper */}
      <div className="max-w-4xl mx-auto px-4 w-full flex-grow flex flex-col justify-between py-6">
        
        {/* Branding & Logo Block */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/[0.04]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-600/30 border border-indigo-500/20 text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white leading-none">Nyumba Smart</h1>
              <span className="text-[9px] text-gray-500 font-mono">Uganda Home & Room Manager</span>
            </div>
          </div>

          <button 
            onClick={onOpenAdminPortal}
            className="text-[10px] bg-[#16161D] hover:bg-neutral-800 text-gray-400 font-semibold px-2.5 py-1.5 rounded-lg border border-white/5 flex items-center gap-1 transition-all cursor-pointer"
          >
            <Key className="w-3 h-3 text-indigo-400" />
            <span>Admin Login</span>
          </button>
        </div>

        {/* Hero Pitch Headline */}
        <div className="text-center space-y-3 my-4 flex flex-col items-center">
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg">
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-200 font-bold uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              Uganda's Finest Local-First Rental App
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300 font-bold uppercase tracking-wider animate-pulse">
              🎁 Promo: 3 Rooms Free for 1st Month!
            </div>
          </div>
          
          <h2 className="text-2xl font-black tracking-tight leading-tight sm:text-3xl">
            Manage Room Rentals <br/>
            <span className="bg-gradient-to-r from-indigo-400 via-amber-300 to-indigo-300 bg-clip-text text-transparent">
              With Zero Hustle
            </span>
          </h2>
          
          <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
            Beautifully made for landlords and tenants in Uganda. Collect rent instantly with MTN MoMo, Airtel Money, or direct bank transfer, using safe USSD pin prompts.
          </p>
        </div>

        {/* Call to Action Actions Grid */}
        <div className="grid grid-cols-2 gap-3.5 my-6">
          {/* Landlord Card */}
          <button 
            id="start-as-landlord"
            onClick={() => onStartAuth('landlord')}
            className="flex flex-col items-center justify-between text-center p-4 rounded-xl bg-gradient-to-br from-[#1C1C24] to-[#121217] border border-white/[0.04] hover:border-indigo-500/40 transition-all cursor-pointer group hover:scale-[1.01]"
          >
            <div className="p-3 rounded-full bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition-all mb-3">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <span className="block text-xs font-black text-white">I AM A LANDLORD</span>
              <span className="block text-[10px] text-gray-400">Create lease, issue Tenant Codes, monitor your monthly earnings</span>
            </div>
            <div className="mt-3.5 flex items-center text-[10px] text-indigo-400 font-bold group-hover:text-indigo-300">
              Enter Dashboard <ChevronRight className="w-3 h-3 ml-0.5" />
            </div>
          </button>

          {/* Tenant Card */}
          <button 
            id="start-as-tenant"
            onClick={() => onStartAuth('tenant')}
            className="flex flex-col items-center justify-between text-center p-4 rounded-xl bg-gradient-to-br from-[#1C1C24] to-[#121217] border border-white/[0.04] hover:border-indigo-500/40 transition-all cursor-pointer group hover:scale-[1.01]"
          >
            <div className="p-3 rounded-full bg-amber-500/10 text-amber-300 group-hover:bg-amber-500/20 transition-all mb-3">
              <Smartphone className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <span className="block text-xs font-black text-white">I AM A TENANT</span>
              <span className="block text-[10px] text-gray-400">Put in Landlord code, view monthly rent details, and pay with MoMo</span>
            </div>
            <div className="mt-3.5 flex items-center text-[10px] text-amber-300 font-bold group-hover:text-amber-200">
              Enter Dashboard <ChevronRight className="w-3 h-3 ml-0.5" />
            </div>
          </button>
        </div>

        {/* Feature Highlights - Simple English for Africans */}
        <div className="bg-[#121217] border border-white/[0.03] rounded-2xl p-4 space-y-3 my-4">
          <h3 className="text-[10px] text-indigo-400 tracking-widest uppercase font-bold text-center">
            HOW NYUMBA SMART MAKES LIFE EASIER
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="flex gap-2.5 items-start">
              <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400 mt-0.5 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-[11px] font-bold text-white">Very Safe USSD Code</h4>
                <p className="text-[10px] text-gray-400 leading-snug">
                  We don't keep your secret network PIN code. The app asks your phone to ask for your pin via USSD message safely.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 items-start">
              <div className="p-1 rounded-lg bg-indigo-500/10 text-indigo-400 mt-0.5 shrink-0">
                <Coins className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-[11px] font-bold text-white">Local Mobile Money</h4>
                <p className="text-[10px] text-gray-400 leading-snug">
                  Full support for MTN MoMo, Airtel Money, and local banks. No international cards or expensive setups.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 items-start">
              <div className="p-1 rounded-lg bg-amber-500/10 text-amber-400 mt-0.5 shrink-0">
                <Wifi className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-[11px] font-bold text-white">Landlord Quick Codes</h4>
                <p className="text-[10px] text-gray-400 leading-snug">
                  After signup, landlords get a direct connect code. Just share it with your tenants to link instantly.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Subscriptions Information & Localized Pricing */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/20 via-[#121217] to-indigo-950/20 border border-indigo-500/15 space-y-4 my-2">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-emerald-400 animate-pulse" />
                Landlord Monthly Pricing & Tiers
              </h3>
              <p className="text-[10px] text-gray-400 leading-snug">
                Based on collective room numbers. Subscription fees are always billed in Ugandan Shillings (Shs / UGX).
              </p>
            </div>
            
            <div className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20">
              🎁 FREE Trial: 3 Units Free for 1 Month!
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {tiers.map((tier) => (
              <div key={tier.id} className="p-2.5 rounded-xl bg-neutral-900/60 border border-white/[0.04] space-y-1.5 relative overflow-hidden flex flex-col justify-between">
                {tier.maxUnits <= 3 && (
                  <div className="absolute top-0 right-0 bg-emerald-500 text-[#0A0A0B] text-[7px] font-black px-1.5 py-0.5 rounded-bl">
                    TRIAL
                  </div>
                )}
                <div className="space-y-0.5">
                  <span className="block text-[10px] sm:text-[11px] font-bold text-gray-200 leading-tight">{tier.name}</span>
                  <span className="block text-[8px] sm:text-[9px] text-neutral-400">
                    For <strong className="text-indigo-300 font-mono font-bold">{tier.minUnits}-{tier.maxUnits} rooms</strong>
                  </span>
                </div>
                <div className="pt-1 border-t border-white/5 flex items-baseline gap-0.5">
                  <span className="text-xs sm:text-sm font-extrabold text-[#ffffff] font-mono">
                    {tier.pricePerMonth === 0 ? 'Free' : `${tier.pricePerMonth.toLocaleString()} UGX`}
                  </span>
                  {tier.pricePerMonth > 0 && <span className="text-[7px] text-gray-500">/mo</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="text-[10px] text-neutral-500 flex items-start gap-1 p-2 bg-[#0E0E14] rounded-lg">
            <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
            <span>
              <strong>African localized subscription policy:</strong> Billed strictly on space capacity. Up to 3 rooms can be managed entirely free for the first month to allow quick onboarding. No credit card details required to try out!
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
