import type { KPIData, LoanOfficer, Loan, Transaction, AuditLog, Client } from '@/types/models';

export const mockKPIs: KPIData = {
  totalLoanBalance: 1250000,
  totalDisbursed: 3500000,
  totalIncome: 500000,
  loanOfficerCount: 3,
};

export const mockOfficers: LoanOfficer[] = [
  { id: '1', userId: 'u2', name: 'Chloe Smith', branch: 'Lagos Main', totalDisbursed: 900000, totalAmount: 2500000, clientCount: 12 },
  { id: '2', userId: 'u3', name: 'Emma Johnson', branch: 'Abuja', totalDisbursed: 1000000, totalAmount: 1000000, clientCount: 8 },
  { id: '3', userId: 'u4', name: 'Henry Wilson', branch: 'Port Harcourt', totalDisbursed: 1600000, totalAmount: 2000000, clientCount: 15 },
];

export const mockClients: Client[] = [
  { id: 'c1', fullName: 'Adebayo Ogunlesi', bvn: '22345678901', phone: '08012345678', email: 'adebayo@email.com', address: '12 Marina St, Lagos', officerId: '1', officerName: 'Chloe Smith', createdAt: '2025-01-15' },
  { id: 'c2', fullName: 'Chioma Eze', bvn: '22345678902', phone: '08023456789', email: 'chioma@email.com', address: '5 Wuse Rd, Abuja', officerId: '2', officerName: 'Emma Johnson', createdAt: '2025-02-01' },
  { id: 'c3', fullName: 'Tunde Bakare', bvn: '22345678903', phone: '08034567890', email: 'tunde@email.com', address: '8 GRA, Port Harcourt', officerId: '3', officerName: 'Henry Wilson', createdAt: '2025-02-10' },
  { id: 'c4', fullName: 'Ngozi Okafor', bvn: '22345678904', phone: '08045678901', email: 'ngozi@email.com', address: '22 Allen Ave, Ikeja', officerId: '1', officerName: 'Chloe Smith', createdAt: '2025-01-20' },
  { id: 'c5', fullName: 'Ibrahim Musa', bvn: '22345678905', phone: '08056789012', email: 'ibrahim@email.com', address: '3 Gombe Rd, Gombe', officerId: '2', officerName: 'Emma Johnson', createdAt: '2025-03-01' },
];

export const mockLoans: Loan[] = [
  { id: 'l1', clientId: 'c1', clientName: 'Adebayo Ogunlesi', amount: 500000, interest: 10, duration: 12, status: 'approved', disbursementDate: '2025-01-20', outstandingBalance: 350000 },
  { id: 'l2', clientId: 'c2', clientName: 'Chioma Eze', amount: 300000, interest: 8, duration: 6, status: 'pending', disbursementDate: '', outstandingBalance: 300000 },
  { id: 'l3', clientId: 'c3', clientName: 'Tunde Bakare', amount: 750000, interest: 12, duration: 18, status: 'overdue', disbursementDate: '2024-06-15', outstandingBalance: 400000 },
  { id: 'l4', clientId: 'c4', clientName: 'Ngozi Okafor', amount: 200000, interest: 10, duration: 12, status: 'repaid', disbursementDate: '2024-01-10', outstandingBalance: 0 },
  { id: 'l5', clientId: 'c5', clientName: 'Ibrahim Musa', amount: 1000000, interest: 15, duration: 24, status: 'approved', disbursementDate: '2025-02-01', outstandingBalance: 900000 },
];

export const mockTransactions: Transaction[] = [
  { id: 't1', loanId: 'l1', clientName: 'Adebayo Ogunlesi', type: 'disbursement', amount: 500000, date: '2025-01-20' },
  { id: 't2', loanId: 'l1', clientName: 'Adebayo Ogunlesi', type: 'repayment', amount: 50000, date: '2025-02-20' },
  { id: 't3', loanId: 'l3', clientName: 'Tunde Bakare', type: 'disbursement', amount: 750000, date: '2024-06-15' },
  { id: 't4', loanId: 'l4', clientName: 'Ngozi Okafor', type: 'repayment', amount: 200000, date: '2025-01-10' },
  { id: 't5', loanId: 'l5', clientName: 'Ibrahim Musa', type: 'disbursement', amount: 1000000, date: '2025-02-01' },
  { id: 't6', loanId: 'l1', clientName: 'Adebayo Ogunlesi', type: 'repayment', amount: 100000, date: '2025-03-20' },
];

export const mockAuditLogs: AuditLog[] = [
  { id: 'a1', userId: 'u1', userName: 'Tola R.', action: 'Logged in', timestamp: '2025-02-14 09:00' },
  { id: 'a2', userId: 'u2', userName: 'Chloe Smith', action: 'Created loan for Adebayo Ogunlesi', timestamp: '2025-02-14 09:15' },
  { id: 'a3', userId: 'u1', userName: 'Tola R.', action: 'Approved loan L001', timestamp: '2025-02-14 09:30' },
  { id: 'a4', userId: 'u3', userName: 'Emma Johnson', action: 'Added client Chioma Eze', timestamp: '2025-02-14 10:00' },
  { id: 'a5', userId: 'u4', userName: 'Henry Wilson', action: 'Logged repayment for Tunde Bakare', timestamp: '2025-02-14 10:30' },
];

export const mockDisbursementByDate = [
  { date: '1/6/01', amount: 500000 },
  { date: '1/8/01', amount: 800000 },
  { date: '1/3/01', amount: 1200000 },
  { date: '1/5/01', amount: 1800000 },
  { date: '1/5/01', amount: 1500000 },
];
