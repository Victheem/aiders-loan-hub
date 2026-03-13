import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatNaira, getStatusColor } from '@/lib/format';
import { Search, Plus, Pencil, Calendar } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const emptyForm = { officer_id: '', amount: '', interest: '10', duration: '20', status: 'pending', disbursement_date: '' };

const Loans = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: officers = [] } = useQuery({
    queryKey: ['officers-list'],
    queryFn: async () => {
      const { data } = await supabase.from('loan_officers').select('id, name');
      return data || [];
    },
  });

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ['loans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loans')
        .select('*, loan_officers(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: schedule = [] } = useQuery({
    queryKey: ['repayment-schedule', selectedLoanId],
    enabled: !!selectedLoanId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('repayment_schedules')
        .select('*')
        .eq('loan_id', selectedLoanId!)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      const interest = Number(form.interest);
      const duration = Number(form.duration);
      const totalWithInterest = amount + (amount * interest / 100);
      
      const payload = {
        officer_id: form.officer_id,
        amount,
        interest,
        duration,
        status: form.status,
        disbursement_date: form.disbursement_date || null,
        outstanding_balance: totalWithInterest,
        total_with_interest: totalWithInterest,
        daily_repayment_amount: duration > 0 ? Math.round((totalWithInterest / duration) * 100) / 100 : 0,
      };

      let loanId: string;

      if (editingId) {
        const { error } = await supabase.from('loans').update(payload).eq('id', editingId);
        if (error) throw error;
        loanId = editingId;
      } else {
        const { data, error } = await supabase.from('loans').insert(payload).select('id').single();
        if (error) throw error;
        loanId = data.id;

        if (form.disbursement_date) {
          await supabase.from('transactions').insert({
            loan_id: loanId,
            type: 'disbursement',
            amount,
            date: form.disbursement_date,
          });
        }
      }

      if (form.disbursement_date && duration > 0) {
        const { error: rpcError } = await supabase.rpc('generate_repayment_schedule', {
          _loan_id: loanId,
          _total_amount: totalWithInterest,
          _start_date: form.disbursement_date,
          _duration_days: duration,
        });
        if (rpcError) console.error('Schedule generation error:', rpcError);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['repayment-schedule'] });
      toast.success(editingId ? 'Loan updated' : 'Loan created with repayment schedule');
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => { setForm(emptyForm); setEditingId(null); setOpen(false); };

  const handleEdit = (l: any) => {
    setForm({
      officer_id: l.officer_id,
      amount: String(l.amount),
      interest: String(l.interest),
      duration: String(l.duration),
      status: l.status,
      disbursement_date: l.disbursement_date || '',
    });
    setEditingId(l.id);
    setOpen(true);
  };

  const viewSchedule = (loanId: string) => {
    setSelectedLoanId(loanId);
    setScheduleOpen(true);
  };

  const getScheduleStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-success/10 text-success';
      case 'missed': return 'bg-destructive/10 text-destructive';
      case 'late': return 'bg-warning/10 text-warning';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const filtered = loans.filter((l: any) =>
    l.loan_officers?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Loans</h1>
        <div className="flex gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by officer..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-10" />
          </div>
          <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); setOpen(v); }}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> Disburse Loan</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit Loan' : 'Disburse New Loan'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Loan Officer</Label>
                  <Select value={form.officer_id} onValueChange={v => setForm({ ...form, officer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select loan officer" /></SelectTrigger>
                    <SelectContent>
                      {officers.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Loan Amount (₦)</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Interest (%)</Label><Input type="number" value={form.interest} onChange={e => setForm({ ...form, interest: e.target.value })} required /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Repayment Days</Label>
                    <Input type="number" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} required placeholder="20" />
                    <p className="text-[10px] text-muted-foreground">Working days (Mon–Fri), default 20</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="repaid">Repaid</SelectItem>
                        <SelectItem value="overdue">Overdue</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2"><Label>Disbursement Date</Label><Input type="date" value={form.disbursement_date} onChange={e => setForm({ ...form, disbursement_date: e.target.value })} required /></div>
                
                {form.amount && form.interest && form.duration && (
                  <Card className="bg-muted/50">
                    <CardContent className="p-3 space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Total with Interest:</span><span className="font-semibold text-foreground">{formatNaira(Number(form.amount) + Number(form.amount) * Number(form.interest) / 100)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Daily Repayment:</span><span className="font-semibold text-foreground">{formatNaira(Math.round((Number(form.amount) + Number(form.amount) * Number(form.interest) / 100) / Number(form.duration) * 100) / 100)}</span></div>
                    </CardContent>
                  </Card>
                )}
                
                <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Processing...' : editingId ? 'Update' : 'Disburse Loan'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading loans...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No loans found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Loan Officer</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total + Interest</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Daily</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Days</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Outstanding</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((loan: any) => (
                    <tr key={loan.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{loan.loan_officers?.name}</td>
                      <td className="px-4 py-3 text-right text-foreground">{formatNaira(loan.amount)}</td>
                      <td className="px-4 py-3 text-right text-foreground">{formatNaira(Number(loan.total_with_interest) || loan.amount)}</td>
                      <td className="px-4 py-3 text-right text-foreground font-medium">{formatNaira(Number(loan.daily_repayment_amount) || 0)}</td>
                      <td className="px-4 py-3 text-center text-foreground">{loan.duration}d</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${getStatusColor(loan.status)}`}>{loan.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">{formatNaira(loan.outstanding_balance)}</td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => viewSchedule(loan.id)} title="View Schedule"><Calendar className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(loan)}><Pencil className="w-4 h-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" /> Repayment Schedule</DialogTitle>
          </DialogHeader>
          {schedule.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No schedule generated yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Day</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Due Date</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Expected</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Paid</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((s: any, i: number) => (
                    <tr key={s.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 text-foreground">{new Date(s.due_date).toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                      <td className="px-3 py-2 text-right text-foreground">{formatNaira(Number(s.expected_amount))}</td>
                      <td className="px-3 py-2 text-right text-foreground">{formatNaira(Number(s.actual_amount))}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${getScheduleStatusColor(s.status)}`}>{s.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Loans;
