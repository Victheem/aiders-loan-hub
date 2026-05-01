// src/services/loans.ts
import { supabase } from '@/integrations/supabase/client';

// Type definition for a loan
export interface Loan {
  officer_id: string;
  amount: number;
  interest: number;
  interest_amount: number;
  disbursed_amount: number;
  duration: number;
  status: string;
  start_date: string; // ISO string: 'YYYY-MM-DD'
  due_date: string;   // ISO string
  outstanding_balance: number;
  daily_repayment_amount: number;
}

// Generate a UUID using native browser crypto
export const generateLoanId = (): string => crypto.randomUUID();

// Function to insert a new loan into Supabase
export async function insertLoan(loan: Loan) {
  const id = generateLoanId();

  const { data, error } = await supabase
    .from('loans')
    .insert([
      {
        id,
        officer_id: loan.officer_id,
        amount: loan.amount,
        interest: loan.interest,
        interest_amount: loan.interest_amount,
        disbursed_amount: loan.disbursed_amount,
        duration: loan.duration,
        status: loan.status,
        start_date: loan.start_date,
        due_date: loan.due_date,
        outstanding_balance: loan.outstanding_balance,
        daily_repayment_amount: loan.daily_repayment_amount,
      },
    ])
    .select(); // ensure we get the inserted row back

  if (error) throw error;

  return data;
}

// Generate repayment schedule using database function
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateRepaymentSchedule(
  loanId: string,
  disbursedAmount: number,
  interestRate: number,
  workingDays: number,
  startDate: string
) {
  const { data, error } = await (supabase as any).rpc('generate_working_days_schedule', {
    _loan_id: loanId,
    _disbursed_amount: disbursedAmount,
    _interest_rate: interestRate,
    _working_days: workingDays,
    _start_date: startDate
  });

  if (error) throw error;
  return data;
}

// Handle repayment using database function
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordRepayment(
  loanId: string,
  amount: number,
  paymentDate?: string
) {
  const { data, error } = await (supabase as any).rpc('handle_repayment', {
    _loan_id: loanId,
    _amount: amount,
    _payment_date: paymentDate || new Date().toISOString().split('T')[0]
  });

  if (error) throw error;
  return data;
}

// Mark schedules as overdue
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkOverdueSchedules() {
  const { data, error } = await (supabase as any).rpc('mark_schedules_overdue');
  if (error) throw error;
  return data;
}

// Recalculate loan balance from schedules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recalculateLoanBalance(loanId: string) {
  const { data, error } = await (supabase as any).rpc('recalculate_loan_balance', {
    _loan_id: loanId
  });
  if (error) throw error;
  return data;
}

// Optional: helper to calculate interest, disbursed amount, daily repayment
// Note: This is for display purposes only - DB function handles actual schedule export const calculateLoan = (amount: number, interest: number, duration: number) => {
//   const interestAmount = (amount * interest) / 100;
//   const disbursedAmount = amount + interestAmount;
//   const dailyRepayment = disbursedAmount / duration;
//
//   const startDate = new Date();
//   const dueDate = new Date();
//   dueDate.setDate(startDate.getDate() + duration);
//
//   return {
//     interest_amount: interestAmount,
//     disbursed_amount: disbursedAmount,
//     daily_repayment_amount: dailyRepayment,
//     start_date: startDate.toISOString().split('T')[0],
//     due_date: dueDate.toISOString().split('T')[0],
//   };
// };