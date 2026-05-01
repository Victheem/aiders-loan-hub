// src/pages/Repayments.tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DollarSign, RefreshCw, CheckCircle } from 'lucide-react'
import { formatNaira } from '@/lib/format'

type Loan = {
  id: string
  officer_id: string
  amount: number // total expected repayment (principal + interest)
  disbursed_amount: number
  outstanding_balance: number
  status: string
  loan_officers?: { name: string; branch: string }
  total_repaid?: number
}

const statusColors: Record<string, string> = {
  repaid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  active: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
}

const Repayments = () => {
  const queryClient = useQueryClient()
  const [selectedLoanId, setSelectedLoanId] = useState('')
  const [selectedOfficerId, setSelectedOfficerId] = useState('')
  const [repaymentAmount, setRepaymentAmount] = useState<number | ''>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedLoanDetails, setSelectedLoanDetails] = useState<Loan | null>(null)
  const [liveRepaid, setLiveRepaid] = useState(0)
  const [liveBalance, setLiveBalance] = useState(0)

  // Fetch loan officers for dropdown
  const { data: loanOfficers = [], isLoading: officersLoading } = useQuery({
    queryKey: ['loan-officers-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loan_officers')
        .select('id, name, branch')
        .order('name')
      if (error) throw error
      return data || []
    },
  })

  // Fetch all loans for selected officer
  const { data: loans = [], isLoading: loansLoading } = useQuery({
    queryKey: ['all-loans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loans')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching loans:', error)
        throw error
      }

      // Get all loan officers for mapping
      const { data: officers } = await supabase
        .from('loan_officers')
        .select('id, name, branch')

      // Map officer data to loans
      const loansWithOfficers = (data || []).map((loan: any) => {
        const officer = officers?.find((o: any) => o.id === loan.officer_id)
        return {
          ...loan,
          loan_officers: officer || null
        }
      })

      // Calculate total repaid per loan
      const loansWithRepaid = await Promise.all(
        loansWithOfficers.map(async (loan: any) => {
          const { data: repayments } = await supabase
            .from('transactions')
            .select('amount')
            .eq('loan_id', loan.id)
            .eq('type', 'repayment')

          const totalRepaid = repayments?.reduce((sum, r) => sum + Number(r.amount), 0) || 0
          return { ...loan, total_repaid: totalRepaid }
        })
      )

      return loansWithRepaid as Loan[]
    },
  })

  useEffect(() => {
    const loan = loans.find(l => l.id === selectedLoanId) || null
    setSelectedLoanDetails(loan)
    if (loan) {
      setLiveRepaid(loan.total_repaid || 0)
      setLiveBalance(loan.outstanding_balance)
      setRepaymentAmount('')
    } else {
      setLiveRepaid(0)
      setLiveBalance(0)
      setRepaymentAmount('')
    }
  }, [selectedLoanId, loans])

  // Clear selected officer on mount
  useEffect(() => {
    setSelectedOfficerId('')
    setSelectedLoanId('')
  }, [])

  // Live update when typing repayment amount
  useEffect(() => {
    if (!selectedLoanDetails) return
    const amountTyped = Number(repaymentAmount) || 0
    const newRepaid = (selectedLoanDetails.total_repaid || 0) + amountTyped
    const newBalance = Math.max(0, selectedLoanDetails.amount - newRepaid)
    setLiveRepaid(newRepaid)
    setLiveBalance(newBalance)
  }, [repaymentAmount, selectedLoanDetails])

  // Repayment mutation
  const recordRepayment = useMutation({
    mutationFn: async ({ loanId, amount }: { loanId: string; amount: number }) => {
      if (!loanId || !amount) throw new Error('Invalid input')

      // Fetch current loan
      const { data: loan } = await supabase
        .from('loans')
        .select('outstanding_balance')
        .eq('id', loanId)
        .single()

      if (!loan) throw new Error('Loan not found')

      const newBalance = Math.max(0, Number(loan.outstanding_balance) - amount)
      const isFullyPaid = newBalance === 0

      // Update loan balance
      await supabase
        .from('loans')
        .update({ outstanding_balance: newBalance, status: isFullyPaid ? 'repaid' : 'active' })
        .eq('id', loanId)

      // Record repayment transaction
      await supabase.from('transactions').insert([{
        loan_id: loanId,
        type: 'repayment',
        amount,
        date: new Date().toISOString().split('T')[0],
      }])

      return { loanId, amount }
    },

    onSuccess: (data) => {
      toast.success(`Repayment of ${formatNaira(data.amount)} recorded successfully`)
      queryClient.invalidateQueries({ queryKey: ['all-loans'] })
      queryClient.invalidateQueries({ queryKey: ['loans'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      setSelectedOfficerId('')
      setSelectedLoanId('')
      setRepaymentAmount('')
      setSelectedLoanDetails(null)
      setLiveRepaid(0)
      setLiveBalance(0)
      setIsSubmitting(false)
    },

    onError: (error: any) => {
      toast.error(error.message || 'Failed to record repayment')
      setIsSubmitting(false)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOfficerId || !selectedLoanId || !repaymentAmount || Number(repaymentAmount) <= 0) {
      toast.error('Please select a loan officer and loan, and enter a valid amount')
      return
    }
    setIsSubmitting(true)
    recordRepayment.mutate({ loanId: selectedLoanId, amount: Number(repaymentAmount) })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Record Repayment</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Repayment Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" /> New Repayment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="officer">Select Loan Officer</Label>
                <Select
                  value={selectedOfficerId}
                  onValueChange={(val) => {
                    setSelectedOfficerId(val)
                    setSelectedLoanId('')
                    setSelectedLoanDetails(null)
                  }}
                  disabled={officersLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a loan officer" />
                  </SelectTrigger>
                  <SelectContent>
                    {loanOfficers.map((officer: any) => (
                      <SelectItem key={officer.id} value={officer.id}>
                        {officer.name} - {officer.branch}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedOfficerId && (
                <div className="space-y-2">
                  <Label htmlFor="loan">Select Loan</Label>
                  {loans.filter(l => l.officer_id === selectedOfficerId).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No loans found for this officer</p>
                  ) : (
                    <Select
                      value={selectedLoanId}
                      onValueChange={setSelectedLoanId}
                      disabled={loansLoading}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a loan" />
                      </SelectTrigger>
                      <SelectContent>
                        {loans.filter(l => l.officer_id === selectedOfficerId).map(loan => (
                          <SelectItem key={loan.id} value={loan.id}>
                            Disbursed: {formatNaira(loan.amount)} | Interest: {formatNaira(loan.interest_amount)} | Total: {formatNaira((loan.amount || 0) + (loan.interest_amount || 0))} | Balance: {formatNaira(loan.outstanding_balance)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {selectedLoanDetails && (
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Loan Amount:</span>
                    <span className="text-sm font-medium">{formatNaira(selectedLoanDetails.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Disbursed Amount:</span>
                    <span className="text-sm font-medium">{formatNaira(selectedLoanDetails.disbursed_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Repaid:</span>
                    <span className="text-sm font-medium">{formatNaira(liveRepaid)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-sm font-medium">Remaining After Payment:</span>
                    <span className="text-sm font-bold text-primary">{formatNaira(liveBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <Badge className={statusColors[selectedLoanDetails.status] || ''}>
                      {selectedLoanDetails.status}
                    </Badge>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="amount">Repayment Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Enter amount"
                  value={repaymentAmount}
                  onChange={(e) => setRepaymentAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  min={1}
                  max={selectedLoanDetails?.outstanding_balance || undefined}
                />
                {selectedLoanDetails && (
                  <p className="text-xs text-muted-foreground">
                    Maximum: {formatNaira(selectedLoanDetails.outstanding_balance)}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || !selectedOfficerId || !selectedLoanId || (repaymentAmount === '' || repaymentAmount <= 0)}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" /> Record Repayment
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Loans List */}
        <Card>
          <CardHeader>
            <CardTitle>All Loans ({loans.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loansLoading ? (
              <div className="text-center py-4 text-muted-foreground">Loading loans...</div>
            ) : loans.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">No loans found</div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {loans.map(loan => (
                  <div
                    key={loan.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedLoanId === loan.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedLoanId(loan.id)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium">{loan.loan_officers?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{loan.loan_officers?.branch}</p>
                      </div>
                      <Badge className={statusColors[loan.status] || ''}>{loan.status}</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Balance:</span>
                      <span className="font-medium">{formatNaira(loan.outstanding_balance)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Repayments