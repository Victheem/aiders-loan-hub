// src/pages/Loans.tsx
import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { Pencil, Calendar } from 'lucide-react'
import { formatNaira } from '@/lib/format'

type Loan = {
  id?: string
  officer_id: string
  amount: number // total to repay
  interest: number // interest percent
  interest_amount: number // interest in currency
  disbursed_amount: number // actual money given
  duration: number // repayment days
  status: string
  start_date: string
  due_date: string
  outstanding_balance: number
  daily_repayment_amount: number
}

const Loans = () => {
  const queryClient = useQueryClient()

  const [officerId, setOfficerId] = useState('')
  const [amount, setAmount] = useState<number | ''>('') // requested loan amount
  const [interest, setInterest] = useState(10) // 10%
  const [duration, setDuration] = useState(20) // repayment duration
  const [loading, setLoading] = useState(false)

  // Edit state
  const [editOpen, setEditOpen] = useState(false)
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null)
  const [editForm, setEditForm] = useState({
    disbursed_amount: 0,
    interest: 10,
    duration: 20,
    start_date: '',
    due_date: '',
  })

  // Fetch existing loans
  const { data: loans = [], isLoading } = useQuery({
    queryKey: ['loans'],
    queryFn: async () => {
      const { data } = await supabase
        .from('loans')
        .select('*')
        .order('created_at', { ascending: false })
      return data || []
    },
  })

  // Fetch loan officers
  const { data: officers = [] } = useQuery({
    queryKey: ['loan-officers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('loan_officers')
        .select('id,name')
      return data || []
    },
  })

  // Create loan mutation
  const createLoan = useMutation({
    mutationFn: async () => {
      const requestedAmount = Number(amount)
      const interestRate = Number(interest) / 100

      const interestAmount = requestedAmount * interestRate
      const disbursedAmount = requestedAmount
      const totalRepayment = requestedAmount + interestAmount
      const dailyRepayment = totalRepayment / duration

      const newLoan: Loan = {
        officer_id: officerId,
        amount: totalRepayment,
        interest: interest,
        interest_amount: interestAmount,
        disbursed_amount: disbursedAmount,
        duration,
        status: 'active',
        start_date: new Date().toISOString().split('T')[0],
        due_date: new Date(Date.now() + duration * 86400000)
          .toISOString()
          .split('T')[0],
        outstanding_balance: totalRepayment,
        daily_repayment_amount: dailyRepayment,
      }

      setLoading(true)

      const { data, error } = await supabase
        .from('loans')
        .insert([newLoan])
        .select()
        .single()

      if (error) throw error

      await supabase.from('transactions').insert([
        {
          loan_id: data.id,
          type: 'disbursement',
          amount: disbursedAmount,
          date: newLoan.start_date,
        },
      ])

      await supabase.from('transactions').insert([
        {
          loan_id: data.id,
          type: 'interest',
          amount: interestAmount,
          date: newLoan.start_date,
        },
      ])

      queryClient.invalidateQueries({ queryKey: ['loans'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })

      return data
    },

    onSuccess: () => {
      toast.success('Loan created successfully')
      resetForm()
      setLoading(false)
    },

    onError: (e: any) => {
      toast.error(e.message)
      setLoading(false)
    },
  })

  // Update loan mutation
  const updateLoan = useMutation({
    mutationFn: async () => {
      if (!editingLoan) throw new Error('No loan selected')

      const disbursedAmount = Number(editForm.disbursed_amount)
      const interestRate = Number(editForm.interest) / 100
      const interestAmount = disbursedAmount * interestRate
      const totalRepayment = disbursedAmount + interestAmount
      const dailyRepayment = totalRepayment / Number(editForm.duration)

      const { error } = await supabase
        .from('loans')
        .update({
          disbursed_amount: disbursedAmount,
          amount: totalRepayment,
          interest: editForm.interest,
          interest_amount: interestAmount,
          duration: editForm.duration,
          start_date: editForm.start_date,
          due_date: editForm.due_date,
          outstanding_balance: totalRepayment,
          daily_repayment_amount: dailyRepayment,
        })
        .eq('id', editingLoan.id)

      if (error) throw error
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] })
      toast.success('Loan updated successfully')
      setEditOpen(false)
      setEditingLoan(null)
    },

    onError: (e: any) => {
      toast.error(e.message)
    },
  })

  const resetForm = () => {
    setOfficerId('')
    setAmount('')
    setInterest(10)
    setDuration(20)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!officerId || amount === '') {
      toast.error('Fill all fields')
      return
    }
    createLoan.mutate()
  }

  const handleEditClick = (loan: Loan) => {
    setEditingLoan(loan)
    setEditForm({
      disbursed_amount: loan.disbursed_amount,
      interest: loan.interest,
      duration: loan.duration,
      start_date: loan.start_date,
      due_date: loan.due_date,
    })
    setEditOpen(true)
  }

  const getOfficerName = (officerId: string) => {
    const officer = officers.find((o: any) => o.id === officerId)
    return officer?.name || 'Unknown'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-blue-100 text-blue-800'
      case 'repaid': return 'bg-green-100 text-green-800'
      case 'overdue': return 'bg-red-100 text-red-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-bold">Create Loan</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <select
            className="w-full p-2 border rounded"
            value={officerId}
            onChange={(e) => setOfficerId(e.target.value)}
          >
            <option value="">Select Officer</option>
            {officers.map((o: any) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>

          <input
            type="number"
            placeholder="Loan Amount (e.g. 500000)"
            className="w-full p-2 border rounded"
            value={amount}
            onChange={(e) =>
              setAmount(e.target.value === '' ? '' : Number(e.target.value))
            }
          />

          <input
            type="number"
            className="w-full p-2 border rounded"
            value={interest}
            onChange={(e) => setInterest(Number(e.target.value))}
          />

          <input
            type="number"
            className="w-full p-2 border rounded"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />

          <Button className="w-full" disabled={loading}>
            {loading ? 'Creating...' : 'Create Loan'}
          </Button>
        </form>
      </div>

      <div>
        <h2 className="text-xl font-bold">Loans</h2>
        {isLoading ? (
          <p>Loading...</p>
        ) : (
          loans.map((loan: any) => (
            <div key={loan.id} className="p-3 border rounded mt-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-muted-foreground">Officer: {getOfficerName(loan.officer_id)}</p>
                  <p><span className="text-yellow-600 font-medium">Disbursed:</span> ₦{loan.disbursed_amount?.toLocaleString()}</p>
                  <p><span className="text-blue-600 font-medium">Interest ({loan.interest}%):</span> ₦{loan.interest_amount?.toLocaleString()}</p>
                  <p><span className="text-red-600 font-medium">Total to Repay:</span> ₦{loan.amount?.toLocaleString()}</p>
                  <p><span className="text-green-600 font-medium">Balance:</span> ₦{loan.outstanding_balance?.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {loan.start_date} to {loan.due_date} ({loan.duration} days)
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${getStatusColor(loan.status)}`}>
                    {loan.status}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => handleEditClick(loan)}>
                    <Pencil className="w-3 h-3 mr-1" /> Edit
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Loan Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Loan</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              updateLoan.mutate()
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Disbursed Amount (₦)</Label>
              <Input
                type="number"
                value={editForm.disbursed_amount}
                onChange={(e) =>
                  setEditForm({ ...editForm, disbursed_amount: Number(e.target.value) })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Interest Rate (%)</Label>
              <Input
                type="number"
                value={editForm.interest}
                onChange={(e) =>
                  setEditForm({ ...editForm, interest: Number(e.target.value) })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Duration (days)</Label>
              <Input
                type="number"
                value={editForm.duration}
                onChange={(e) =>
                  setEditForm({ ...editForm, duration: Number(e.target.value) })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={editForm.start_date}
                onChange={(e) =>
                  setEditForm({ ...editForm, start_date: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={editForm.due_date}
                onChange={(e) =>
                  setEditForm({ ...editForm, due_date: e.target.value })
                }
                required
              />
            </div>

            {editingLoan && (
              <div className="p-3 bg-muted rounded text-xs">
                <p><span className="text-yellow-600">New Total to Repay:</span> ₦{(editForm.disbursed_amount + (editForm.disbursed_amount * editForm.interest / 100)).toLocaleString()}</p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={updateLoan.isPending}>
              {updateLoan.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Loans