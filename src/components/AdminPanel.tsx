import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Coins, 
  Building2, 
  Users, 
  ChevronLeft, 
  Check, 
  RefreshCw, 
  Database, 
  Terminal,
  Activity,
  FileText
} from 'lucide-react';
import { SubscriptionTier, DeveloperLog } from '../types';

interface AdminPanelProps {
  tiers: SubscriptionTier[];
  onUpdateTiers: (updatedTiers: SubscriptionTier[]) => void | Promise<void>;
  onExitAdmin: () => void;
  systemLogs: DeveloperLog[];
  onClearLogs: () => void;
  totalIncomeShs: number;
  propertiesCount: number;
  adminMomoDetails: string;
  adminBankDetails: string;
}

export default function AdminPanel({
  tiers,
  onUpdateTiers,
  onExitAdmin,
  systemLogs,
  onClearLogs,
  totalIncomeShs,
  propertiesCount,
  adminMomoDetails,
  adminBankDetails,
}: AdminPanelProps) {
  
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState<string>('');

  // Quick statistics calculation mock
  const totalLandlordsEstimated = Math.ceil(propertiesCount / 2.5) || 1;
  const totalTenantsEstimated = propertiesCount;

  const handleStartEdit = (tier: SubscriptionTier) => {
    setEditingTierId(tier.id);
    setEditingPrice(String(tier.pricePerMonth));
  };

  const handleSaveTier = (id: string) => {
    const updated = tiers.map(t => {
      if (t.id === id) {
        return {
          ...t,
          pricePerMonth: Math.max(0, parseInt(editingPrice) || 0)
        };
      }
      return t;
    });
    onUpdateTiers(updated);
    setEditingTierId(null);
  };


  return (
    <div className="w-full text-white bg-[#0A0A0C] min-h-screen p-4 sm:p-6 lg:p-8 flex flex-col font-sans select-none">
      
      {/* Header Container Area */}
      <div className="max-w-4xl mx-auto w-full flex-grow space-y-6">
        
        {/* Navigation back and Branding Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.05]">
          <button 
            onClick={onExitAdmin}
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-bold cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Close Admin Settings</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-bold uppercase tracking-widest flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" /> System Admin Panel
            </span>
          </div>
        </div>

        {/* System Big metrics Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          
          <div className="p-3 rounded-xl bg-[#121217] border border-white/[0.04]">
            <span className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider">Properties Managed</span>
            <div className="flex justify-between items-baseline mt-1">
              <span className="text-xl font-black font-mono tracking-tight text-white">{propertiesCount}</span>
              <Building2 className="w-4 h-4 text-indigo-400" />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#121217] border border-white/[0.04]">
            <span className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider">Active Landlords</span>
            <div className="flex justify-between items-baseline mt-1">
              <span className="text-xl font-black font-mono tracking-tight text-white">{totalLandlordsEstimated}</span>
              <Users className="w-4 h-4 text-amber-400" />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#121217] border border-white/[0.04]">
            <span className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider">Verified Tenants</span>
            <div className="flex justify-between items-baseline mt-1">
              <span className="text-xl font-black font-mono tracking-tight text-white">{totalTenantsEstimated}</span>
              <Check className="w-4 h-4 text-emerald-400" />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#121217] border border-[#10b981]/25 bg-emerald-500/[0.02]">
            <span className="block text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Total Income</span>
            <div className="flex justify-between items-baseline mt-1">
              <span className="text-xl font-black font-mono tracking-tight text-emerald-300">
                Shs {totalIncomeShs.toLocaleString()}
              </span>
              <Coins className="w-4 h-4 text-emerald-400 animate-pulse" />
            </div>
          </div>

        </div>

        {/* Content splits */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Main Left column: Configurations */}
          <div className="md:col-span-7 space-y-6">
            
            {/* Rate Modifier module */}
            <div className="p-4 rounded-xl bg-[#121217] border border-white/[0.04] space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider font-mono">
                    💰 Landlord Subscription Pricing Setup
                  </h3>
                  <p className="text-[10px] text-gray-400 font-medium">
                    Change prices in Ugandan Shillings (UGX) to modify what landlords are billed.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {tiers.map((tier) => (
                  <div key={tier.id} className="p-3 rounded-xl bg-[#16161D] border border-white/5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block text-xs font-bold text-white">{tier.name}</span>
                      <span className="block text-[9px] text-gray-400">
                        {tier.minUnits} to {tier.maxUnits} units managed
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrinkage-0">
                      {editingTierId === tier.id ? (
                        <>
                          <div className="flex items-center bg-[#0D0D11] border border-indigo-500/30 rounded-lg px-2 py-1 w-28">
                            <span className="text-[10px] text-neutral-500 mr-1 font-mono">Shs</span>
                            <input 
                              type="number"
                              value={editingPrice}
                              onChange={(e) => setEditingPrice(e.target.value)}
                              className="w-full bg-transparent text-xs text-white focus:outline-none font-mono font-bold"
                              placeholder="0"
                            />
                          </div>
                          <button 
                            onClick={() => handleSaveTier(tier.id)}
                            className="p-1 px-2 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/35 transition-colors cursor-pointer"
                          >
                            Save
                          </button>
                          <button 
                            onClick={() => setEditingTierId(null)}
                            className="p-1 px-2 text-[10px] font-medium bg-neutral-800 text-gray-400 rounded hover:bg-neutral-700 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs font-bold text-indigo-300 font-mono">
                            {tier.pricePerMonth === 0 ? 'Free' : `Shs ${tier.pricePerMonth.toLocaleString()}/mo`}
                          </span>
                          <button 
                            onClick={() => handleStartEdit(tier)}
                            className="text-[10px] text-indigo-400 font-bold hover:underline cursor-pointer"
                          >
                            Edit Rate
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payout Details Module */}
            <div className="p-4 rounded-xl bg-[#121217] border border-white/[0.04] space-y-3">
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                  💼 ADMIN SUBSCRIPTION PAYMENT CHANNELS
                </h3>
                <p className="text-[10px] text-gray-400 font-medium">
                  Where landlord subscription payments are collected. Configured via server environment
                  variables (<code className="text-amber-300">ADMIN_PAYOUT_MOMO</code>, <code className="text-indigo-300">ADMIN_PAYOUT_BANK</code>) — update and redeploy the backend to change these.
                </p>
              </div>

              <div className="space-y-3 font-sans">
                <div className="space-y-1">
                  <label className="text-[8.5px] font-bold text-gray-500 uppercase tracking-wider block">MTN MoMo Merchant Payout Details</label>
                  <div className="w-full bg-[#16161D] border border-white/5 rounded-xl px-3 py-1.5 text-xs font-mono text-amber-300 font-medium">
                    {adminMomoDetails}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[8.5px] font-bold text-gray-500 uppercase tracking-wider block">Bank Routing Payout Details</label>
                  <div className="w-full bg-[#16161D] border border-white/5 rounded-xl px-3 py-1.5 text-xs font-mono text-indigo-300 font-medium">
                    {adminBankDetails}
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Right column: Audits and Activity Terminal logs */}
          <div className="md:col-span-5 space-y-6">
            
            <div className="p-4 rounded-xl bg-[#121217] border border-white/[0.04] flex flex-col h-full min-h-[300px] justify-between">
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-gray-300 font-mono tracking-wider uppercase flex items-center gap-1">
                    <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                    Admin Live Trace Logs
                  </span>
                  
                  <button 
                    onClick={onClearLogs}
                    className="text-[9px] text-neutral-500 hover:text-red-400 transition-colors uppercase font-bold"
                  >
                    Clear History
                  </button>
                </div>

                {/* Simulated log console */}
                <div className="bg-[#0A0A0E] border border-white/5 rounded-lg p-2.5 h-64 overflow-y-auto font-mono text-[9px] space-y-2 select-text custom-scrollbar">
                  {systemLogs.length === 0 ? (
                    <span className="text-neutral-600 block text-center py-10">
                      No tracing logs received. Perform billing operations or tenant payments to stream network traces.
                    </span>
                  ) : (
                    systemLogs.map((log, i) => (
                      <div key={i} className="leading-relaxed border-b border-white/[0.02] pb-1">
                        <span className="text-neutral-500">[{log.timestamp}]</span>{' '}
                        <span className={`font-bold ${
                          log.type === 'ussd' ? 'text-amber-400' :
                          log.type === 'payment' ? 'text-emerald-400' :
                          log.type === 'auth' ? 'text-blue-400 font-bold' :
                          log.type === 'warn' ? 'text-red-400' : 'text-neutral-400'
                        }`}>
                          {log.type.toUpperCase()}
                        </span>:{' '}
                        <span className="text-neutral-300">{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-white/5 text-[10px] text-neutral-400 leading-snug">
                This console captures real-time African network provider triggers including <strong>USSD handshakes</strong>, SMS callback receipts, and collective unit checks. Use the mobile frame on the left to test live tenant checkouts.
              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
