import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { formatNaira } from '@/lib/format'
import { MapPin, Plus, Pencil, Trash2, Phone, AlertTriangle, Shield, CreditCard, ChevronDown, ChevronUp, Calendar } from 'lucide-react'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useState } from 'react'
import { toast } from 'sonner'

type Officer = {
  id: string
  name: string
  branch: string
  phone: string
  latitude: number | null
  longitude: number | null
  loanCount: number
  totalDisbursed: number
  totalOutstanding: number
  riskScore: number
}

const getRiskLevel = (score: number) => {
  if (score >= 60)
    return { label: 'High Risk', color: 'bg-destructive/10 text-destructive', icon: AlertTriangle }
  if (score >= 30)
    return { label: 'Medium Risk', color: 'bg-warning/10 text-warning', icon: AlertTriangle }
  return { label: 'Low Risk', color: 'bg-success/10 text-success', icon: Shield }
}

const LoanOfficers = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedOfficer, setExpandedOfficer] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    branch: '',
    phone: '',
    latitude: '',
    longitude: '',
  })

  // Fetch all loans for expansion feature
  const { data: allLoans = [] } = useQuery({
    queryKey: ['all-loans-for-expansion'],
    queryFn: async () => {
      const { data } = await supabase
        .from('loans')
        .select('*')
        .order('created_at', { ascending: false })
      return data || []
    },
  })

  const { data: officers = [], isLoading } = useQuery({
    queryKey: ['loan-officers'],
    queryFn: async () => {
      // First get all officers
      const { data: officerData, error: officerError } = await supabase
        .from('loan_officers')
        .select('*')
        .order('created_at', { ascending: false })

      if (officerError) throw officerError
      if (!officerData) return []

      // Then get loans for each officer
      const { data: loansData, error: loansError } = await supabase
        .from('loans')
        .select('officer_id, amount, disbursed_amount, outstanding_balance, status')

      if (loansError) throw loansError

      // Calculate stats per officer
      return (officerData || []).map((o: any) => {
        const officerLoans = (loansData || []).filter((l: any) => l.officer_id === o.id)
        const loanCount = officerLoans.length
        const totalDisbursed = officerLoans.reduce((sum: number, l: any) => sum + Number(l.disbursed_amount || l.amount || 0), 0)
        const totalOutstanding = officerLoans.reduce((sum: number, l: any) => sum + Number(l.outstanding_balance || 0), 0)
        const riskScore = 0 // Will be calculated from DB function if available

        return {
          ...o,
          loanCount,
          totalDisbursed,
          totalOutstanding,
          riskScore,
        }
      })
    },
  })

  const createOfficer = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('loan_officers')
        .insert({
          user_id: user.id,
          name: form.name,
          branch: form.branch,
          phone: form.phone,
          latitude: form.latitude ? Number(form.latitude) : null,
          longitude: form.longitude ? Number(form.longitude) : null,
        })
        .select()

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan-officers'] })
      toast.success('Loan officer created')
      resetForm()
    },
    onError: (e: any) => toast.error(e.message),
  })

  const updateOfficer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('loan_officers')
        .update({
          name: form.name,
          branch: form.branch,
          phone: form.phone,
          latitude: form.latitude ? Number(form.latitude) : null,
          longitude: form.longitude ? Number(form.longitude) : null,
        })
        .eq('id', editingId!)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan-officers'] })
      toast.success('Officer updated')
      resetForm()
    },
    onError: (e: any) => toast.error(e.message),
  })

  const deleteOfficer = useMutation({
    mutationFn: async (id: string) => {
      // First check if officer has loans
      const { data: loans } = await supabase
        .from('loans')
        .select('id')
        .eq('officer_id', id)

      if (loans && loans.length > 0) {
        // Delete associated loans first (cascade delete)
        const { error: loansError } = await supabase
          .from('loans')
          .delete()
          .eq('officer_id', id)
        
        if (loansError) throw loansError
      }

      // Now delete the officer
      const { error } = await supabase
        .from('loan_officers')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan-officers'] })
      toast.success('Officer removed')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const resetForm = () => {
    setForm({
      name: '',
      branch: '',
      phone: '',
      latitude: '',
      longitude: '',
    })
    setEditingId(null)
    setOpen(false)
  }

  const handleEdit = (o: Officer) => {
    setForm({
      name: o.name,
      branch: o.branch,
      phone: o.phone || '',
      latitude: o.latitude?.toString() || '',
      longitude: o.longitude?.toString() || '',
    })
    setEditingId(o.id)
    setOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingId) updateOfficer.mutate()
    else createOfficer.mutate()
  }

  if (user?.role !== 'super_admin') {
    return <div className="text-center text-muted-foreground py-12">Access denied</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Loan Officers</h1>

        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); setOpen(v) }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" /> Add Officer
            </Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Officer' : 'Add Loan Officer'}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Branch</Label>
                <Input
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  placeholder="+234..."
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={createOfficer.isPending || updateOfficer.isPending}
              >
                {createOfficer.isPending || updateOfficer.isPending
                  ? 'Saving...'
                  : editingId
                  ? 'Update Officer'
                  : 'Create Officer'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-8">
          Loading officers...
        </div>
      ) : officers.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          No loan officers yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {officers.map((officer: Officer) => {
            const risk = getRiskLevel(officer.riskScore)
            const initials = officer.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()

            return (
              <Card key={officer.id}>
                <CardContent className="p-5">
                  <div className="flex justify-between mb-4">
                    <div className="flex gap-3">
                      <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center">
                        <span className="text-sm font-bold text-primary-foreground">
                          {initials}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold">{officer.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {officer.branch}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(officer)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteOfficer.mutate(officer.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {officer.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
                      <Phone className="w-3 h-3" />
                      {officer.phone}
                    </p>
                  )}

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-muted/50 rounded-lg p-2 text-center cursor-pointer hover:bg-muted transition-colors" onClick={() => setExpandedOfficer(expandedOfficer === officer.id ? null : officer.id)}>
                      <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                        Disbursed 
                        <ChevronDown className={`w-3 h-3 transition-transform ${expandedOfficer === officer.id ? 'rotate-180' : ''}`} />
                      </p>
                      <p className="text-xs font-semibold">
                        {formatNaira(officer.totalDisbursed)}
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Outstanding</p>
                      <p className="text-xs font-semibold">
                        {formatNaira(officer.totalOutstanding)}
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Loans</p>
                      <p className="text-xs font-semibold flex justify-center items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        {officer.loanCount}
                      </p>
                    </div>
                  </div>

                  {expandedOfficer === officer.id && (
                    <div className="mt-2 p-2 bg-muted/50 rounded-lg border">
                      <p className="text-xs font-medium mb-2">Loans for {officer.name}:</p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {allLoans.filter((l: any) => l.officer_id === officer.id).map((loan: any) => (
                          <div key={loan.id} className="p-2 bg-white rounded border text-xs">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-medium">Disbursed: {formatNaira(loan.disbursed_amount)}</span>
                              <span className={`text-[10px] px-1 py-0.5 rounded ${
                                loan.status === 'active' ? 'bg-blue-100 text-blue-800' :
                                loan.status === 'repaid' ? 'bg-green-100 text-green-800' :
                                loan.status === 'overdue' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>{loan.status}</span>
                            </div>
                            <div className="text-muted-foreground space-y-0.5">
                              <p><Calendar className="w-2.5 h-2.5 inline mr-1" />{loan.start_date} to {loan.due_date}</p>
                              <p>Interest ({loan.interest}%): {formatNaira(loan.interest_amount)}</p>
                              <p>Total Repay: {formatNaira(loan.amount)}</p>
                              <p>Balance: {formatNaira(loan.outstanding_balance)}</p>
                            </div>
                          </div>
                        ))}
                        {allLoans.filter((l: any) => l.officer_id === officer.id).length === 0 && (
                          <p className="text-xs text-muted-foreground">No loans assigned</p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${risk.color}`}>
                    <risk.icon className="w-3 h-3" />
                    {risk.label} (Score: {officer.riskScore})
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default LoanOfficers