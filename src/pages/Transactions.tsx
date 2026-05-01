import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatNaira } from '@/lib/format';
import { ArrowDownLeft, ArrowUpRight, Plus, Search, AlertTriangle, TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const Transactions = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    loan_id: '',
    type: 'repayment',
    amount: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [latestLoanId, setLatestLoanId] = useState<string | null>(null);

  // Fetch all loans with officer info
  const { data: loans = [] } = useQuery({
    queryKey: ['loans-list'],
    queryFn: async () => {
      const { data: loansData } = await supabase
        .from('loans')
        .select('id, amount, outstanding_balance, daily_repayment_amount, officer_id, status, start_date, due_date, interest_amount');
      
      if (!loansData) return [];
      
      // Get unique officer IDs
      const officerIds = [...new Set(loansData.map(l => l.officer_id).filter(Boolean))];
      let officersData: any[] = [];
      
      if (officerIds.length > 0) {
        const { data: offData } = await supabase
          .from('loan_officers')
          .select('id, name, branch')
          .in('id', officerIds);
        officersData = offData || [];
      }
      
      const officersMap = new Map(officersData.map(o => [o.id, o]));
      
      return loansData.map(loan => ({
        ...loan,
        loan_officers: officersMap.get(loan.officer_id) || null,
      }));
    },
    refetchInterval: 5000,
  });

  // Fetch all transactions
  const { data: transactions = [], isLoading, error } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      // First get all transactions
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });
      
      if (txError) {
        console.error('Transaction fetch error:', txError);
        return [];
      }
      
      console.log('Transactions fetched:', txData?.length || 0);
      
      if (!txData || txData.length === 0) return [];
      
      // Get all loan IDs
      const loanIds = [...new Set(txData.map(t => t.loan_id))];
      console.log('Loan IDs:', loanIds);
      
      // Fetch loans
      const { data: loansData, error: loansError } = await supabase
        .from('loans')
        .select('id, amount, outstanding_balance, status, start_date, due_date, officer_id, interest_amount')
        .in('id', loanIds);
      
      if (loansError) {
        console.error('Loans fetch error:', loansError);
      }
      
      // Fetch loan officers for those loans
      const officerIds = [...new Set((loansData || []).map(l => l.officer_id).filter(Boolean))];
      let officersData: any[] = [];
      if (officerIds.length > 0) {
        const { data: offData, error: officersError } = await supabase
          .from('loan_officers')
          .select('id, name, branch')
          .in('id', officerIds);
        
        if (officersError) {
          console.error('Officers fetch error:', officersError);
        }
        officersData = offData || [];
      }
      
      console.log('Loans fetched:', loansData?.length || 0);
      console.log('Officers fetched:', officersData.length);
      
      // Map loans and officers together
      const loansMap = new Map((loansData || []).map(l => [l.id, l]));
      const officersMap = new Map(officersData.map(o => [o.id, o]));
      
      return txData.map(tx => {
        const loan = loansMap.get(tx.loan_id);
        const officer = loan ? officersMap.get(loan.officer_id) : null;
        return {
          ...tx,
          loans: loan ? { ...loan, loan_officers: officer } : null,
        };
      });
    },
    refetchInterval: 5000,
  });

  // Calculate officer performance metrics
  const { data: officerStats = [] } = useQuery({
    queryKey: ['officer-performance'],
    queryFn: async () => {
      const { data: allLoans } = await supabase
        .from('loans')
        .select('id, officer_id, amount, outstanding_balance, status, disbursed_amount, loan_officers(id,name)');

      const { data: allSchedules } = await supabase
        .from('repayment_schedules')
        .select('id, status, due_date, expected_amount');

      const stats: Record<string, any> = {};

      (allLoans || []).forEach((loan: any) => {
        if (!stats[loan.officer_id]) {
          stats[loan.officer_id] = {
            officerId: loan.officer_id,
            officerName: loan.loan_officers?.name || 'Unknown',
            totalDisbursed: 0,
            totalOutstanding: 0,
            totalLoans: 0,
            activeLoans: 0,
            overdueLoans: 0,
            repaidLoans: 0,
            overdueAmount: 0,
          };
        }
        stats[loan.officer_id].totalDisbursed += Number(loan.disbursed_amount || 0);
        stats[loan.officer_id].totalOutstanding += Number(loan.outstanding_balance || 0);
        stats[loan.officer_id].totalLoans += 1;

        if (loan.status === 'active' || loan.status === 'pending') {
          stats[loan.officer_id].activeLoans += 1;
        } else if (loan.status === 'overdue') {
          stats[loan.officer_id].overdueLoans += 1;
          stats[loan.officer_id].overdueAmount += Number(loan.outstanding_balance || 0);
        } else if (loan.status === 'repaid') {
          stats[loan.officer_id].repaidLoans += 1;
        }
      });

      return Object.values(stats);
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);

      const { error } = await supabase.from('transactions').insert({
        loan_id: form.loan_id,
        type: form.type,
        amount,
        date: form.date,
      });
      if (error) throw error;

      if (form.type === 'repayment') {
        const { data: currentLoan } = await supabase.from('loans').select('outstanding_balance').eq('id', form.loan_id).single();
        if (currentLoan) {
          const newBalance = Math.max(0, Number(currentLoan.outstanding_balance) - amount);
          await supabase.from('loans').update({
            outstanding_balance: newBalance,
            status: newBalance <= 0 ? 'repaid' : undefined,
          }).eq('id', form.loan_id);
        }

        const { data: pendingSchedule } = await supabase
          .from('repayment_schedules')
          .select('id')
          .eq('loan_id', form.loan_id)
          .eq('status', 'pending')
          .order('due_date', { ascending: true })
          .limit(1);

        if (pendingSchedule && pendingSchedule.length > 0) {
          await supabase.from('repayment_schedules').update({
            status: 'paid',
            actual_amount: amount,
            paid_date: form.date,
          }).eq('id', pendingSchedule[0].id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['repayment-schedule'] });
      toast.success('Transaction recorded');

      const latestLoan = loans.find((l: any) => l.id === latestLoanId);
      setForm({
        loan_id: latestLoan?.id || '',
        type: 'repayment',
        amount: latestLoan ? String(latestLoan.daily_repayment_amount) : '',
        date: new Date().toISOString().split('T')[0],
      });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleLoanSelect = (loanId: string) => {
    const loan = loans.find((l: any) => l.id === loanId);
    setForm(prev => ({
      ...prev,
      loan_id: loanId,
      amount: prev.type === 'repayment' && loan ? String(Number(loan.daily_repayment_amount)) : prev.amount,
    }));
  };

  useEffect(() => {
    if (latestLoanId && loans.length > 0) {
      handleLoanSelect(latestLoanId);
    }
  }, [latestLoanId, loans]);

  useEffect(() => {
    if (loans.length > 0) {
      setLatestLoanId(loans[0]?.id || null);
    }
  }, []);

  const getLoanStatusInfo = (loanStatus: string) => {
    switch (loanStatus) {
      case 'overdue':
        return { color: 'bg-red-100 text-red-800 border-red-200', label: 'Overdue', icon: AlertTriangle };
      case 'active':
        return { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Active', icon: TrendingUp };
      case 'repaid':
        return { color: 'bg-green-100 text-green-800 border-green-200', label: 'Cleared', icon: TrendingDown };
      case 'pending':
        return { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Pending', icon: TrendingUp };
      default:
        return { color: 'bg-gray-100 text-gray-800 border-gray-200', label: 'Unknown', icon: DollarSign };
    }
  };

  const getOfficerPerformance = (officerId: string) => {
    const stats = officerStats.find((o: any) => o.officerId === officerId);
    if (!stats) return { label: 'Unknown', color: 'text-gray-500' };

    const overdueRate = stats.totalLoans > 0 ? (stats.overdueLoans / stats.totalLoans) * 100 : 0;

    if (overdueRate > 30) {
      return { label: 'Poor Performance', color: 'text-red-600', bg: 'bg-red-50' };
    } else if (overdueRate > 10) {
      return { label: 'Needs Attention', color: 'text-yellow-600', bg: 'bg-yellow-50' };
    }
    return { label: 'Good', color: 'text-green-600', bg: 'bg-green-50' };
  };

  const filtered = transactions.filter((tx: any) => {
    const matchesSearch = (tx.loans?.loan_officers?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      tx.type.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || tx.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || tx.loans?.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Transaction History</h1>
        <div className="flex gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by officer or type..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-10" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> Record Payment</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Transaction</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Loan (Officer)</Label>
                  <Select value={form.loan_id} onValueChange={handleLoanSelect}>
                    <SelectTrigger><SelectValue placeholder="Select loan" /></SelectTrigger>
                    <SelectContent>
                      {loans.map((l: any) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.loan_officers?.name} — {formatNaira(l.amount)} (Bal: {formatNaira(Number(l.outstanding_balance))})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="repayment">Repayment</SelectItem>
                        <SelectItem value="disbursement">Disbursement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount (₦)</Label>
                    <Input
                      type="number"
                      value={form.amount}
                      placeholder="Enter amount"
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      required
                    />
                  </div>
                </div>
                {form.loan_id && form.type === 'repayment' && (
                  <p className="text-xs text-muted-foreground">
                    Daily repayment: {formatNaira(Number(loans.find((l: any) => l.id === form.loan_id)?.daily_repayment_amount) || 0)}
                  </p>
                )}
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Saving...' : 'Record Transaction'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5 text-red-600" />
              <span className="text-sm text-red-700">Total Disbursed</span>
            </div>
            <p className="text-xl font-bold text-red-800 mt-1">
              {formatNaira(loans.reduce((s: number, l: any) => s + Number(l.disbursed_amount || 0), 0))}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="w-5 h-5 text-green-600" />
              <span className="text-sm text-green-700">Total Repaid</span>
            </div>
            <p className="text-xl font-bold text-green-800 mt-1">{formatNaira(transactions.filter((t: any) => t.type === 'repayment').reduce((s: number, t: any) => s + Number(t.amount), 0))}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-blue-700">Interest Earned</span>
            </div>
            <p className="text-xl font-bold text-blue-800 mt-1">
              {formatNaira(loans.reduce((s: number, l: any) => s + Number(l.interest_amount || 0), 0))}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-yellow-600" />
              <span className="text-sm text-yellow-700">Net Outstanding</span>
            </div>
            <p className="text-xl font-bold text-yellow-800 mt-1">
              {formatNaira(loans.reduce((s: number, l: any) => s + Number(l.outstanding_balance || 0), 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Transaction Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="disbursement">Disbursement</SelectItem>
            <SelectItem value="repayment">Repayment</SelectItem>
            <SelectItem value="interest">Interest</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Loan Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="repaid">Cleared</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading transactions...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">Error loading transactions: {String(error)}</div>
          ) : transactions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>No transactions found</p>
              <p className="text-xs mt-2 text-muted-foreground">Create a loan to generate transactions</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No transactions match your filters</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="p-2 text-xs text-muted-foreground bg-muted/20">
                Showing {filtered.length} of {transactions.length} transactions
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Loan Officer</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Branch</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Loan Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Performance</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Loan Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tx: any) => {
                    const statusInfo = getLoanStatusInfo(tx.loans?.status || '');
                    const performance = getOfficerPerformance(tx.loans?.officer_id);
                    const Icon = statusInfo.icon;

                    return (
                      <tr key={tx.id} className={`border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors ${tx.loans?.status === 'overdue' ? 'bg-red-50/50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            <span>{tx.date}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {tx.type === 'disbursement' ? (
                              <ArrowUpRight className="w-4 h-4 text-red-600" />
                            ) : tx.type === 'repayment' ? (
                              <ArrowDownLeft className="w-4 h-4 text-green-600" />
                            ) : (
                              <DollarSign className="w-4 h-4 text-blue-600" />
                            )}
                            <span className="capitalize text-foreground font-medium">{tx.type}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground font-medium">{tx.loans?.loan_officers?.name || '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{tx.loans?.loan_officers?.branch || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge className={`${statusInfo.color} border text-xs`}>
                            <Icon className="w-3 h-3 mr-1" />
                            {statusInfo.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${performance.color}`}>
                            {performance.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">
                          {tx.type === 'disbursement' ? (
                            <span className="text-red-600">{formatNaira(tx.amount)}</span>
                          ) : (
                            <span className="text-green-600">{formatNaira(tx.amount)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {formatNaira(tx.loans?.outstanding_balance || 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Transactions;