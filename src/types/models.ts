export interface User {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'loan_officer' | 'staff';
  avatar?: string;
}

export interface LoanOfficer {
  id: string;
  userId: string;
  name: string;
  branch: string;
  totalDisbursed: number;
  totalAmount: number;
  clientCount: number;
}

export interface Client {
  id: string;
  fullName: string;
  bvn: string;
  phone: string;
  email: string;
  address: string;
  officerId: string;
  officerName: string;
  createdAt: string;
}

export interface Loan {
  id: string;
  clientId: string;
  clientName: string;
  amount: number;
  interest: number;
  duration: number;
  status: 'pending' | 'approved' | 'repaid' | 'overdue';
  disbursementDate: string;
  outstandingBalance: number;
}

export interface Transaction {
  id: string;
  loanId: string;
  clientName: string;
  type: 'disbursement' | 'repayment';
  amount: number;
  date: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  timestamp: string;
}

export interface KPIData {
  totalLoanBalance: number;
  totalDisbursed: number;
  totalIncome: number;
  loanOfficerCount: number;
}
