// src/lib/pdfExport.ts
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';

/**
 * Format a number as Nigerian Naira
 */
const formatNaira = (amount: number): string => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

interface LoanReportData {
  id: string;
  amount: number;
  interest: number;
  interest_amount: number;
  disbursed_amount: number;
  duration: number;
  status: string;
  start_date: string;
  due_date: string;
  outstanding_balance: number;
  daily_repayment_amount: number;
  loan_officers?: {
    name: string;
    branch: string;
  };
  transactions?: Array<{
    type: string;
    amount: number;
    date: string;
  }>;
}

interface OfficerSummary {
  name: string;
  branch: string;
  totalDisbursed: number;
  totalRepaid: number;
  outstanding: number;
  loans: number;
}

/**
 * Generate and download loan report as PDF
 * Includes loan history and summary with officer details
 */
export async function exportLoanReportPDF(loanId?: string): Promise<void> {
  try {
    // Fetch loans data with officer info
    let loansQuery = supabase
      .from('loans')
      .select(`
        id,
        amount,
        interest,
        interest_amount,
        disbursed_amount,
        duration,
        status,
        start_date,
        due_date,
        outstanding_balance,
        daily_repayment_amount,
        loan_officers(id, name, branch)
      `)
      .order('created_at', { ascending: false });

    if (loanId) {
      loansQuery = loansQuery.eq('id', loanId);
    }

    const { data: loans, error: loansError } = await loansQuery;
    
    if (loansError) throw loansError;
    if (!loans || loans.length === 0) {
      throw new Error('No loans found');
    }

    // Fetch transactions for the loans
    const loanIds = loans.map((l: any) => l.id);
    const { data: transactions } = await supabase
      .from('transactions')
      .select('loan_id, type, amount, date')
      .in('loan_id', loanIds)
      .order('date', { ascending: false });

    // Create PDF document
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Add header
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text('Aiders Loan Hub', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text('Loan Report', pageWidth / 2, 28, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleDateString('en-NG', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })}`, pageWidth / 2, 34, { align: 'center' });

    let yPosition = 45;

    // Summary section
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 40);
    doc.text('Summary', 14, yPosition);
    yPosition += 8;

    // Calculate totals
    const totalDisbursed = loans.reduce((sum: number, l: any) => sum + Number(l.disbursed_amount || l.amount || 0), 0);
    const totalRepaid = transactions
      ?.filter((t: any) => t.type === 'repayment')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0) || 0;
    const totalOutstanding = loans.reduce((sum: number, l: any) => sum + Number(l.outstanding_balance || 0), 0);
    const activeLoans = loans.filter((l: any) => l.status === 'approved' || l.status === 'overdue').length;
    const overdueLoans = loans.filter((l: any) => l.status === 'overdue').length;

    // Summary table
    autoTable(doc, {
      startY: yPosition,
      head: [['Metric', 'Value']],
      body: [
        ['Total Loans', String(loans.length)],
        ['Active Loans', String(activeLoans)],
        ['Overdue Loans', String(overdueLoans)],
        ['Total Disbursed', formatNaira(totalDisbursed)],
        ['Total Repaid', formatNaira(totalRepaid)],
        ['Outstanding Balance', formatNaira(totalOutstanding)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] },
      margin: { left: 14, right: 14 },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;

    // Officer breakdown
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 40);
    doc.text('Officer Summary', 14, yPosition);
    yPosition += 8;

    // Group by officer
    const officerMap = new Map<string, OfficerSummary>();
    loans.forEach((loan: any) => {
      const officerName = loan.loan_officers?.name || 'Unknown';
      const branch = loan.loan_officers?.branch || 'N/A';
      const key = officerName;
      
      if (!officerMap.has(key)) {
        officerMap.set(key, {
          name: officerName,
          branch,
          totalDisbursed: 0,
          totalRepaid: 0,
          outstanding: 0,
          loans: 0,
        });
      }
      
      const summary = officerMap.get(key)!;
      summary.loans += 1;
      summary.totalDisbursed += Number(loan.disbursed_amount || loan.amount || 0);
      summary.outstanding += Number(loan.outstanding_balance || 0);
    });

    // Add repayments
    transactions?.forEach((t: any) => {
      const loan = loans.find((l: any) => l.id === t.loan_id);
      if (loan && t.type === 'repayment') {
        const officerName = loan.loan_officers?.name || 'Unknown';
        const summary = officerMap.get(officerName);
        if (summary) {
          summary.totalRepaid += Number(t.amount);
        }
      }
    });

    const officerData = Array.from(officerMap.values()).map(o => [
      o.name,
      o.branch,
      String(o.loans),
      formatNaira(o.totalDisbursed),
      formatNaira(o.totalRepaid),
      formatNaira(o.outstanding),
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Officer Name', 'Branch', 'Loans', 'Disbursed', 'Repaid', 'Outstanding']],
      body: officerData,
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] },
      margin: { left: 14, right: 14 },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;

    // Loan details table
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 40);
    doc.text('Loan Details', 14, yPosition);
    yPosition += 8;

    const loanDetails = loans.map((l: any) => [
      l.id.slice(0, 8) + '...',
      l.loan_officers?.name || '—',
      formatNaira(l.amount),
      formatNaira(l.disbursed_amount),
      formatNaira(l.outstanding_balance),
      l.status,
      l.start_date,
      l.due_date,
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Loan ID', 'Officer', 'Amount', 'Disbursed', 'Balance', 'Status', 'Start', 'Due']],
      body: loanDetails,
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] },
      margin: { left: 14, right: 14 },
    });

    // Add footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }

    // Save the PDF
    const fileName = loanId 
      ? `loan-report-${loanId.slice(0, 8)}.pdf` 
      : `loan-report-${new Date().toISOString().split('T')[0]}.pdf`;
    
    doc.save(fileName);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

/**
 * Export a single loan's repayment schedule
 */
export async function exportLoanSchedulePDF(loanId: string): Promise<void> {
  try {
    const { data: schedules } = await supabase
      .from('repayment_schedules')
      .select('*')
      .eq('loan_id', loanId)
      .order('due_date', { ascending: true });

    if (!schedules || schedules.length === 0) {
      throw new Error('No repayment schedule found');
    }

    const { data: loan } = await supabase
      .from('loans')
      .select(`
        id, amount, interest, interest_amount, duration, status,
        loan_officers(id, name)
      `)
      .eq('id', loanId)
      .single();

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text('Repayment Schedule', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    const officerName = (loan as any)?.loan_officers?.name || 'Unknown';
    doc.text(`Loan Officer: ${officerName}`, 14, 35);
    doc.text(`Loan ID: ${loanId.slice(0, 8)}...`, 14, 42);
    doc.text(`Total Amount: ${formatNaira((loan as any)?.amount || 0)}`, 14, 49);
    doc.text(`Duration: ${(loan as any)?.duration || 0} days`, 14, 56);

    // Schedule table
    const scheduleData = schedules.map((s: any) => [
      s.due_date,
      formatNaira(s.expected_amount),
      s.actual_amount ? formatNaira(s.actual_amount) : '—',
      s.status.toUpperCase(),
      s.paid_date || '—',
    ]);

    autoTable(doc, {
      startY: 65,
      head: [['Due Date', 'Expected', 'Paid', 'Status', 'Paid Date']],
      body: scheduleData,
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] },
      margin: { left: 14, right: 14 },
    });

    // Save
    doc.save(`repayment-schedule-${loanId.slice(0, 8)}.pdf`);
  } catch (error) {
    console.error('Error generating schedule PDF:', error);
    throw error;
  }
}