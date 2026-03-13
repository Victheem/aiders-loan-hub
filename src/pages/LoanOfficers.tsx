import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { formatNaira } from '@/lib/format';
import { Briefcase, MapPin, Plus, Pencil, Trash2, Phone, AlertTriangle, Shield, CreditCard } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import { toast } from 'sonner';

const getRiskLevel = (score: number) => {
  if (score >= 60) return { label: 'High Risk', color: 'bg-destructive/10 text-destructive', icon: AlertTriangle };
  if (score >= 30) return { label: 'Medium Risk', color: 'bg-warning/10 text-warning', icon: AlertTriangle };
  return { label: 'Low Risk', color: 'bg-success/10 text-success', icon: Shield };
};

const LoanOfficers = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', branch: '', phone: '', latitude: '', longitude: '' });

  const { data: officers = [], isLoading } = useQuery({
    queryKey: ['loan-officers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_officers').select('*').order('created_at', { ascending: false });
      if (error) throw error;

      const enriched = await Promise.all(
        (data || []).map(async (o) => {
          const { data: loans } = await supabase.from('loans').select('amount, outstanding_balance').eq('officer_id', o.id);
          const totalDisbursed = (loans || []).reduce((s, l) => s + Number(l.amount), 0);
          const totalOutstanding = (loans || []).reduce((s, l) => s + Number(l.outstanding_balance), 0);
          const loanCount = (loans || []).length;

          let riskScore = 0;
          try {
            const { data: scoreData } = await supabase.rpc('calculate_officer_risk_score', { _officer_id: o.id });
            riskScore = Number(scoreData) || 0;
          } catch {}

          return { ...o, loanCount, totalDisbursed, totalOutstanding, riskScore };
        })
      );
      return enriched;
    },
  });

  const createOfficer = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke('seed-admin', {
        body: { email: form.email, password: form.password, name: form.name, role: 'loan_officer' },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      const { error } = await supabase.from('loan_officers').insert({
        user_id: res.data.user_id,
        name: form.name,
        branch: form.branch,
        phone: form.phone,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan-officers'] });
      toast.success('Loan officer created');
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateOfficer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('loan_officers').update({
        name: form.name,
        branch: form.branch,
        phone: form.phone,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
      }).eq('id', editingId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan-officers'] });
      toast.success('Officer updated');
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteOfficer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('loan_officers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan-officers'] });
      toast.success('Officer removed');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => {
    setForm({ name: '', email: '', password: '', branch: '', phone: '', latitude: '', longitude: '' });
    setEditingId(null);
    setOpen(false);
  };

  const handleEdit = (o: any) => {
    setForm({ name: o.name, email: '', password: '', branch: o.branch, phone: o.phone || '', latitude: o.latitude?.toString() || '', longitude: o.longitude?.toString() || '' });
    setEditingId(o.id);
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) updateOfficer.mutate();
    else createOfficer.mutate();
  };

  if (user?.role !== 'super_admin') return <div className="text-center text-muted-foreground py-12">Access denied</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Loan Officers</h1>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); setOpen(v); }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add Officer</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Officer' : 'Add Loan Officer'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2"><Label>Full Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
              {!editingId && (
                <>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Password</Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} /></div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Branch/Location</Label><Input value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Phone (WhatsApp)</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+234..." /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Latitude</Label><Input type="number" step="any" value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} placeholder="e.g. 6.5244" /></div>
                <div className="space-y-2"><Label>Longitude</Label><Input type="number" step="any" value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} placeholder="e.g. 3.3792" /></div>
              </div>
              <Button type="submit" className="w-full" disabled={createOfficer.isPending || updateOfficer.isPending}>
                {createOfficer.isPending || updateOfficer.isPending ? 'Saving...' : editingId ? 'Update' : 'Create Officer'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      ) : officers.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">No loan officers yet. Add one to get started.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {officers.map((officer: any) => {
            const risk = getRiskLevel(officer.riskScore);
            return (
              <Card key={officer.id} className="animate-fade-in">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center">
                        <span className="text-sm font-bold text-primary-foreground">{officer.name.split(' ').map((n: string) => n[0]).join('')}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{officer.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> {officer.branch || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(officer)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteOfficer.mutate(officer.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </div>

                  {officer.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-3"><Phone className="w-3 h-3" /> {officer.phone}</p>
                  )}

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground">Disbursed</p>
                      <p className="text-xs font-semibold text-foreground">{formatNaira(officer.totalDisbursed)}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground">Outstanding</p>
                      <p className="text-xs font-semibold text-foreground">{formatNaira(officer.totalOutstanding)}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground">Loans</p>
                      <p className="text-xs font-semibold text-foreground flex items-center justify-center gap-1"><CreditCard className="w-3 h-3" /> {officer.loanCount}</p>
                    </div>
                  </div>

                  <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium ${risk.color}`}>
                    <risk.icon className="w-3.5 h-3.5" />
                    {risk.label} (Score: {officer.riskScore})
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LoanOfficers;
