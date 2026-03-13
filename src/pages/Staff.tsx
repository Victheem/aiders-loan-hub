import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'loan_officer', label: 'Loan Officer' },
  { value: 'staff', label: 'Staff' },
] as const;

const Staff = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['staff-users'],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('user_id, role');
      if (error) throw error;
      if (!roles || roles.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', roles.map(r => r.user_id));

      return (profiles || []).map(p => {
        const roleRow = roles.find(r => r.user_id === p.id);
        return { ...p, role: roleRow?.role || 'staff' };
      });
    },
  });

  const createUser = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke('seed-admin', {
        body: { email: form.email, password: form.password, name: form.name, role: form.role },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      if (form.role === 'loan_officer') {
        await supabase.from('loan_officers').insert({
          user_id: res.data.user_id,
          name: form.name,
          branch: '',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-users'] });
      queryClient.invalidateQueries({ queryKey: ['loan-officers'] });
      toast.success('User created');
      setForm({ name: '', email: '', password: '', role: 'staff' });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole as any })
        .eq('user_id', userId);
      if (error) throw error;

      // If changing to loan_officer, ensure loan_officers record exists
      if (newRole === 'loan_officer') {
        const { data: existing } = await supabase
          .from('loan_officers')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        if (!existing) {
          const profile = users.find((u: any) => u.id === userId);
          await supabase.from('loan_officers').insert({
            user_id: userId,
            name: profile?.name || '',
            branch: '',
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-users'] });
      queryClient.invalidateQueries({ queryKey: ['loan-officers'] });
      toast.success('Role updated');
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (user?.role !== 'super_admin') return <div className="text-center text-muted-foreground py-12">Access denied</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">User Management</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create User Account</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createUser.mutate(); }} className="space-y-4">
              <div className="space-y-2"><Label>Full Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Password</Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} /></div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={createUser.isPending}>
                {createUser.isPending ? 'Creating...' : 'Create User'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No users found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u: any) => (
                    <tr key={u.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{u.name}</td>
                      <td className="px-4 py-3 text-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <Select
                          value={u.role}
                          onValueChange={(v) => updateRole.mutate({ userId: u.id, newRole: v })}
                          disabled={u.id === user?.id}
                        >
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
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

export default Staff;
