import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Coins,
  Activity,
  Users,
  UserCheck,
  Smartphone,
  ChevronRight,
  FileText,
  Plus,
  Trash2,
  Settings,
  Key,
  RefreshCw,
  LogOut,
  Clock,
  Sparkles,
  ArrowRight,
  Lock,
  Mail,
  Phone,
  MapPin,
  AlertTriangle,
  Check,
  CheckCircle2,
  Receipt,
  PlusCircle,
  HelpCircle,
  Cpu,
  Eye,
  EyeOff,
  Wifi,
  WifiOff
} from 'lucide-react';

import {
  UserProfile,
  Property,
  FinancialRecord,
  Complaint,
  DeveloperLog,
  SubscriptionTier,
  InAppMessage
} from './types';

import LandingPage from './components/LandingPage';
import AdminPanel from './components/AdminPanel';
import UssdPrompt from './components/UssdPrompt';

import { useAuth } from './hooks/useAuth';
import { ApiError } from './api/client';
import * as propertiesApi from './api/properties';
import * as paymentsApi from './api/payments';
import * as complaintsApi from './api/complaints';
import * as messagesApi from './api/messages';
import * as adminApi from './api/admin';

// Default pricing tiers shown before the real values load from the
// backend (admin can change these via /api/admin/tiers).
const DEFAULT_PRICING_TIERS: SubscriptionTier[] = [
  { id: 'tier-trial', name: 'Free Trial Plan', minUnits: 1, maxUnits: 3, pricePerMonth: 0 },
  { id: 'tier-standard', name: 'Standard Sanyu Level', minUnits: 4, maxUnits: 10, pricePerMonth: 25000 },
  { id: 'tier-premium-i', name: 'Premium Plaza Level I', minUnits: 11, maxUnits: 25, pricePerMonth: 45000 },
  { id: 'tier-premium-ii', name: 'Premium Plaza Level II', minUnits: 26, maxUnits: 50, pricePerMonth: 70000 },
  { id: 'tier-mega-i', name: 'Enterprise Mega Level I', minUnits: 51, maxUnits: 150, pricePerMonth: 110000 },
  { id: 'tier-mega-ii', name: 'Enterprise Mega Level II', minUnits: 151, maxUnits: 500, pricePerMonth: 180000 }
];

// Offline queues persist in localStorage — this is the ONE legitimate
// use of localStorage left: a holding pen for records captured with no
// connection, until they can be POSTed to /payments/sync or /complaints/sync.
const OFFLINE_PAYMENTS_KEY = 'sl_offline_payment_queue';
const OFFLINE_COMPLAINTS_KEY = 'sl_offline_complaint_queue';

function loadOfflineQueue<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function saveOfflineQueue<T>(key: string, items: T[]) {
  localStorage.setItem(key, JSON.stringify(items));
}

export default function App() {
  // ==========================================
  // AUTH (real session, backed by JWT)
  // ==========================================

  const {
    currentUser,
    isAuthenticated,
    isLoadingSession,
    login,
    register,
    logout,
    setCurrentUser,
  } = useAuth();

  // ==========================================
  // MASTER APPLICATION STATE & PERSISTENCE
  // ==========================================

  const [activeView, setActiveView] = useState<'landing' | 'landlord' | 'tenant' | 'admin'>('landing');

  // Subscription pricing tiers — loaded from /api/admin/tiers for admins,
  // otherwise shown using the defaults above (the actual amount charged
  // is always computed server-side at /api/subscriptions/pay).
  const [pricingTiers, setPricingTiers] = useState<SubscriptionTier[]>(DEFAULT_PRICING_TIERS);

  // Admin Payout Setup — loaded from /api/admin/payout-settings
  const [adminMomoDetails, setAdminMomoDetails] = useState<string>('Loading...');
  const [adminBankDetails, setAdminBankDetails] = useState<string>('Loading...');

  // Landlord Paystack Payment Settings (encrypted secret key stored server-side)
  const [paystackConnected, setPaystackConnected] = useState<boolean>(false);
  const [paystackKeyHint, setPaystackKeyHint] = useState<string | null>(null);
  const [paystackSecretInput, setPaystackSecretInput] = useState<string>('');
  const [paystackSettingsBusy, setPaystackSettingsBusy] = useState<boolean>(false);
  const [showPaystackKey, setShowPaystackKey] = useState<boolean>(false);

  // Interactive admin simulation perspective on the phone mockup
  const [adminSimulatedRole, setAdminSimulatedRole] = useState<'landlord' | 'tenant'>('landlord');

  // Tenant desktop panel selected payment channel state
  const [paymentMethod, setPaymentMethod] = useState<'MTN Mobile Money' | 'Airtel Money' | 'Bank Transfer'>('MTN Mobile Money');
  const [billingPaymentMethod, setBillingPaymentMethod] = useState<'MTN Mobile Money' | 'Airtel Money'>('MTN Mobile Money');

  // ==========================================
  // SERVER-BACKED DATA (fetched via REST API)
  // ==========================================

  const [properties, setProperties] = useState<Property[]>([]);
  const [financials, setFinancials] = useState<FinancialRecord[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [inAppMessages, setInAppMessages] = useState<InAppMessage[]>([]);
  const [smsMessageBill, setSmsMessageBill] = useState<number>(0);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);

  // Trace logs for admin inspection panel (client-side only — useful for
  // debugging the UI flow, not a substitute for the backend audit log)
  const [traceLogs, setTraceLogs] = useState<DeveloperLog[]>([]);

  // Simulation controls state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [wifiConnected, setWifiConnected] = useState<boolean>(true);
  const [currentClockTime, setCurrentClockTime] = useState<string>('12:00');

  // Offline queues (payments / complaints captured with no connection)
  const [offlinePayments, setOfflinePayments] = useState<paymentsApi.OfflineRecord[]>(() =>
    loadOfflineQueue<paymentsApi.OfflineRecord>(OFFLINE_PAYMENTS_KEY)
  );
  const [offlineComplaints, setOfflineComplaints] = useState<complaintsApi.OfflineComplaint[]>(() =>
    loadOfflineQueue<complaintsApi.OfflineComplaint>(OFFLINE_COMPLAINTS_KEY)
  );

  // Interactive dialog overlays & inputs
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [selectedAuthRole, setSelectedAuthRole] = useState<'landlord' | 'tenant' | 'admin'>('landlord');
  const [authMailInput, setAuthMailInput] = useState<string>('');
  const [authPassInput, setAuthPassInput] = useState<string>('');
  const [authPhoneInput, setAuthPhoneInput] = useState<string>('+256 7');
  const [authNameInput, setAuthNameInput] = useState<string>('');
  const [authLandlordCodeInput, setAuthLandlordCodeInput] = useState<string>('');
  const [showPassRaw, setShowPassRaw] = useState<boolean>(false);
  const [authBusy, setAuthBusy] = useState<boolean>(false);

  // Paystack / Payment Status Modal State
  // Paystack triggers an MTN/Airtel prompt on the CUSTOMER'S OWN PHONE.
  // This modal waits for approval and polls the backend — it does NOT collect a PIN.
  const [ussdOpen, setUssdOpen] = useState<boolean>(false);
  const [ussdAmount, setUssdAmount] = useState<number>(0);
  const [ussdTargetName, setUssdTargetName] = useState<string>('');
  const [ussdProvider, setUssdProvider] = useState<'MTN Mobile Money' | 'Airtel Money' | 'Bank Transfer'>('MTN Mobile Money');
  const [ussdPhone, setUssdPhone] = useState<string>('');
  const [ussdTransactionId, setUssdTransactionId] = useState<string | null>(null);
  const [ussdCallback, setUssdCallback] = useState<(record: FinancialRecord | null) => void>(() => {});

  // App UI state
  const [landlordActiveTab, setLandlordActiveTab] = useState<'units' | 'cash' | 'tickets' | 'billing'>('units');
  const [tenantActiveTab, setTenantActiveTab] = useState<'rent' | 'history' | 'ticket'>('rent');

  // Push notifications permission state
  const [notificationPermission, setNotificationPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');

  const [customSMSBody, setCustomSMSBody] = useState<string>('');

  // Add properties form input
  const [newPropName, setNewPropName] = useState('');
  const [newPropAddress, setNewPropAddress] = useState('');
  const [newPropTenant, setNewPropTenant] = useState('');
  const [newPropTenantPhone, setNewPropTenantPhone] = useState('+256 7');
  const [newPropRent, setNewPropRent] = useState('');

  // Complaint ticket inputs
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketCategory, setTicketCategory] = useState<'Plumbing' | 'Electricity' | 'Water' | 'Rent Issue' | 'Other'>('Plumbing');
  const [ticketPriority, setTicketPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');

  // Triggering visual printed receipts overlay
  const [receiptOverlayItem, setReceiptOverlayItem] = useState<FinancialRecord | null>(null);
  const [systemToastMessage, setSystemToastMessage] = useState<string | null>(null);

  // ==========================================
  // SYSTEM HELPER FUNCTIONS
  // ==========================================

  const showShortToast = (msg: string) => {
    setSystemToastMessage(msg);
    setTimeout(() => setSystemToastMessage(null), 3500);
  };

  const pushTrace = (message: string, type: DeveloperLog['type'] = 'system') => {
    const format = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    setTraceLogs(prev => [
      { timestamp: format, type, message },
      ...prev
    ].slice(0, 30));
  };

  /** Normalizes "+256 772 112233" style input to "+256772112233" for the API. */
  const normalizePhone = (phone: string) => phone.replace(/\s+/g, '');

  /** Surfaces ApiError messages (validation, auth, etc.) consistently. */
  const describeError = (err: unknown): string => {
    if (err instanceof ApiError) {
      if (err.details?.length) {
        return err.details.map((d: any) => d.message).join(', ');
      }
      return err.message;
    }
    if (err instanceof Error) return err.message;
    return 'Something went wrong. Please try again.';
  };

  // ==========================================
  // DATA LOADING — fetches role-appropriate data from the API
  // ==========================================

  const refreshData = useCallback(async () => {
    if (!currentUser) return;
    setIsLoadingData(true);
    setDataLoadError(null);

    try {
      const tasks: Promise<void>[] = [];

      tasks.push(propertiesApi.listProperties().then(setProperties));
      tasks.push(paymentsApi.listFinancials().then(setFinancials));
      tasks.push(complaintsApi.listComplaints().then(setComplaints));

      if (currentUser.role !== 'admin') {
        tasks.push(messagesApi.listMessages().then(setInAppMessages).catch(() => setInAppMessages([])));
      }

      if (currentUser.role === 'landlord') {
        tasks.push(
          messagesApi.getSmsBilling()
            .then(b => setSmsMessageBill(b.outstanding))
            .catch(() => setSmsMessageBill(0))
        );
        tasks.push(
          paymentsApi.getPaymentSettings()
            .then(s => {
              setPaystackConnected(s.connected);
              setPaystackKeyHint(s.keyHint);
            })
            .catch(() => {
              setPaystackConnected(false);
              setPaystackKeyHint(null);
            })
        );
      }

      if (currentUser.role === 'admin') {
        tasks.push(adminApi.listTiers().then(t => { setPricingTiers(t); }).catch(() => {}));
        tasks.push(
          adminApi.getPayoutSettings().then(s => {
            setAdminMomoDetails(s.momoDetails);
            setAdminBankDetails(s.bankDetails);
          }).catch(() => {
            setAdminMomoDetails('Not configured');
            setAdminBankDetails('Not configured');
          })
        );
      }

      await Promise.all(tasks);
      pushTrace('Synced latest data from Nyumba Smart API.', 'success');
    } catch (err) {
      const msg = describeError(err);
      setDataLoadError(msg);
      pushTrace(`Data load error: ${msg}`, 'warn');
    } finally {
      setIsLoadingData(false);
    }
  }, [currentUser]);

  // Load data whenever the authenticated user changes (login, refresh restore)
  useEffect(() => {
    if (currentUser) {
      refreshData();
    }
  }, [currentUser?.id]);

  // Route to the correct workspace once session restore completes
  useEffect(() => {
    if (!isLoadingSession && currentUser && activeView === 'landing') {
      setActiveView(currentUser.role);
    }
  }, [isLoadingSession, currentUser]);

  // Persist offline queues locally
  useEffect(() => {
    saveOfflineQueue(OFFLINE_PAYMENTS_KEY, offlinePayments);
  }, [offlinePayments]);

  useEffect(() => {
    saveOfflineQueue(OFFLINE_COMPLAINTS_KEY, offlineComplaints);
  }, [offlineComplaints]);

  // ==========================================
  // CLOCK
  // ==========================================

  useEffect(() => {
    const runClock = () => {
      const d = new Date();
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      setCurrentClockTime(`${h}:${m}`);
    };
    runClock();
    const clockTimer = setInterval(runClock, 2000);
    pushTrace('Nyumba Smart connected to live API backend.', 'system');
    return () => clearInterval(clockTimer);
  }, []);

  // ==========================================
  // SIGN IN & IDENTITY MANAGEMENT
  // ==========================================

  const handleIdentitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authBusy) return;

    if (!authMailInput || !authPassInput) {
      showShortToast('Please enter your email and password.');
      return;
    }

    setAuthBusy(true);

    try {
      if (authMode === 'login') {
        const profile = await login(authMailInput.trim().toLowerCase(), authPassInput);

        // Admin tab requires the account to actually have the admin role —
        // there's no shortcut passkey anymore.
        if (selectedAuthRole === 'admin' && profile.role !== 'admin') {
          await logout();
          showShortToast('This account does not have admin access.');
          pushTrace('Login rejected: non-admin account used on Admin tab.', 'warn');
          setAuthBusy(false);
          return;
        }

        setActiveView(profile.role);
        pushTrace(`Access authorized for ${profile.name} (${profile.role.toUpperCase()})`, 'auth');
        showShortToast(`Welcome back, ${profile.name}!`);

      } else {
        // SIGN UP FLOW
        if (!authNameInput) {
          showShortToast('Please enter your full name.');
          setAuthBusy(false);
          return;
        }
        if (authPassInput.length < 8) {
          showShortToast('Password must be at least 8 characters.');
          setAuthBusy(false);
          return;
        }
        const normalizedPhone = normalizePhone(authPhoneInput);
        if (!/^\+256[0-9]{9}$/.test(normalizedPhone)) {
          showShortToast('Phone must be a Uganda number, e.g. +256772112233.');
          setAuthBusy(false);
          return;
        }
        if (selectedAuthRole === 'tenant' && !authLandlordCodeInput.trim()) {
          showShortToast('Please enter the landlord connect code given to you.');
          setAuthBusy(false);
          return;
        }

        const profile = await register({
          name: authNameInput.trim(),
          email: authMailInput.trim().toLowerCase(),
          phone: normalizedPhone,
          password: authPassInput,
          role: selectedAuthRole === 'admin' ? 'landlord' : selectedAuthRole,
          landlordCode: selectedAuthRole === 'tenant' ? authLandlordCodeInput.toUpperCase().trim() : undefined,
        });

        setActiveView(profile.role);
        pushTrace(`New account registered: ${profile.name}`, 'auth');
        if (profile.role === 'landlord' && profile.landlordCode) {
          pushTrace(`Generated connection code: "${profile.landlordCode}" for sharing with tenants.`, 'success');
        }
        showShortToast('Registered successfully! Access opened.');
      }

      // Reset inputs on success
      setAuthMailInput('');
      setAuthPassInput('');
      setAuthNameInput('');
      setAuthPhoneInput('+256 7');
      setAuthLandlordCodeInput('');

    } catch (err) {
      const msg = describeError(err);
      showShortToast(msg);
      pushTrace(`Auth error: ${msg}`, 'warn');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleTriggerLogout = async () => {
    await logout();
    setActiveView('landing');
    setProperties([]);
    setFinancials([]);
    setComplaints([]);
    setInAppMessages([]);
    pushTrace('User logged out. Session token cleared.', 'auth');
    showShortToast('Logged out successfully.');
  };

  // ==========================================
  // MOBILE PAYMENTS — real MTN MoMo / Airtel Money via backend
  // ==========================================
  //
  // Flow: call /payments/initiate -> backend fires a USSD push to the
  // customer's OWN phone -> we show a "waiting for approval" modal while
  // polling /payments/:id/status -> on Cleared/Failed we resolve.
  //
  // There is no PIN entry here — that happens on the customer's actual
  // phone, outside this app.

  const openWaitingModal = (
    amount: number,
    targetName: string,
    phoneStr: string,
    prov: 'MTN Mobile Money' | 'Airtel Money' | 'Bank Transfer',
    transactionId: string | null,
    onResolved: (record: FinancialRecord | null) => void
  ) => {
    setUssdAmount(amount);
    setUssdTargetName(targetName);
    setUssdPhone(phoneStr);
    setUssdProvider(prov);
    setUssdTransactionId(transactionId);
    setUssdCallback(() => onResolved);
    setUssdOpen(true);
  };

  const handleSavePaystackKey = async () => {
    if (!paystackSecretInput.trim()) {
      showShortToast('Paste your Paystack Secret Key first.');
      return;
    }
    setPaystackSettingsBusy(true);
    try {
      const res = await paymentsApi.savePaymentSettings(paystackSecretInput.trim());
      setPaystackConnected(res.connected);
      setPaystackKeyHint(res.keyHint);
      setPaystackSecretInput('');
      pushTrace('Paystack secret key encrypted and saved to landlord profile.', 'success');
      showShortToast('Payment Settings saved. Tenants can now pay rent into your Paystack account.');
    } catch (err) {
      const msg = describeError(err);
      showShortToast(msg);
      pushTrace(`Paystack settings save error: ${msg}`, 'warn');
    } finally {
      setPaystackSettingsBusy(false);
    }
  };

  const handleDisconnectPaystack = async () => {
    setPaystackSettingsBusy(true);
    try {
      await paymentsApi.disconnectPaymentSettings();
      setPaystackConnected(false);
      setPaystackKeyHint(null);
      pushTrace('Paystack disconnected from landlord profile.', 'warn');
      showShortToast('Paystack disconnected.');
    } catch (err) {
      showShortToast(describeError(err));
    } finally {
      setPaystackSettingsBusy(false);
    }
  };

  /**
   * Initiates a Paystack payment (landlord key for rent / platform key for fees),
   * opens the waiting modal, polls for the result, and returns the cleared record.
   */
  const runMomoPayment = async (
    amount: number,
    targetLabel: string,
    method: 'MTN Mobile Money' | 'Airtel Money' | 'Bank Transfer',
    opts: {
      propertyId?: string | null;
      type?: 'Rent Payment' | 'Subscription Fee' | 'Message Billing';
    } = {}
  ): Promise<FinancialRecord | null> => {
    if (!currentUser) return null;

    if (!wifiConnected) {
      showShortToast('No internet connection — payment cannot be sent right now.');
      return null;
    }

    try {
      pushTrace(`Paystack ${method} charge of Shs ${amount.toLocaleString()} for: ${targetLabel}`, 'ussd');

      const initRes = await paymentsApi.initiatePayment({
        propertyId: opts.propertyId ?? null,
        provider: method,
        senderPhone: normalizePhone(currentUser.phone),
        type: opts.type || 'Rent Payment',
        amount: opts.propertyId ? undefined : amount,
      });

      if (method === 'Bank Transfer' && initRes.authorizationUrl) {
        window.open(initRes.authorizationUrl, '_blank', 'noopener,noreferrer');
        showShortToast('Complete the bank transfer in the opened Paystack window.');
      }

      return await new Promise<FinancialRecord | null>((resolve) => {
        openWaitingModal(amount, targetLabel, currentUser.phone, method, initRes.transactionId, resolve);

        paymentsApi.pollPaymentStatus(initRes.transactionId, { intervalMs: 2500, timeoutMs: 90000 })
          .then(async (tx) => {
            setUssdOpen(false);
            if (tx.status === 'Cleared') {
              pushTrace(`CONFIRMED: Payment of Shs ${amount.toLocaleString()} cleared. Receipt ${tx.receipt_no}`, 'success');
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification('Rent payment confirmed', {
                  body: `Receipt ${tx.receipt_no} — Shs ${amount.toLocaleString()}`,
                });
              }
              await refreshData();
              const record = paymentsApi.mapFinancial(tx);
              resolve(record);
            } else {
              pushTrace(`Payment ${tx.status === 'Failed' ? 'failed' : 'timed out'} for Shs ${amount.toLocaleString()}.`, 'warn');
              showShortToast(tx.status === 'Failed'
                ? 'Payment was declined or failed on the network.'
                : 'Still waiting on Paystack confirmation — check Payment History shortly.');
              resolve(null);
            }
          })
          .catch((err) => {
            setUssdOpen(false);
            const msg = describeError(err);
            pushTrace(`Payment poll error: ${msg}`, 'warn');
            showShortToast(msg);
            resolve(null);
          });
      });

    } catch (err) {
      const msg = describeError(err);
      pushTrace(`Payment initiation error: ${msg}`, 'warn');
      showShortToast(msg);
      return null;
    }
  };

  /** Closes the waiting modal early (user gave up) without cancelling the backend push. */
  const handleUssdDismiss = () => {
    setUssdOpen(false);
    ussdCallback(null);
    pushTrace('Closed payment status modal — push may still complete on your phone.', 'warn');
  };

  // ==========================================
  // TENANT ACTIONS
  // ==========================================

  const handleTenantPayRent = async (method: 'MTN Mobile Money' | 'Airtel Money' | 'Bank Transfer') => {
    if (!currentUser) return;
    const targetPropertyId = currentUser.propertyId;
    if (!targetPropertyId) {
      showShortToast('No rented unit is linked to your account yet.');
      return;
    }

    const currentProp = properties.find(p => p.id === targetPropertyId);
    if (!currentProp) return;

    if (currentProp.status === 'Paid') {
      showShortToast('Your rent is already marked as paid!');
      return;
    }

    const payTotal = currentProp.monthlyRent;

    if (!wifiConnected) {
      // Queue for offline sync — real record created server-side once synced
      const localId = `off-${Date.now()}`;
      setOfflinePayments(prev => [...prev, {
        localId,
        propertyId: currentProp.id,
        propertyName: currentProp.name,
        amount: payTotal,
        provider: method,
        senderPhone: normalizePhone(currentUser.phone),
        receiver: currentProp.landlordCode,
        type: 'Rent Payment',
      }]);

      // Optimistically reflect Paid + Pending Cloud Sync locally
      setProperties(prev => prev.map(p => p.id === currentProp.id ? { ...p, status: 'Paid' } : p));
      setFinancials(prev => [{
        id: localId,
        propertyId: currentProp.id,
        propertyName: currentProp.name,
        amount: payTotal,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
        type: 'Rent Payment',
        provider: method,
        senderPhoneOrAcc: currentUser.phone,
        receiver: currentProp.landlordCode,
        status: 'Pending Cloud Sync',
        receiptNo: `OFF-TX-${Math.floor(100000 + Math.random() * 900000)}`,
        offline: true,
      }, ...prev]);

      pushTrace(`Offline: queued rent payment of Shs ${payTotal.toLocaleString()} for sync.`, 'warn');
      showShortToast('Saved offline! Payment will sync automatically when online.');
      return;
    }

    const record = await runMomoPayment(payTotal, `Rent — ${currentProp.name}`, method, {
      propertyId: currentProp.id,
      type: 'Rent Payment',
    });

    if (record) {
      setReceiptOverlayItem(record);
    }
  };

  const handleTenantRaiseComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketTitle || !ticketDesc) {
      showShortToast('Please type the ticket title and explanation details.');
      return;
    }

    if (!currentUser) return;
    const targetPropertyId = currentUser.propertyId;
    if (!targetPropertyId) {
      showShortToast('No rented unit is linked to your account yet.');
      return;
    }
    const currentProp = properties.find(p => p.id === targetPropertyId);
    if (!currentProp) return;

    if (!wifiConnected) {
      const localId = `off-comp-${Date.now()}`;
      setOfflineComplaints(prev => [...prev, {
        localId,
        propertyId: targetPropertyId,
        propertyName: currentProp.name,
        title: ticketTitle,
        description: ticketDesc,
        category: ticketCategory,
        priority: ticketPriority,
      }]);

      setComplaints(prev => [{
        id: localId,
        propertyId: targetPropertyId,
        propertyName: currentProp.name,
        title: ticketTitle,
        description: ticketDesc,
        category: ticketCategory,
        status: 'Received',
        priority: ticketPriority,
        raisedBy: currentUser.name,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
        offline: true,
      }, ...prev]);

      pushTrace(`Offline: queued repair ticket "${ticketTitle}" for sync.`, 'warn');
      showShortToast('Repair ticket saved offline. It will deliver during sync.');
      setTicketTitle('');
      setTicketDesc('');
      return;
    }

    try {
      await complaintsApi.createComplaint({
        propertyId: targetPropertyId,
        title: ticketTitle,
        description: ticketDesc,
        category: ticketCategory,
        priority: ticketPriority,
      });
      await refreshData();
      pushTrace(`Logged ticket: "${ticketTitle}" to landlord regarding unit ${currentProp.name}`, 'complaint');
      showShortToast('Repair ticket successfully sent to your landlord!');
      setTicketTitle('');
      setTicketDesc('');
    } catch (err) {
      const msg = describeError(err);
      showShortToast(msg);
      pushTrace(`Complaint submit error: ${msg}`, 'warn');
    }
  };

  // ==========================================
  // LANDLORD ACTIONS
  // ==========================================

  const handleLandlordCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!newPropName || !newPropAddress || !newPropTenant || !newPropRent) {
      showShortToast('Please fill all the rental room details.');
      return;
    }

    const priceNum = parseInt(newPropRent, 10);
    if (isNaN(priceNum) || priceNum <= 0) {
      showShortToast('Rent must be a valid numerical value in shillings.');
      return;
    }

    const normalizedTenantPhone = normalizePhone(newPropTenantPhone || '+256700000000');
    if (!/^\+256[0-9]{9}$/.test(normalizedTenantPhone)) {
      showShortToast('Tenant phone must be a Uganda number, e.g. +256772112233.');
      return;
    }

    try {
      await propertiesApi.createProperty({
        name: newPropName,
        address: newPropAddress,
        tenantName: newPropTenant,
        tenantPhone: normalizedTenantPhone,
        monthlyRent: priceNum,
      });
      await refreshData();

      pushTrace(`Lease Created: "${newPropName}" registered with code ${currentUser.landlordCode}`, 'success');
      showShortToast('Rental unit recorded successfully on your ledger!');

      setNewPropName('');
      setNewPropAddress('');
      setNewPropTenant('');
      setNewPropTenantPhone('+256 7');
      setNewPropRent('');
    } catch (err) {
      const msg = describeError(err);
      showShortToast(msg);
      pushTrace(`Create property error: ${msg}`, 'warn');
    }
  };

  const handleLandlordNudgeTenant = async (propertyId: string, tenantName: string, amount: number) => {
    if (!wifiConnected) {
      showShortToast('Cannot post a message while offline.');
      return;
    }
    try {
      const res = await messagesApi.sendReminder(propertyId);
      await refreshData();
      pushTrace(`IN-APP REMINDER: Posted overdue notice to ${tenantName} (Shs ${amount.toLocaleString()}).`, 'system');
      showShortToast(`Posted rent reminder for ${tenantName}!`);
    } catch (err) {
      const msg = describeError(err);
      showShortToast(msg);
      pushTrace(`In-app reminder error: ${msg}`, 'warn');
    }
  };

  const handleLandlordSendRemindersToAll = async () => {
    const overdueProps = landlordProperties.filter(p => p.status === 'Overdue');
    if (overdueProps.length === 0) {
      showShortToast('No overdue tenants to notify at this moment.');
      return;
    }
    if (!wifiConnected) {
      showShortToast('Cannot post a message while offline.');
      return;
    }

    try {
      const res = await messagesApi.sendReminder();
      await refreshData();
      pushTrace(`BROADCAST REMINDER: Posted ${res.sent} overdue alerts in the app.`, 'system');
      showShortToast(`Overdue reminders posted for ${res.sent} tenant(s)!`);
    } catch (err) {
      const msg = describeError(err);
      showShortToast(msg);
      pushTrace(`Bulk reminder error: ${msg}`, 'warn');
    }
  };

  const handleLandlordSendCustomSMS = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSMSBody.trim()) {
      showShortToast('Please type a custom message first.');
      return;
    }
    if (customSMSBody.trim().length > 160) {
      showShortToast('Message must be 160 characters or fewer.');
      return;
    }
    if (landlordProperties.length === 0) {
      showShortToast('You have no registered tenants to notify.');
      return;
    }
    if (!wifiConnected) {
      showShortToast('Cannot post a message while offline.');
      return;
    }

    try {
      const res = await messagesApi.sendBroadcast(customSMSBody.trim());
      await refreshData();
      if (res.localOnly) {
        pushTrace(`BROADCAST CUSTOM: Posted locally for ${res.recipientCount} tenant(s).`, 'system');
        showShortToast(`Message posted for ${res.recipientCount} tenant(s) in the app.`);
      } else {
        pushTrace(`BROADCAST CUSTOM: Posted for ${res.recipientCount} tenant(s).`, 'system');
        showShortToast(`Message posted for ${res.recipientCount} tenant(s)!`);
      }
      setCustomSMSBody('');
    } catch (err) {
      const msg = describeError(err);
      showShortToast(msg);
      pushTrace(`Broadcast message error: ${msg}`, 'warn');
    }
  };

  const handleLandlordPaySMSBill = async (provider: 'MTN Mobile Money' | 'Airtel Money' = 'MTN Mobile Money') => {
    if (!currentUser) return;
    if (smsMessageBill <= 0) {
      showShortToast('Your SMS Message bill is already fully settled.');
      return;
    }
    if (!wifiConnected) {
      showShortToast('Cannot pay SMS bill while offline. Connect internet first.');
      return;
    }

    const record = await runMomoPayment(smsMessageBill, 'SMS Messages Billing Settlement', provider, {
      propertyId: null,
      type: 'Message Billing',
    });

    if (record) {
      try {
        await messagesApi.settleSmsBilling(record.receiptNo);
        setSmsMessageBill(0);
        pushTrace(`SMS BILL CLEAR: Paid Shs ${record.amount.toLocaleString()}. Voucher ${record.receiptNo} issued.`, 'payment');
        showShortToast('SMS Message Bill settled successfully!');
        setReceiptOverlayItem(record);
      } catch (err) {
        const msg = describeError(err);
        showShortToast(msg);
        pushTrace(`SMS billing settle error: ${msg}`, 'warn');
      }
    }
  };

  /**
   * Marks a unit as Paid directly — for cash/manual collections the landlord
   * receives outside the app. NOTE: this does not create a financial-ledger
   * entry (the backend has no "record manual cash receipt" endpoint yet);
   * it only flips the unit's status. Add a dedicated endpoint if you need
   * manual collections to appear in Payment History / receipts.
   */
  const handleLandlordSettleManualRent = async (p: Property) => {
    if (!currentUser) return;
    if (p.status === 'Paid') {
      showShortToast('This unit is already marked as Paid.');
      return;
    }
    if (!wifiConnected) {
      showShortToast('Cannot update records while offline.');
      return;
    }

    try {
      await propertiesApi.updateProperty(p.id, { status: 'Paid' });
      await refreshData();
      pushTrace(`Manual Rent Collection: marked "${p.name}" as Paid (cash/manual — no ledger entry).`, 'success');
      showShortToast('Unit marked as Paid.');
    } catch (err) {
      const msg = describeError(err);
      showShortToast(msg);
      pushTrace(`Manual settle error: ${msg}`, 'warn');
    }
  };

  // ==========================================
  // SUBSCRIPTION MANAGEMENT (BILLING TO LANDLORD)
  // ==========================================

  // Display-only estimate of the current tier (the amount actually charged
  // is computed authoritatively by the backend at /api/subscriptions/pay).
  const calculateLandlordSubscription = (unitsCount: number): { tierName: string; price: number } => {
    if (unitsCount <= 3) {
      return { tierName: 'Free Trial Plan', price: 0 };
    }
    const matchingTier = pricingTiers.find(t => unitsCount >= t.minUnits && unitsCount <= t.maxUnits);
    return {
      tierName: matchingTier ? matchingTier.name : 'Premium Level',
      price: matchingTier ? matchingTier.pricePerMonth : 85000
    };
  };

  const handleLandlordPaySubscription = async (provider: 'MTN Mobile Money' | 'Airtel Money' = 'MTN Mobile Money') => {
    if (!currentUser) return;

    const activeUnits = landlordProperties.length;
    const sub = calculateLandlordSubscription(activeUnits);

    if (sub.price === 0) {
      showShortToast('You are currently on the Free Trial Plan! No payment needed.');
      return;
    }

    if (!wifiConnected) {
      showShortToast('Cannot pay landlord subscription while offline. Connect internet first.');
      return;
    }

    const record = await runMomoPayment(sub.price, `Subscription Fee (${sub.tierName})`, provider, {
      propertyId: null,
      type: 'Subscription Fee',
    });

    if (record) {
      pushTrace(`COLLECTED: Subscription payment of Shs ${record.amount.toLocaleString()} for ${currentUser.name}`, 'success');
      showShortToast('Subscription paid successfully!');
      setReceiptOverlayItem(record);
    }
  };

  // ==========================================
  // SYNC ALGORITHM — uploads queued offline payments/complaints
  // ==========================================

  const handleManualOfflineSync = async () => {
    if (!wifiConnected) {
      showShortToast('Cannot sync while offline. Reconnect first.');
      return;
    }

    if (offlinePayments.length === 0 && offlineComplaints.length === 0) {
      showShortToast('All records are already fully synced.');
      return;
    }

    setIsSyncing(true);
    pushTrace('Uploading queued offline records to server...', 'system');

    try {
      if (offlinePayments.length > 0) {
        const res = await paymentsApi.syncOfflinePayments(offlinePayments);
        pushTrace(`Synced ${res.synced.length} offline payment(s); ${res.failed.length} failed.`, 'success');
        setOfflinePayments([]);
      }

      if (offlineComplaints.length > 0) {
        const res = await complaintsApi.syncOfflineComplaints(offlineComplaints);
        pushTrace(`Synced ${res.synced.length} offline ticket(s); ${res.failed.length} failed.`, 'success');
        setOfflineComplaints([]);
      }

      await refreshData();
      showShortToast('All offline transactions synced successfully!');
    } catch (err) {
      const msg = describeError(err);
      showShortToast(msg);
      pushTrace(`Sync error: ${msg}`, 'warn');
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleLocalNetworkIndicator = () => {
    const nextWifi = !wifiConnected;
    setWifiConnected(nextWifi);

    if (nextWifi) {
      pushTrace('Internet signal reconnected.', 'system');
      if (offlinePayments.length > 0 || offlineComplaints.length > 0) {
        // Auto-sync on reconnect
        setTimeout(() => { handleManualOfflineSync(); }, 800);
      } else {
        refreshData();
      }
    } else {
      pushTrace('Device transitioned to offline mode. Records will be queued locally.', 'warn');
      showShortToast('Offline. Payments and tickets will be held safely on your device.');
    }
  };

  // ==========================================
  // GLOBAL FILTER ARRAYS & ROLE ROUTING
  // ==========================================

  // Determine active view mode on the phone screen (respects admin live switcher toggles)
  const isLandlordActive = currentUser?.role === 'landlord' || (currentUser?.role === 'admin' && adminSimulatedRole === 'landlord');
  const isTenantActive = currentUser?.role === 'tenant' || (currentUser?.role === 'admin' && adminSimulatedRole === 'tenant');

  // The backend already scopes GET /properties, /payments, /complaints by
  // role (landlords see only their units, tenants see only their unit).
  // For admin, those endpoints return EVERYTHING — the "simulated role"
  // toggle below is purely a UI preview using the first landlord/tenant found.
  const currentLevelLandlordCode = currentUser?.role === 'admin'
    ? (properties[0]?.landlordCode || '')
    : (currentUser?.landlordCode || '');

  const landlordProperties = currentUser?.role === 'landlord'
    ? properties
    : properties.filter(p => p.landlordCode === currentLevelLandlordCode);
  const landlordPropertyIds = landlordProperties.map(p => p.id);

  const landlordFinanceLogs = currentUser?.role === 'landlord'
    ? financials
    : financials.filter(f => landlordPropertyIds.includes(f.propertyId));

  const landlordRepairTickets = currentUser?.role === 'landlord'
    ? complaints
    : complaints.filter(c => landlordPropertyIds.includes(c.propertyId));

  // Tenant views — backend already returns only the tenant's own unit/records
  const tenantRentedProperty = currentUser?.role === 'tenant'
    ? properties[0]
    : landlordProperties[0]; // admin preview fallback

  const tenantFinanceLogs = currentUser?.role === 'tenant'
    ? financials
    : financials.filter(f => f.propertyId === tenantRentedProperty?.id);

  const tenantRepairTickets = currentUser?.role === 'tenant'
    ? complaints
    : complaints.filter(c => c.propertyId === tenantRentedProperty?.id);

  // Collectives for admin metrics
  const totalSubPaymentsBilledShs = financials
    .filter(f => f.type === 'Subscription Fee' && f.status === 'Cleared')
    .reduce((agg, r) => agg + r.amount, 0);

  const totalUnsyncedItems = offlinePayments.length + offlineComplaints.length;

  // Show a minimal splash while the stored token (if any) is verified
  if (isLoadingSession) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#08080A] text-white">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
          <span className="text-xs text-neutral-400 font-mono">Connecting to Nyumba Smart...</span>
        </div>
      </div>
    );
  }

  if (activeView === 'admin' && currentUser?.role === 'admin') {
    return (
      <div className="flex h-full min-h-screen w-full flex-col bg-[#08080A] text-white select-none">
        {/* Toast Alert popup overlay */}
        {systemToastMessage && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[99999] px-4 py-2.5 rounded-xl bg-[#121217] border border-indigo-500/40 text-xs font-semibold text-indigo-400 shadow-2xl flex items-center gap-2 animate-bounce animate-fadeIn">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>{systemToastMessage}</span>
          </div>
        )}
        
        <div className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-between overflow-y-auto">
          <AdminPanel 
            tiers={pricingTiers}
            onUpdateTiers={async (updatedList) => {
              try {
                const saved = await adminApi.updateTiers(updatedList);
                setPricingTiers(saved);
                pushTrace('Subscription pricing configs updated in database.', 'success');
                showShortToast('Pricing tiers saved successfully!');
              } catch (err) {
                const msg = describeError(err);
                showShortToast(msg);
                pushTrace(`Tier update error: ${msg}`, 'warn');
              }
            }}
            onExitAdmin={async () => {
              setActiveView('landing');
              await logout();
            }}
            systemLogs={traceLogs}
            onClearLogs={() => setTraceLogs([])}
            totalIncomeShs={totalSubPaymentsBilledShs}
            propertiesCount={properties.length}
            adminMomoDetails={adminMomoDetails}
            adminBankDetails={adminBankDetails}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-screen w-full flex-col bg-[#08080A] text-white">
      
      {/* Toast Alert popup overlay */}
      {systemToastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[99999] px-4 py-2.5 rounded-xl bg-[#121217] border border-indigo-500/40 text-xs font-semibold text-indigo-200 shadow-2xl flex items-center gap-2 animate-bounce">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{systemToastMessage}</span>
        </div>
      )}

      {/* Data load error banner */}
      {dataLoadError && currentUser && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[99999] px-4 py-2 rounded-xl bg-red-950/80 border border-red-500/40 text-[11px] font-semibold text-red-300 shadow-2xl flex items-center gap-2 max-w-md">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Couldn't load latest data: {dataLoadError}</span>
          <button onClick={() => refreshData()} className="ml-auto text-red-200 underline whitespace-nowrap">Retry</button>
        </div>
      )}

      {/* Main workspace — two-column phone+marketing layout before login,
          single full-width column (dashboard only) after login */}
      <div className={
        isAuthenticated
          ? "flex flex-1 w-full flex-col items-stretch justify-start"
          : "flex flex-1 w-full flex-col lg:flex-row items-center lg:items-stretch justify-center p-0 lg:p-8 xl:p-12 gap-0 lg:gap-12 bg-gradient-to-br from-[#080809] via-[#101013] to-[#080809] overflow-auto select-none"
      }>
        
        {/* ========================================================== */}
        {/* LEFT PANE: LOGIN SCREEN — only rendered before authentication. */}
        {/* Once logged in, the dashboard (right pane below) becomes the */}
        {/* only thing on screen — full width, flush to the top.         */}
        {/* ========================================================== */}
        {!isAuthenticated && (
        <div className="relative w-full min-h-screen lg:min-h-0 lg:h-[720px] lg:w-[355px] flex flex-col rounded-none lg:rounded-[3.2rem] border-0 lg:border-[8px] border-[#1E1E23] bg-[#0E0E12] shadow-none lg:shadow-2xl lg:shadow-indigo-950/20 overflow-visible lg:overflow-hidden shrink-0 transition-all duration-500 lg:hover:scale-[1.01] lg:hover:shadow-indigo-500/10">
          
          {/* Authentic Camera notch & Ear Speaker stripe — decorative, desktop mockup only */}
          <div className="hidden lg:flex absolute top-1 left-1/2 -translate-x-1/2 w-40 h-5 bg-[#000000] rounded-b-2xl z-40 items-center justify-center">
            <div className="w-12 h-1 bg-[#232328] rounded-full absolute top-[3px]"></div>
            <div className="w-2.5 h-2.5 bg-[#1F1F25] rounded-full absolute right-8 top-[3px] border border-white/5"></div>
          </div>

          {/* App status bar — wifi toggle is functional everywhere; clock/signal/battery are decorative phone-mockup chrome, desktop only */}
          <div className="h-8 w-full flex justify-end lg:justify-between items-end px-4 lg:px-7 mt-3 mb-1 text-[11px] font-semibold tracking-tight text-white/90 select-none z-30">
            <div className="hidden lg:flex items-center gap-1">
              <span>{currentClockTime}</span>
              <span className="text-[7.5px] bg-indigo-500/20 text-indigo-300 px-1 rounded font-mono font-bold uppercase">UG</span>
            </div>
            
            <div className="flex items-center gap-1.5 text-white/80">
              <button 
                onClick={toggleLocalNetworkIndicator}
                className="hover:text-amber-400 cursor-pointer transition-colors"
                title={wifiConnected ? 'Go Offline' : 'Go Online'}
              >
                {wifiConnected ? (
                  <Wifi className="w-3.5 h-3.5 text-indigo-400" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-red-400" />
                )}
              </button>

              <div className="hidden lg:flex items-center gap-0.5">
                <span className={`w-0.5 h-1.5 rounded-2xs ${wifiConnected ? 'bg-indigo-400' : 'bg-neutral-600'}`}></span>
                <span className={`w-0.5 h-2.5 rounded-2xs ${wifiConnected ? 'bg-indigo-400' : 'bg-neutral-600'}`}></span>
                <span className={`w-0.5 h-3.5 rounded-2xs ${wifiConnected ? 'bg-indigo-400' : 'bg-neutral-600'}`}></span>
              </div>

              <div className="hidden lg:flex w-5 h-2.5 rounded-sm border border-white/30 items-center p-0.5 relative">
                <div className="h-full bg-emerald-400 rounded-3xs" style={{ width: '85%' }}></div>
              </div>
            </div>
          </div>

          {/* ========================================================== */}
          {/* LOGIN SCREEN — this whole pane only renders when !isAuthenticated */}
          {/* (see the outer wrapper above), so no inner conditional needed here. */}
          {/* ========================================================== */}

          {/* SCREEN 1: CLIENT IDENTITY AUTHENTICATOR (No complex bypass passwords) */}
          <div className="flex-1 flex flex-col justify-between p-6 bg-[#0E0E14] relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl"></div>
              
              <div className="flex flex-col items-center text-center mt-6">
                <div className="h-11 w-11 rounded-2xl bg-[#181820] flex items-center justify-center border border-white/5 shadow-md mb-3 bg-gradient-to-tr from-indigo-500/10 to-transparent">
                  <Building2 className="w-5.5 h-5.5 text-indigo-400" />
                </div>
                <h2 className="text-lg font-bold tracking-tight text-white mb-0.5">Nyumba Smart</h2>
                <span className="text-[10px] text-gray-400 font-medium">Simplified Tenant & Landlord Workspace</span>
              </div>

              <div className="my-auto space-y-4">
                
                {/* Select visual role button grid */}
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block text-center">
                    SELECT WORKSPACE LEVEL
                  </span>
                  
                  <div className="grid grid-cols-3 gap-1 px-0.5">
                    <button
                      type="button"
                      onClick={() => { setSelectedAuthRole('landlord'); setAuthMode('login'); }}
                      className={`py-1.5 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
                        selectedAuthRole === 'landlord'
                          ? 'bg-indigo-500/15 border-indigo-500 text-indigo-300'
                          : 'bg-neutral-900/60 border-white/5 text-gray-400 hover:bg-neutral-800'
                      }`}
                    >
                      Landlord
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedAuthRole('tenant'); setAuthMode('login'); }}
                      className={`py-1.5 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
                        selectedAuthRole === 'tenant'
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                          : 'bg-neutral-900/60 border-white/5 text-gray-400 hover:bg-neutral-800'
                      }`}
                    >
                      Tenant
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedAuthRole('admin'); setAuthMode('login'); }}
                      className={`py-1.5 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
                        selectedAuthRole === 'admin'
                          ? 'bg-[#ef4444]/15 border-[#ef4444]/60 text-[#ef4444]'
                          : 'bg-neutral-900/60 border-white/5 text-gray-400 hover:bg-neutral-800'
                      }`}
                    >
                      Admin Dev
                    </button>
                  </div>
                </div>

                {/* Switch form tabs */}
                {selectedAuthRole !== 'admin' && (
                  <div className="flex justify-center gap-4 text-xs font-semibold py-1">
                    <button 
                      onClick={() => { setAuthMode('login'); }}
                      className={`pb-1 border-b-2 transition-colors cursor-pointer ${authMode === 'login' ? 'border-indigo-400 text-white' : 'border-transparent text-neutral-500 hover:text-white'}`}
                    >
                      Login
                    </button>
                    <button 
                      onClick={() => { setAuthMode('signup'); }}
                      className={`pb-1 border-b-2 transition-colors cursor-pointer ${authMode === 'signup' ? 'border-indigo-400 text-white' : 'border-transparent text-neutral-500 hover:text-white'}`}
                    >
                      Create Account
                    </button>
                  </div>
                )}

                <form onSubmit={handleIdentitySubmit} className="space-y-3.5">
                  {authMode === 'signup' && (
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider font-bold text-gray-400 block">Full Display Name</label>
                      <input 
                        type="text"
                        required
                        value={authNameInput}
                        onChange={(e) => setAuthNameInput(e.target.value)}
                        placeholder="e.g. Julian Karuma"
                        className="w-full bg-neutral-900 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-400"
                        id="auth-name-input"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider font-bold text-gray-400 block">Email Address</label>
                    <input 
                      type="email"
                      required
                      value={authMailInput}
                      onChange={(e) => setAuthMailInput(e.target.value)}
                      placeholder="e.g. moses@gmail.com"
                      className="w-full bg-neutral-900 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-400"
                      id="auth-email-input"
                    />
                  </div>

                  {selectedAuthRole !== 'admin' && (
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider font-bold text-gray-400 block">Phone (MTN / Airtel Mobile Money)</label>
                      <input 
                        type="text"
                        required
                        value={authPhoneInput}
                        onChange={(e) => setAuthPhoneInput(e.target.value)}
                        placeholder="+256 772 12..."
                        className="w-full bg-neutral-900 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-400 font-mono font-medium"
                        id="auth-phone-input"
                      />
                    </div>
                  )}

                  {selectedAuthRole === 'tenant' && (
                    <div className="space-y-1 p-2 rounded-xl bg-amber-500/[0.03] border border-amber-500/10">
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[9px] uppercase tracking-wider font-bold text-amber-300 block">Landlord Connect Code</label>
                        <span className="text-[8px] text-gray-500">Provided by landlord</span>
                      </div>
                      <input 
                        type="text"
                        required
                        value={authLandlordCodeInput}
                        onChange={(e) => setAuthLandlordCodeInput(e.target.value)}
                        placeholder="e.g. LL-KARUMA"
                        className="w-full bg-neutral-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-amber-200 focus:outline-none focus:border-amber-400 uppercase font-mono font-bold tracking-wider"
                        id="auth-landlord-code-input"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider font-bold text-gray-400 block">Password</label>
                    <div className="relative">
                      <input 
                        type={showPassRaw ? "text" : "password"}
                        value={authPassInput}
                        onChange={(e) => setAuthPassInput(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-neutral-900 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-400 font-mono"
                        id="auth-pin-input"
                        minLength={authMode === 'signup' ? 8 : undefined}
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPassRaw(!showPassRaw)}
                        className="absolute right-3 top-2.5 text-neutral-500 hover:text-white"
                      >
                        {showPassRaw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {selectedAuthRole === 'admin' && (
                      <span className="text-[8.5px] text-red-400 font-mono block">🔒 This account must have admin privileges on the server.</span>
                    )}
                    {authMode === 'signup' && (
                      <span className="text-[8.5px] text-gray-500 font-mono block">Minimum 8 characters.</span>
                    )}
                  </div>

                  <button 
                    type="submit"
                    disabled={authBusy}
                    className={`w-full py-2.5 mt-2 rounded-xl font-bold text-xs hover:shadow-lg transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait ${
                      selectedAuthRole === 'admin' 
                        ? 'bg-gradient-to-r from-red-500 to-red-600' 
                        : 'bg-gradient-to-r from-indigo-500 to-indigo-600'
                    }`}
                    id="submit-auth-form"
                  >
                    {authBusy ? 'Please wait...' : (authMode === 'login' ? 'Log In' : 'Create Account')}
                  </button>
                </form>

              </div>

              {/* Toggle Back button */}
              <div className="text-center pt-3 border-t border-white/[0.04] flex items-center justify-center">
                <button 
                  onClick={() => { setActiveView('landing'); }}
                  className="text-[10px] text-gray-400 hover:underline cursor-pointer"
                >
                  ← Back to Home
                </button>
              </div>
            </div>


          {/* Device virtual home indicator bottom button — decorative, desktop mockup only */}
          <div className="hidden lg:flex h-4 w-full items-center justify-center bg-[#07070A] z-40">
            <div className="w-28 h-1 bg-[#47474B] rounded-full"></div>
          </div>

        </div>
        )}

        {/* ========================================================== */}
        {/* RIGHT PANE: dashboard content (landlord/tenant/landing/admin). */}
        {/* This is the ONLY pane once authenticated — full width, no top */}
        {/* gap, no card styling — flush against the screen edges.        */}
        {/* ========================================================== */}
        <div className={
          isAuthenticated
            ? "w-full flex flex-col"
            : "flex-grow w-full max-w-4xl bg-transparent lg:bg-[#0C0C10] rounded-none lg:rounded-3xl border-0 lg:border lg:border-white/[0.04] p-4 sm:p-6 lg:p-8 flex flex-col justify-between overflow-visible lg:overflow-y-auto shadow-none lg:shadow-xl"
        }>
          
          {activeView === 'landing' && (
            <LandingPage 
              tiers={pricingTiers}
              onStartAuth={(role) => {
                setSelectedAuthRole(role);
              }}
              onOpenAdminPortal={() => {
                setSelectedAuthRole('admin');
                setAuthMode('login');
              }}
            />
          )}

          {activeView === 'admin' && (
            currentUser?.role === 'admin' ? (
              <AdminPanel 
                tiers={pricingTiers}
                onUpdateTiers={async (updatedList) => {
                  try {
                    const saved = await adminApi.updateTiers(updatedList);
                    setPricingTiers(saved);
                    pushTrace('Subscription pricing configs updated in database.', 'success');
                  } catch (err) {
                    const msg = describeError(err);
                    showShortToast(msg);
                    pushTrace(`Tier update error: ${msg}`, 'warn');
                  }
                }}
                onExitAdmin={async () => {
                  setActiveView('landing');
                  await logout();
                }}
                systemLogs={traceLogs}
                onClearLogs={() => setTraceLogs([])}
                totalIncomeShs={totalSubPaymentsBilledShs}
                propertiesCount={properties.length}
                adminMomoDetails={adminMomoDetails}
                adminBankDetails={adminBankDetails}
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center bg-[#121217] border border-red-500/25 rounded-2xl space-y-4 max-w-sm mx-auto my-12">
                <div className="p-3.5 rounded-full bg-red-500/10 text-red-400">
                  <Lock className="w-8 h-8 animate-pulse" />
                </div>
                <h3 className="text-base font-black uppercase text-white font-mono tracking-tight">🔒 SECURE ZONE ENCLAVE</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Admin dashboard access requires an account with the admin role. Use the Admin tab on the phone screen to sign in.
                </p>
                <button 
                  onClick={() => setActiveView('landing')}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white font-bold text-xs rounded-xl cursor-pointer transition-all"
                >
                  Exit to Landing Page
                </button>
              </div>
            )
          )}

          {activeView === 'landlord' && (
            <div className="space-y-6 flex flex-col justify-between h-full min-h-[500px] px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 pb-6">
              <div className="space-y-6">
                
                {/* Header specifically aligned for Landlord */}
                <div className="flex justify-between items-center pb-3 border-b border-white/[0.05]">
                  <div>
                    <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest block font-mono">NYUMBA SMART LANDLORD PORTAL</span>
                    <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
                      <Building2 className="w-5.5 h-5.5 text-indigo-400" />
                      Landlord Suite — {currentUser?.name || 'Owner'}
                    </h2>
                  </div>
                  <button
                    onClick={handleTriggerLogout}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-all cursor-pointer"
                  >
                    Logout Portal
                  </button>
                </div>

                {/* Landlord Specific Key Statistics Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-neutral-900/60 border border-white/5 rounded-xl">
                    <span className="text-[9px] text-neutral-500 uppercase tracking-wider block font-bold">Your Share Code</span>
                    <span className="text-sm font-extrabold text-indigo-300 font-mono tracking-wider">{currentLevelLandlordCode}</span>
                  </div>
                  <div className="p-3 bg-neutral-900/60 border border-white/5 rounded-xl">
                    <span className="text-[9px] text-neutral-500 uppercase tracking-wider block font-bold">Registered Rooms</span>
                    <span className="text-sm font-extrabold text-white">{landlordProperties.length} Units</span>
                  </div>
                  <div className="p-3 bg-neutral-900/60 border border-white/5 rounded-xl">
                    <span className="text-[9px] text-neutral-500 uppercase tracking-wider block font-bold">Collections Income</span>
                    <span className="text-sm font-extrabold text-emerald-400">Shs {landlordFinanceLogs.filter(f => f.status === 'Cleared').reduce((acc, current) => acc + current.amount, 0).toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-neutral-900/60 border border-white/5 rounded-xl">
                    <span className="text-[9px] text-neutral-500 uppercase tracking-wider block font-bold">Complaints Desk Status</span>
                    <span className="text-sm font-extrabold text-amber-400">{landlordRepairTickets.filter(c => c.status !== 'Settled').length} Unsettled</span>
                  </div>
                </div>

                {/* Payment Settings — landlord connects their personal Paystack secret key */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-[#14141C] to-[#121217] border border-indigo-500/20 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider font-mono flex items-center gap-1.5">
                        <Settings className="w-3.5 h-3.5" /> Payment Settings · Paystack
                      </span>
                      <p className="text-[11px] text-neutral-400 mt-1.5 leading-relaxed max-w-xl">
                        Paste your personal Paystack Secret Key. We encrypt it and use it only to charge rent into
                        <strong className="text-white"> your</strong> Paystack account. Nyumba Smart never holds the money.
                      </p>
                    </div>
                    <span className={`shrink-0 px-2 py-1 rounded-md text-[9px] font-bold uppercase font-mono border ${
                      paystackConnected
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                        : 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                    }`}>
                      {paystackConnected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>

                  {paystackConnected && paystackKeyHint && (
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-black/30 border border-white/5 text-[11px]">
                      <span className="text-neutral-400">
                        Key stored: <span className="font-mono text-indigo-200">{paystackKeyHint}</span>
                      </span>
                      <button
                        type="button"
                        disabled={paystackSettingsBusy}
                        onClick={handleDisconnectPaystack}
                        className="px-2.5 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-300 font-bold text-[9px] cursor-pointer disabled:opacity-50"
                      >
                        Disconnect
                      </button>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[9px] uppercase tracking-wider font-bold text-gray-400 block">
                      {paystackConnected ? 'Replace Secret Key' : 'Paystack Secret Key'}
                    </label>
                    <div className="relative flex gap-2">
                      <div className="relative flex-1">
                        <Key className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2.5" />
                        <input
                          type={showPaystackKey ? 'text' : 'password'}
                          value={paystackSecretInput}
                          onChange={(e) => setPaystackSecretInput(e.target.value)}
                          placeholder="sk_live_… or sk_test_…"
                          className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-9 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-400"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPaystackKey(v => !v)}
                          className="absolute right-2.5 top-2 text-neutral-500 hover:text-white cursor-pointer"
                          aria-label="Toggle key visibility"
                        >
                          {showPaystackKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <button
                        type="button"
                        disabled={paystackSettingsBusy}
                        onClick={handleSavePaystackKey}
                        className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-[10px] cursor-pointer whitespace-nowrap"
                      >
                        {paystackSettingsBusy ? 'Saving…' : 'Save Key'}
                      </button>
                    </div>
                    <p className="text-[9px] text-neutral-500 leading-relaxed">
                      From Paystack Dashboard → Settings → API Keys &amp; Webhooks. Point webhooks to{' '}
                      <span className="font-mono text-neutral-400">/api/payments/paystack/webhook</span>.
                    </p>
                  </div>
                </div>

                {/* Platform Billing — subscription / SMS fees go to Nyumba Smart's */}
                {/* PAYSTACK_PLATFORM_SECRET_KEY account, not the landlord's key. */}
                {(() => {
                  const sub = calculateLandlordSubscription(landlordProperties.length);
                  const hasSubDue = sub.price > 0;
                  const hasSmsDue = smsMessageBill > 0;
                  if (!hasSubDue && !hasSmsDue) {
                    return (
                      <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 flex items-center gap-2 text-[11px] text-emerald-300 font-semibold">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        <span>You're on the Free Trial Plan with no outstanding platform charges.</span>
                      </div>
                    );
                  }
                  return (
                    <div className="p-4 rounded-xl bg-gradient-to-br from-[#14161E] to-[#121217] border border-indigo-500/15 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider font-mono">💼 NYUMBA SMART PLATFORM BILLING</span>
                        <div className="flex gap-1">
                          {(['MTN Mobile Money', 'Airtel Money'] as const).map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setBillingPaymentMethod(m)}
                              className={`px-2 py-1 rounded-md text-[8.5px] font-bold border transition-all cursor-pointer ${
                                billingPaymentMethod === m
                                  ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300'
                                  : 'bg-black/30 border-white/5 text-gray-500 hover:text-white'
                              }`}
                            >
                              {m === 'MTN Mobile Money' ? 'MTN' : 'Airtel'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {hasSubDue && (
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/30 border border-white/5">
                          <div>
                            <span className="text-[10px] text-gray-400 block">Monthly Subscription — {sub.tierName}</span>
                            <span className="text-sm font-extrabold text-white font-mono">Shs {sub.price.toLocaleString()}</span>
                          </div>
                          <button
                            onClick={() => handleLandlordPaySubscription(billingPaymentMethod)}
                            disabled={ussdOpen}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-wait text-white font-bold text-[10px] transition-all cursor-pointer"
                          >
                            {ussdOpen ? 'Waiting...' : 'Pay Now'}
                          </button>
                        </div>
                      )}

                      {hasSmsDue && (
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/30 border border-white/5">
                          <div>
                            <span className="text-[10px] text-gray-400 block">SMS Messaging Charges</span>
                            <span className="text-sm font-extrabold text-amber-300 font-mono">Shs {smsMessageBill.toLocaleString()}</span>
                          </div>
                          <button
                            onClick={() => handleLandlordPaySMSBill(billingPaymentMethod)}
                            disabled={ussdOpen}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-wait text-neutral-950 font-bold text-[10px] transition-all cursor-pointer"
                          >
                            {ussdOpen ? 'Waiting...' : 'Pay Now'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Landlord Two Column Operations Area */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  
                  {/* Left Column: Properties Management Desk */}
                  <div className="space-y-4">
                    
                    {/* Register room unit form */}
                    <form onSubmit={handleLandlordCreateProperty} className="p-4 rounded-xl bg-[#121217] border border-white/5 space-y-3">
                      <span className="text-[10px] text-indigo-400 font-black uppercase tracking-wider block font-mono">
                        + REGISTER NEW RENTAL ROOM UNIT
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <input 
                          type="text"
                          required
                          value={newPropName}
                          onChange={(e) => setNewPropName(e.target.value)}
                          placeholder="Room Name (e.g. Unit 3A)"
                          className="bg-black/40 border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-400"
                        />
                        <input 
                          type="text"
                          required
                          value={newPropAddress}
                          onChange={(e) => setNewPropAddress(e.target.value)}
                          placeholder="Plot Location Address"
                          className="bg-black/40 border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-400"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input 
                          type="text"
                          required
                          value={newPropTenant}
                          onChange={(e) => setNewPropTenant(e.target.value)}
                          placeholder="Tenant Name"
                          className="bg-black/40 border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                        />
                        <input 
                          type="text"
                          required
                          value={newPropTenantPhone}
                          onChange={(e) => setNewPropTenantPhone(e.target.value)}
                          placeholder="Tenant Carrier Phone"
                          className="bg-black/40 border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none font-mono"
                        />
                      </div>
                      <div className="flex items-center bg-black/40 border border-white/5 rounded-lg px-3 py-1.5 font-mono">
                        <span className="text-xs text-neutral-500 mr-2 font-bold">Shs / Month</span>
                        <input 
                          type="number"
                          required
                          value={newPropRent}
                          onChange={(e) => setNewPropRent(e.target.value)}
                          placeholder="Rent Amount"
                          className="bg-transparent text-xs font-bold text-white focus:outline-none text-right font-mono w-full"
                        />
                      </div>
                      <button 
                        type="submit"
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-[11px] rounded-lg tracking-wider cursor-pointer shadow-md transition-all font-mono"
                      >
                        Add Room Unit to Rent Portfolio
                      </button>
                    </form>

                    {/* Active Rooms Registry list for current landlord */}
                    <div className="space-y-2.5">
                      <span className="text-[10px] text-gray-500 uppercase block tracking-wider font-extrabold font-mono">Your Registered Units ({landlordProperties.length})</span>
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {landlordProperties.length === 0 ? (
                          <div className="p-6 text-center text-xs text-neutral-500 italic bg-[#111116] border border-white/5 rounded-xl">
                            No rooms registered under this connection code yet.
                          </div>
                        ) : (
                          landlordProperties.map(p => (
                            <div key={p.id} className="p-3 bg-[#111116] border border-white/5 rounded-xl space-y-2 text-xs">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-extrabold text-white text-[12.5px]">{p.name}</h4>
                                  <p className="text-[10px] text-neutral-400">{p.address}</p>
                                  <p className="text-[10px] text-indigo-300 mt-1 font-medium">Tenant: {p.tenantName || 'None'} • {p.tenantPhone}</p>
                                </div>
                                <div className="text-right">
                                  <span className="font-mono font-bold text-white block">Shs {p.monthlyRent.toLocaleString()}</span>
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase mt-1 ${
                                    p.status === 'Paid' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400 animate-pulse'
                                  }`}>{p.status}</span>
                                </div>
                              </div>
                              {p.status !== 'Paid' && (
                                <div className="flex gap-2 pt-1.5 border-t border-white/5">
                                  <button
                                    onClick={() => handleLandlordNudgeTenant(p.id, p.tenantName, p.monthlyRent)}
                                    className="flex-1 py-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-300 font-bold text-[9.5px] transition-all cursor-pointer"
                                  >
                                    Send Reminder
                                  </button>
                                  <button
                                    onClick={() => handleLandlordSettleManualRent(p)}
                                    className="flex-1 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300 font-bold text-[9.5px] transition-all cursor-pointer"
                                  >
                                    Mark Paid (Cash)
                                  </button>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Landlord Send SMS Reminders Broadcaster */}
                    <div className="p-4 rounded-xl bg-[#131110] border border-orange-500/20 space-y-3.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-orange-400 font-extrabold uppercase tracking-widest block font-mono">📢 Local Resident Messaging</span>
                        <span className="text-[9px] font-bold text-gray-500 font-mono">In-app delivery</span>
                      </div>
                      
                      <p className="text-[11.5px] leading-relaxed text-neutral-400 font-normal">
                        Post rent reminders and maintenance messages directly in the Nyumba Smart tenant app.
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                        <button
                          type="button"
                          onClick={handleLandlordSendRemindersToAll}
                          className="py-2 px-3 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 font-black text-xs text-orange-300 transition-all cursor-pointer text-center"
                        >
                          Send Overdue Alerts to All
                        </button>

                        <div className="bg-[#09090C] rounded-lg p-2.5 border border-white/5 flex justify-between items-center font-mono">
                          <span className="text-[10px] text-gray-500">Overdue Tenant Count:</span>
                          <strong className="text-sm font-black text-white">{landlordProperties.filter(p => p.status === 'Overdue').length} Rooms</strong>
                        </div>
                      </div>

                      <div className="border-t border-white/[0.04] pt-3.5 space-y-2">
                        <span className="text-[10.5px] text-neutral-400 font-bold uppercase tracking-wider block">
                          Broadcast Custom Message to All Registered Residents
                        </span>
                        
                        <form onSubmit={handleLandlordSendCustomSMS} className="flex gap-2">
                          <input
                            type="text"
                            value={customSMSBody}
                            onChange={(e) => setCustomSMSBody(e.target.value)}
                            placeholder="e.g., General fumigation is scheduled for this coming Saturday from 9 AM. Thank you."
                            className="flex-grow bg-black/40 border border-white/5 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500 placeholder-neutral-600"
                          />
                          <button
                            type="submit"
                            className="py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white transition-all cursor-pointer"
                          >
                            Broadcast
                          </button>
                        </form>
                      </div>
                    </div>

                  </div>

                  {/* Right Column: Complaints Desk & Finance Ledger */}
                  <div className="space-y-4">
                    
                    {/* Landlord's Actionable Complaints List */}
                    <div className="space-y-2">
                      <span className="text-[10px] text-amber-400 uppercase block tracking-wider font-extrabold font-mono">Tenant Maintenance & Repair Requests ({landlordRepairTickets.length})</span>
                      <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1">
                        {landlordRepairTickets.length === 0 ? (
                          <span className="text-xs text-neutral-600 block py-6 text-center italic bg-[#121217] border border-white/5 rounded-xl">No complaints filed by connected tenants yet.</span>
                        ) : (
                          landlordRepairTickets.map(comp => (
                            <div key={comp.id} className="p-3 bg-[#121217] border border-white/5 rounded-xl space-y-1 text-xs">
                              <div className="flex justify-between items-center">
                                <span className="font-mono text-gray-400 text-[10px]">[{comp.category}] • Priority: {comp.priority}</span>
                                <span className={`inline-block px-1.5 py-0.2 rounded uppercase text-[8px] font-bold ${
                                  comp.status === 'Settled' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400 animate-pulse'
                                }`}>{comp.status}</span>
                              </div>
                              <h5 className="font-extrabold text-white text-[12px]">{comp.title}</h5>
                              <p className="text-[10.5px] text-neutral-400 leading-relaxed">{comp.description}</p>
                              {comp.status !== 'Settled' && (
                                <button
                                  onClick={async () => {
                                    try {
                                      await complaintsApi.updateComplaint(comp.id, { status: 'Settled' });
                                      await refreshData();
                                      pushTrace(`Tenant Complaint Resolving: ID ${comp.id} marked as settled.`, 'success');
                                      showShortToast('Complaint resolved!');
                                    } catch (err) {
                                      const msg = describeError(err);
                                      showShortToast(msg);
                                      pushTrace(`Complaint resolve error: ${msg}`, 'warn');
                                    }
                                  }}
                                  className="mt-1.5 px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-bold text-[9px] transition-all cursor-pointer inline-flex items-center gap-1 font-mono"
                                >
                                  Mark Issue as Fixed
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Rent Collections Records Ledger */}
                    <div className="space-y-2">
                      <span className="text-[10px] text-emerald-400 uppercase block tracking-wider font-extrabold font-mono">Rent Collections Transactions Ledger</span>
                      <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1">
                        {landlordFinanceLogs.length === 0 ? (
                          <span className="text-xs text-neutral-600 block py-6 text-center bg-[#111116] border border-white/5 rounded-xl italic">No transactions registered in your ledger yet.</span>
                        ) : (
                          landlordFinanceLogs.map(log => (
                            <div key={log.id} className="p-2.5 bg-[#111116] border border-white/5 rounded-xl flex justify-between items-center text-xs">
                              <div>
                                <span className="text-[9px] text-indigo-400 font-mono block">Voucher: {log.receiptNo}</span>
                                <span className="text-white font-semibold block text-[11.5px] truncate max-w-[200px]">{log.propertyName}</span>
                                <span className="text-gray-500 text-[9px]">{log.date} • {log.provider}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-emerald-400 font-bold block font-mono text-[12.5px]">Shs {log.amount.toLocaleString()}</span>
                                <button 
                                  onClick={() => setReceiptOverlayItem(log)}
                                  className="text-[9px] text-indigo-300 hover:underline inline-flex items-center gap-1 mt-1 cursor-pointer font-semibold"
                                >
                                  View Voucher Record
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>

                </div>

              </div>
            </div>
          )}

          {activeView === 'tenant' && (
            <div className="space-y-6 flex flex-col justify-between h-full min-h-[500px] px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 pb-6">
              <div className="space-y-6">
                
                {/* Header specifically aligned for Tenant */}
                <div className="flex justify-between items-center pb-3 border-b border-white/[0.05]">
                  <div>
                    <span className="text-[9px] text-amber-400 font-bold uppercase tracking-widest block font-mono">SECURE RESIDENT WORKSPACE</span>
                    <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
                      <Smartphone className="w-5.5 h-5.5 text-amber-400" />
                      Rent & Maintenance Desk — {currentUser?.name || 'Resident'}
                    </h2>
                  </div>
                  <button
                    onClick={handleTriggerLogout}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-all cursor-pointer"
                  >
                    Logout Portal
                  </button>
                </div>

                {/* Tenant Specific Connected Room Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-neutral-900/60 border border-white/5 rounded-xl">
                    <span className="text-[9px] text-neutral-500 uppercase tracking-wider block font-bold font-mono">Connected Unit</span>
                    <span className="text-xs font-extrabold text-white truncate block mt-0.5">{tenantRentedProperty ? tenantRentedProperty.name : 'Not associated to unit'}</span>
                  </div>
                  <div className="p-3 bg-neutral-900/60 border border-white/5 rounded-xl">
                    <span className="text-[9px] text-neutral-500 uppercase tracking-wider block font-bold font-mono">Monthly Rent Invoice</span>
                    <span className="text-xs font-extrabold text-white mt-0.5 block">Shs {tenantRentedProperty ? tenantRentedProperty.monthlyRent.toLocaleString() : '0'} / month</span>
                  </div>
                  <div className="p-3 bg-neutral-900/60 border border-white/5 rounded-xl">
                    <span className="text-[9px] text-neutral-500 uppercase tracking-wider block font-bold font-mono">Rent Invoice Status</span>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase mt-1 ${
                      tenantRentedProperty?.status === 'Paid' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400 animate-pulse'
                    }`}>{tenantRentedProperty ? tenantRentedProperty.status : 'None'}</span>
                  </div>
                </div>

                {/* Tenant Operation Splits */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  
                  {/* Left Column: Digital Checkout Billing Kiosk */}
                  <div className="space-y-4">
                    
                    {tenantRentedProperty && (
                      <div className="p-4 rounded-xl bg-gradient-to-br from-[#1E1914] to-[#121217] border border-amber-500/10 space-y-3">
                        <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider block font-mono">💳 PAY RENT VIA PAYSTACK</span>
                        <p className="text-[11px] text-neutral-400 leading-normal">
                          Choose MTN MoMo, Airtel, or Bank. Money goes straight to your landlord&apos;s Paystack account — Nyumba Smart never touches it.
                        </p>
                        
                        <div className="grid grid-cols-3 gap-2">
                          {['MTN Mobile Money', 'Airtel Money', 'Bank Transfer'].map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                setPaymentMethod(m as any);
                                pushTrace(`Selected ${m} payment channel raw configuration.`, 'system');
                              }}
                              className={`p-2 rounded-lg text-center text-[10px] font-bold border transition-all cursor-pointer ${
                                paymentMethod === m 
                                  ? 'bg-amber-500/15 border-amber-400 text-amber-300 font-extrabold' 
                                  : 'bg-black/40 border-white/5 text-gray-400 hover:text-white'
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>

                        <div className="space-y-2 pt-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-400">Monthly Rent:</span>
                            <span className="text-white font-mono font-bold">Shs {tenantRentedProperty.monthlyRent.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-gray-400">Carrier Fee:</span>
                            <span className="text-emerald-400 font-bold">Shs 0 (Platform Free)</span>
                          </div>
                          <div className="border-t border-white/5 pt-2 flex justify-between text-xs font-black font-mono">
                            <span className="text-amber-300">Total Charge amount:</span>
                            <span className="text-emerald-400 text-[13px]">Shs {tenantRentedProperty.monthlyRent.toLocaleString()}</span>
                          </div>
                        </div>

                        {tenantRentedProperty.status === 'Paid' ? (
                          <div className="w-full py-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-center font-bold text-xs flex items-center justify-center gap-1.5 border border-emerald-500/20 font-mono">
                            <CheckCircle2 className="w-3.5 h-3.5" /> MONTHLY RENT FULLY CLEARED & VERIFIED
                          </div>
                        ) : (
                          <button
                            onClick={() => handleTenantPayRent(paymentMethod)}
                            disabled={ussdOpen}
                            className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-wait text-neutral-950 font-black text-xs shadow-md transition-all cursor-pointer text-center font-mono tracking-wider"
                          >
                            {ussdOpen ? 'Waiting for approval...' : `Authorize Rent Payout via ${paymentMethod}`}
                          </button>
                        )}
                        
                        <div className="py-2.5 px-3 rounded-lg bg-[#0E0B08] border border-orange-500/10 text-[9.5px] text-orange-400 flex items-start gap-2 leading-relaxed">
                          <span className="mt-0.5">🛡️</span>
                          <span><strong>Secure PIN:</strong> Approve the MTN/Airtel prompt on your phone. Funds settle directly in your landlord&apos;s Paystack business — not in Nyumba Smart.</span>
                        </div>
                      </div>
                    )}

                    {/* Room summary detail info */}
                    {tenantRentedProperty && (
                      <div className="p-3 bg-[#111116] border border-white/5 rounded-xl space-y-1.5 text-xs text-neutral-400">
                        <span className="font-extrabold text-[9px] text-gray-500 uppercase block tracking-wider font-mono">Connected Unit Details</span>
                        <div>
                          <span className="font-bold text-white block text-[12px]">{tenantRentedProperty.name}</span>
                          <span className="block text-[10px] text-neutral-400">{tenantRentedProperty.address}</span>
                          <span className="block text-[10px] text-indigo-400 mt-1 font-semibold">Landlord Connection Code: <strong className="font-mono text-white tracking-wider font-extrabold">{tenantRentedProperty.landlordCode}</strong></span>
                        </div>
                      </div>
                    )}

                  </div>

                  {/* Right Column: Complaints Desk Form & History */}
                  <div className="space-y-4">
                    
                    {/* Submit repair form */}
                    <form onSubmit={handleTenantRaiseComplaint} className="p-4 rounded-xl bg-[#121217] border border-white/5 space-y-3">
                      <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-widest block font-mono">FILE A DIRECT REPAIR / MAINTENANCE COMPLAINT</span>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex flex-col gap-1">
                          <label className="text-gray-500 font-bold block text-[8px] uppercase font-mono">Room Repair Type</label>
                          <select 
                            value={ticketCategory}
                            onChange={(e) => setTicketCategory(e.target.value as any)}
                            className="w-full bg-black/40 border border-white/5 text-white text-xs rounded px-2.5 py-1.5 focus:outline-none"
                          >
                            <option value="Plumbing">Water / Plumbing Issue</option>
                            <option value="Electricity">Electricity & Yaka Power</option>
                            <option value="Water">Water Tank Outage</option>
                            <option value="Rent Issue">Monthly Billing Issue</option>
                            <option value="Other">Other Repairs</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-gray-500 font-bold block text-[8px] uppercase font-mono">Urgency Priority</label>
                          <select 
                            value={ticketPriority}
                            onChange={(e) => setTicketPriority(e.target.value as any)}
                            className="w-full bg-black/40 border border-white/5 text-white text-xs rounded px-2.5 py-1.5 focus:outline-none"
                          >
                            <option value="Low">Low Priority</option>
                            <option value="Medium">Medium Priority</option>
                            <option value="High">High Urgency!</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 text-xs">
                        <label className="text-gray-500 font-bold block text-[8px] uppercase font-mono">Short Title Summary</label>
                        <input 
                          type="text"
                          required
                          value={ticketTitle}
                          onChange={(e) => setTicketTitle(e.target.value)}
                          placeholder="e.g. Toilet tank won't fill up"
                          className="bg-black/40 border border-white/5 text-xs text-white rounded px-2.5 py-1.5 focus:outline-none w-full"
                        />
                      </div>

                      <div className="flex flex-col gap-1 text-xs">
                        <label className="text-gray-500 font-bold block text-[8px] uppercase font-mono">Detailed Description</label>
                        <textarea 
                          rows={2}
                          required
                          value={ticketDesc}
                          onChange={(e) => setTicketDesc(e.target.value)}
                          placeholder="Kindly write down more details so your landlord is aware..."
                          className="bg-black/40 border border-white/5 text-xs text-white rounded px-2.5 py-1.5 focus:outline-none w-full resize-none leading-normal"
                        />
                      </div>

                      <button 
                        type="submit"
                        className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-[11px] rounded-lg tracking-wider cursor-pointer shadow-md transition-all text-center font-mono"
                      >
                        File Repair Ticket
                      </button>
                    </form>

                    {/* Rented room complaint history lists */}
                    <div className="space-y-2">
                      <span className="text-[10px] text-amber-300 uppercase tracking-wider block font-black font-mono">Your Filed Complaints ({tenantRepairTickets.length})</span>
                      <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                        {tenantRepairTickets.length === 0 ? (
                          <span className="text-xs text-neutral-600 italic block py-4 text-center pb-2 bg-[#111116] border border-white/5 rounded-xl">No complaints submitted to landlord yet.</span>
                        ) : (
                          tenantRepairTickets.map(tk => (
                            <div key={tk.id} className="p-3 bg-[#111116] border border-white/5 rounded-xl space-y-1.5 text-xs">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-gray-400 font-mono">[{tk.category}]</span>
                                <span className={`px-1.5 py-0.2 rounded uppercase text-[8px] font-bold ${
                                  tk.status === 'Settled' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-300'
                                }`}>{tk.status}</span>
                              </div>
                              <h5 className="font-extrabold text-white text-[12px]">{tk.title}</h5>
                              <p className="text-[10.5px] text-neutral-400 leading-relaxed font-normal">{tk.description}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>

                </div>

              </div>
            </div>
          )}

        </div>

      </div>

      {/* ========================================================== */}
      {/* GLOBAL OVERLAY DISPLAY 1: DETAILED PRINTABLE VOUCHER RECEIPT */}
      {/* ========================================================== */}
      {receiptOverlayItem && (
        <div className="fixed inset-0 bg-black/85 z-[99999] flex items-center justify-center p-4 select-none">
          <div className="bg-[#111116] border border-indigo-500/35 rounded-2xl p-6 w-full max-w-[340px] shadow-2xl space-y-4 animate-scaleUp relative">
            
            {/* Stamp Logo decoration */}
            <div className="absolute top-2 right-2 p-1 bg-indigo-500/10 text-indigo-400 rounded-full">
              <CheckCircle2 className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1">
              <span className="text-[10px] text-indigo-400 uppercase tracking-widest font-black block">
                Official Digital Record
              </span>
              <h3 className="text-sm font-black text-white">NYUMBA SMART CO. UG</h3>
              <span className="text-[9px] text-gray-500 block">Sanyu Plaza Block C, Kampala Rd</span>
            </div>

            {/* Receipt core information lists */}
            <div className="border-t border-b border-dashed border-white/10 py-3 text-[10.5px] space-y-2 font-mono text-gray-300">
              <div className="flex justify-between">
                <span className="text-neutral-500">Record Code:</span>
                <span className="font-bold text-white uppercase">{receiptOverlayItem.receiptNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Voucher Date:</span>
                <span className="text-white">{receiptOverlayItem.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Type Category:</span>
                <span className="text-white font-bold">{receiptOverlayItem.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Room Unit:</span>
                <span className="text-white text-right max-w-[170px] truncate">{receiptOverlayItem.propertyName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Carrier Method:</span>
                <span className="text-emerald-400 font-bold">{receiptOverlayItem.provider}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-dashed border-white/5 text-[12px]">
                <span className="text-white font-black">TOTAL PAID:</span>
                <span className="text-emerald-400 font-black">Shs {receiptOverlayItem.amount.toLocaleString()}</span>
              </div>
            </div>

            {/* Official seal footer */}
            <div className="text-center text-[9px] text-neutral-500 italic leading-snug">
              "Thank you for transacting using Nyumba Smart mobile framework. This voucher has been recorded securely on both landlord and tenant records."
            </div>

            <button 
              onClick={() => setReceiptOverlayItem(null)}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Close Record Vouchers
            </button>

          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* GLOBAL OVERLAY 2: PAYMENT STATUS — waiting for approval on phone */}
      {/* ========================================================== */}
      <UssdPrompt 
        isOpen={ussdOpen}
        amount={ussdAmount}
        paymentTarget={ussdTargetName}
        provider={ussdProvider}
        phoneNumber={ussdPhone}
        onCancel={handleUssdDismiss}
      />

    </div>
  );
}
