export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'landlord' | 'tenant' | 'admin';
  landlordCode?: string; // Generated for landlords, entered by tenants
  propertyId?: string; // Rented unit ID
  unitsCount?: number; // Estimated units for subscription calculations
  subscriptionTier?: string; // e.g. "Free", "Standard", "Premium"
  trialEndDate?: string;
}

export interface Property {
  id: string;
  name: string;
  address: string;
  tenantName: string;
  tenantPhone: string;
  monthlyRent: number; // in UGX
  status: 'Paid' | 'Overdue' | 'Partially Paid';
  landlordCode: string; // Belongs to this landlord
}

export interface FinancialRecord {
  id: string;
  propertyId: string;
  propertyName: string;
  amount: number; // in UGX
  date: string;
  type: 'Rent Payment' | 'Maintenance Cost' | 'Subscription Fee' | 'Message Billing';
  provider: 'MTN Mobile Money' | 'Airtel Money' | 'Bank Transfer' | 'System';
  senderPhoneOrAcc: string;
  receiver: string;
  status: 'Cleared' | 'Pending Push' | 'Pending Cloud Sync' | 'Failed';
  receiptNo: string;
  offline?: boolean;
  receiptPdf?: string;
}

export interface Complaint {
  id: string;
  propertyId: string;
  propertyName: string;
  title: string;
  description: string;
  category: 'Plumbing' | 'Electricity' | 'Water' | 'Rent Issue' | 'Other';
  status: 'Received' | 'In Progress' | 'Settled';
  priority: 'Low' | 'Medium' | 'High';
  raisedBy: string;
  date: string;
  offline?: boolean;
}

export interface DeveloperLog {
  timestamp: string;
  type: 'sync' | 'auth' | 'ussd' | 'payment' | 'complaint' | 'system' | 'success' | 'warn';
  message: string;
}

export interface SubscriptionTier {
  id: string;
  name: string;
  minUnits: number;
  maxUnits: number;
  pricePerMonth: number; // in UGX
}

export interface InAppMessage {
  id: string;
  landlordCode: string;
  tenantPhone?: string; // empty means Broadcast to All
  text: string;
  date: string;
  sender: 'landlord' | 'tenant' | 'system';
}
