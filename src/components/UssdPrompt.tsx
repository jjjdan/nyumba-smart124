import React from 'react';
import { Smartphone, Loader2, ShieldCheck } from 'lucide-react';

interface UssdPromptProps {
  isOpen: boolean;
  amount: number;
  paymentTarget: string;
  provider: 'MTN Mobile Money' | 'Airtel Money' | 'Bank Transfer';
  phoneNumber: string;
  onCancel: () => void;
}

/**
 * Paystack sends an MTN/Airtel approval prompt to the customer's phone.
 * This modal only shows that we're waiting — the PIN is entered on the phone.
 */
export default function UssdPrompt({
  isOpen,
  amount,
  paymentTarget,
  provider,
  phoneNumber,
  onCancel
}: UssdPromptProps) {
  if (!isOpen) return null;

  const formattedAmount = 'Shs ' + amount.toLocaleString();
  const providerLabel =
    provider === 'MTN Mobile Money' ? 'MTN MoMo' :
    provider === 'Airtel Money' ? 'Airtel Money' : 'Bank Transfer';

  return (
    <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 select-none">
      <div className="bg-[#121217] border border-amber-500/35 rounded-2xl p-6 w-full max-w-[320px] shadow-2xl space-y-4 animate-scaleUp">

        <div className="flex items-center justify-between text-amber-400 border-b border-white/5 pb-2">
          <span className="text-[10px] font-mono uppercase tracking-wider font-bold">
            ⚡ {providerLabel} · PAYSTACK
          </span>
          <Smartphone className="w-4 h-4" />
        </div>

        <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          <div className="space-y-1">
            <span className="block text-xs font-bold text-white">WAITING FOR APPROVAL</span>
            <span className="block text-[10px] text-gray-400">
              A {providerLabel} prompt was sent to <strong className="text-amber-200">{phoneNumber}</strong>
            </span>
          </div>
          <p className="text-[9px] text-gray-500 max-w-[220px] leading-relaxed">
            Enter your mobile money PIN on your phone to pay{' '}
            <strong className="text-white">{formattedAmount}</strong> to your landlord&apos;s
            Paystack business. This app never sees your PIN.
          </p>
        </div>

        <div className="bg-[#0B0B0E] border border-white/5 rounded-xl p-3.5 space-y-2 text-center text-gray-200">
          <h4 className="text-[11px] font-extrabold leading-snug">
            Pay <span className="text-white font-mono">{formattedAmount}</span>
          </h4>
          <p className="text-[10px] text-gray-400">
            For: <strong className="text-amber-200">{paymentTarget}</strong>
          </p>
          <div className="flex items-center justify-center gap-1.5 py-1 px-2.5 rounded bg-neutral-900/50 text-[9px] text-emerald-300 border border-white/5 mt-1">
            <ShieldCheck className="w-3 h-3" />
            <span>Money goes straight to your landlord — not Nyumba Smart</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white text-xs font-bold font-mono transition-colors cursor-pointer"
        >
          CLOSE (payment may still complete)
        </button>

      </div>
    </div>
  );
}
