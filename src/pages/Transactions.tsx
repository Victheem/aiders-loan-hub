import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatNaira } from '@/lib/format';
import { ArrowDownLeft, ArrowUpRight, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const Transactions = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ loan_id: '', type: 'repayment', amount: '', date: new Date().toISOString().split('T')[0] });

  const { data: loans = [] } = useQuery({
    queryKey: ['loans-list'],
    queryFn: async () => {
      const { data } = await supabase.from('loans').select('id, amount, outstanding_balance, daily_repayment_amount, loan_officers(name)');
      return data || [];
    },
  });

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*, loans(loan_officers(name))')
        .order('date', { ascending: false });
      if (error) throw error;
      return data;
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
      setForm({ loan_id: '', type: 'repayment', amount: '', date: new Date().toISOString().split('T')[0] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleLoanSelect = (loanId: string) => {
    setForm(prev => {
      const loan = loans.find((l: any) => l.id === loanId);
      return {
        ...prev,
        loan_id: loanId,
        amount: prev.type === 'repayment' && loan ? String(Number(loan.daily_repayment_amount)) : prev.amount,
      };
    });
  };

  const filtered = transactions.filter((tx: any) =>
    (tx.loans?.loan_officers?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    tx.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
        <div className="flex gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-10" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> Record Payment</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Transaction</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4">
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
                  <div className="space-y-2"><Label>Amount (₦)</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
                </div>
                {form.loan_id && form.type === 'repayment' && (
                  <p className="text-xs text-muted-foreground">
                    Daily repayment: {formatNaira(Number(loans.find((l: any) => l.id === form.loan_id)?.daily_repayment_amount) || 0)}
                  </p>
                )}
                <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required /></div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Saving...' : 'Record Transaction'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading transactions...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No transactions found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Loan Officer</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tx: any) => (
                    <tr key={tx.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {tx.type === 'disbursement' ? <ArrowUpRight className="w-4 h-4 text-destructive" /> : <ArrowDownLeft className="w-4 h-4 text-success" />}
                          <span className="capitalize text-foreground font-medium">{tx.type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground">{tx.loans?.loan_officers?.name || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{formatNaira(tx.amount)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{tx.date}</td>
                    </tr>
                  ))}
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
