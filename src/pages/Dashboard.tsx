// src/pages/Dashboard.tsx
import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import KPICard from '@/components/KPICard'
import { formatNaira } from '@/lib/format'
import { Wallet, ArrowUpRight, TrendingUp, AlertTriangle, Download } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { exportLoanReportPDF } from '@/lib/pdfExport'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { useProfit } from '@/hooks/useProfit'

const statusColors: Record<string, string> = {
  repaid: 'bg-green-100 text-green-800 border-green-200',
  overdue: 'bg-red-100 text-red-800 border-red-200',
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  approved: 'bg-blue-100 text-blue-800 border-blue-200',
  active: 'bg-blue-100 text-blue-800 border-blue-200',
}

const Dashboard = () => {
  const { data: profitData } = useProfit()
  const { data: kpis } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: async () => {
      // First check and mark overdue schedules
      try {
        await (supabase as any).rpc('mark_schedules_overdue');
      } catch (e) {
        // Ignore errors - overdue check is non-critical
        console.log('Overdue check skipped');
      }
      
      const [loansRes, txRes, scheduleRes] = await Promise.all([
        supabase.from('loans').select('id, amount, disbursed_amount, outstanding_balance, status, interest, interest_amount'),
        supabase.from('transactions').select('amount,type,date'),
        supabase.from('repayment_schedules').select('status,due_date,expected_amount'),
      ])
      const loans = loansRes.data || []
      const txs = txRes.data || []
      const schedules = scheduleRes.data || []

      const totalOutstanding = loans.reduce((s, l) => s + Number(l.outstanding_balance || 0), 0)
      const totalDisbursed = loans.reduce((s, l) => s + Number(l.disbursed_amount || 0), 0)
      const totalInterest = loans.reduce((s, l) => s + Number(l.interest_amount || 0), 0)
      const totalRepaid = txs.filter(t => t.type === 'repayment').reduce((s, t) => s + Number(t.amount), 0)
      
      // Get overdue data from schedules
      const overdueSchedules = schedules.filter(s => s.status === 'overdue')
      const overdueAmount = overdueSchedules.reduce((sum, schedule) => sum + Number(schedule.expected_amount), 0)
      const overdueLoans = loans.filter(l => l.status === 'overdue')
      
      const portfolioRisk = totalDisbursed > 0 ? ((overdueAmount / totalDisbursed) * 100).toFixed(1) : 0
      const healthScore = Math.max(0, 100 - Number(portfolioRisk))
      const activeLoans = loans.filter(l => l.status === 'approved' || l.status === 'overdue' || l.status === 'active' || l.status === 'pending').length

      return { 
        totalOutstanding, 
        totalDisbursed, 
        totalInterest, 
        totalRepaid, 
        portfolioRisk, 
        healthScore, 
        activeLoans,
        overdueAmount,
        overdueLoansCount: overdueLoans.length,
        pendingSchedules: schedules.filter(s => s.status === 'pending').length,
      }
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  })

  const { data: repaymentTrend = [] } = useQuery({
    queryKey: ['repayment-trend'],
    queryFn: async () => {
      const { data } = await supabase.from('transactions').select('amount,type,date').order('date', { ascending: true })
      if (!data) return []
      const byDate: Record<string, any> = {}
      data.forEach(t => {
        if (!byDate[t.date]) byDate[t.date] = { date: t.date, disbursement: 0, repayment: 0 }
        if (t.type === 'disbursement') byDate[t.date].disbursement += Number(t.amount)
        if (t.type === 'repayment') byDate[t.date].repayment += Number(t.amount)
      })
      return Object.values(byDate).slice(-14)
    },
  })

  // Get overdue data for alerts
  const { data: overdueData = [] } = useQuery({
    queryKey: ['overdue-alerts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('repayment_schedules')
        .select(`
          id,
          due_date,
          expected_amount,
          status,
          loan_id,
          loans(id, status, loan_officers(name, branch))
        `)
        .eq('status', 'overdue')
        .order('due_date', { ascending: false })
        .limit(5)
      return data || []
    },
  })

  const { data: loanStatusData = [] } = useQuery({
    queryKey: ['loan-status-distribution'],
    queryFn: async () => {
      const { data } = await supabase.from('loans').select('status')
      if (!data) return []
      const counts: Record<string, number> = {}
      data.forEach(l => {
        counts[l.status] = (counts[l.status] || 0) + 1
      })
      return Object.entries(counts).map(([status, count]) => ({ status, count }))
    },
  })

  // Get loan officer distribution data
  const { data: officerDistributionData = [] } = useQuery({
    queryKey: ['officer-distribution'],
    queryFn: async () => {
      const { data: loans } = await supabase
        .from('loans')
        .select(`
          officer_id,
          loan_officers(name)
        `)

      if (!loans) return []

      const officerData: Record<string, { name: string, loanCount: number }> = {}

      loans.forEach(loan => {
        const officerId = loan.officer_id
        const officerName = loan.loan_officers?.name || 'Unknown'

        if (!officerData[officerId]) {
          officerData[officerId] = {
            name: officerName,
            loanCount: 0
          }
        }

        officerData[officerId].loanCount += 1
      })

      return Object.values(officerData)
    },
  })

  // Get upcoming repayment dates for calendar
  const { data: upcomingRepayments = [] } = useQuery({
    queryKey: ['upcoming-repayments'],
    queryFn: async () => {
      // Get all pending and overdue repayments (not just future ones)
      const { data } = await supabase
        .from('repayment_schedules')
        .select(`
          id,
          due_date,
          expected_amount,
          status,
          loan_id,
          loans(id, status, loan_officers(name, branch))
        `)
        .in('status', ['pending', 'overdue'])
        .order('due_date', { ascending: true })
        .limit(50)
      return data || []
    },
  })

  const handleExportPDF = async () => {
    try {
      await exportLoanReportPDF()
    } catch (error: any) {
      console.error('Export failed:', error)
    }
  }

  const getStatusColor = (status: string) => {
    return statusColors[status] || 'bg-gray-100 text-gray-800 border-gray-200'
  }

  // State for selected date in calendar
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Get all repayments (both upcoming and overdue) for calendar
  const { data: allRepayments = [] } = useQuery({
    queryKey: ['all-repayments-for-calendar'],
    queryFn: async () => {
      const { data } = await supabase
        .from('repayment_schedules')
        .select(`
          id,
          due_date,
          expected_amount,
          status,
          loan_id,
          loans(id, status, loan_officers(name, branch))
        `)
        .in('status', ['pending', 'overdue'])
        .order('due_date', { ascending: true })
        .limit(100)
      return data || []
    },
  })

  // Group repayments by date for calendar highlighting
  const repaymentsByDate = React.useMemo(() => {
    const overdue: string[] = []
    const pending: string[] = []
    allRepayments.forEach((r: { due_date: string; status: string }) => {
      if (r.status === 'overdue') {
        overdue.push(r.due_date)
      } else if (r.status === 'pending') {
        pending.push(r.due_date)
      }
    })
    return { overdue, pending }
  }, [allRepayments])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <Button variant="outline" size="sm" onClick={handleExportPDF}>
          <Download className="w-4 h-4 mr-2" />
          Export PDF
        </Button>
      </div>

      {/* KPI Cards - 3 rows, 2 columns (3 up and 3 down) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <KPICard 
          title="Total Disbursed" 
          value={formatNaira(kpis?.totalDisbursed || 0)} 
          icon={ArrowUpRight} 
          variant="primary" 
        />
        <KPICard 
          title="Total Repaid" 
          value={formatNaira(kpis?.totalRepaid || 0)} 
          icon={TrendingUp} 
          variant="success" 
        />
        <KPICard 
          title="Outstanding" 
          value={formatNaira(kpis?.totalOutstanding || 0)} 
          icon={Wallet} 
          variant="warning" 
        />
        <KPICard 
          title="Interest Earned" 
          value={formatNaira(kpis?.totalInterest || 0)} 
          icon={TrendingUp} 
          variant="success" 
        />
        <KPICard 
          title="Portfolio Risk" 
          value={`${kpis?.portfolioRisk || 0}%`} 
          icon={AlertTriangle} 
          variant={Number(kpis?.portfolioRisk) > 20 ? 'danger' : 'success'} 
        />
        <KPICard 
          title="System Health" 
          value={`${Math.round(kpis?.healthScore || 0)}/100`} 
          icon={TrendingUp} 
          variant={Number(kpis?.healthScore) > 70 ? 'success' : 'danger'} 
        />
        <KPICard 
          title="Total Profit" 
          value={formatNaira(profitData?.profit || 0)} 
          icon={TrendingUp} 
          variant="success" 
        />
      </div>
      
      {/* Overdue Alerts */}
      {overdueData.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-red-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Overdue Repayments Alert
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {overdueData.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between p-1.5 bg-white rounded border border-red-100">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-red-500" />
                    <div>
                      <p className="text-xs font-medium text-foreground">{item.loans?.loan_officers?.name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">Due: {item.due_date}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-foreground">{formatNaira(item.expected_amount)}</p>
                    <Badge className={`text-xs ${getStatusColor(item.status)}`}>{item.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Disbursement vs Repayment Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={repaymentTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => formatNaira(value)} />
                <Line type="monotone" dataKey="disbursement" stroke="#ef4444" strokeWidth={2} name="Disbursement" />
                <Line type="monotone" dataKey="repayment" stroke="#22c55e" strokeWidth={2} name="Repayment" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Loan Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {loanStatusData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No loan data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={loanStatusData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="status" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" name="Loans">
                    {loanStatusData.map((entry: any, index: number) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.status === 'overdue' ? '#ef4444' : 
                              entry.status === 'repaid' ? '#22c55e' : 
                              entry.status === 'pending' ? '#eab308' : '#3b82f6'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Loan Officer Distribution Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Loan Officer Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {officerDistributionData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No loan officer data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={officerDistributionData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="loanCount"
                >
                  {officerDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={`hsl(${(index * 137.5) % 360}, 70%, 50%)`} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, name: string) => [
                  value,
                  name === 'loanCount' ? 'Number of Loans' : name
                ]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="p-2 rounded-lg bg-green-50 border border-green-200">
          <p className="text-xs text-green-700">Repaid Loans</p>
          <p className="text-lg font-bold text-green-800">
            {loanStatusData.find((l: any) => l.status === 'repaid')?.count || 0}
          </p>
        </div>
        <div className="p-2 rounded-lg bg-red-50 border border-red-200">
          <p className="text-xs text-red-700">Overdue Loans</p>
          <p className="text-lg font-bold text-red-800">
            {kpis?.overdueLoansCount || 0}
          </p>
        </div>
        <div className="p-2 rounded-lg bg-yellow-50 border border-yellow-200">
          <p className="text-xs text-yellow-700">Active</p>
          <p className="text-lg font-bold text-yellow-800">
            {kpis?.activeLoans || 0}
          </p>
        </div>
        <div className="p-2 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-xs text-blue-700">Pending Payments</p>
          <p className="text-lg font-bold text-blue-800">
            {kpis?.pendingSchedules || 0}
          </p>
        </div>
      </div>

      {/* Repayment Calendar - Single Calendar with Hover Details */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Repayment Calendar - Hover for details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate ? new Date(selectedDate) : undefined}
              onSelect={(date) => {
                if (date) {
                  const dateStr = date.toISOString().split('T')[0]
                  setSelectedDate(dateStr)
                }
              }}
              className="rounded-md border"
              numberOfMonths={1}
              modifiers={{
                repayment: allRepayments.map(d => new Date(d.due_date)),
              }}
              modifiersStyles={{
                repayment: { backgroundColor: '#ef4444', color: 'white', fontWeight: 'bold' },
              }}
              components={{
                Day: ({ date, ...props }) => {
                  const dateStr = date.toISOString().split('T')[0]
                  const dayRepayments = allRepayments.filter(r => r.due_date === dateStr)
                  const hasRepayment = dayRepayments.length > 0
                  const totalAmount = dayRepayments.reduce((s: number, r: any) => s + Number(r.expected_amount), 0)
                  
                  return (
                    <div className="relative group">
                      <button
                        {...props}
                        className={`h-8 w-8 p-0 font-normal text-sm rounded-md transition-colors ${
                          hasRepayment ? 'bg-red-500 text-white font-bold' : ''
                        } hover:bg-accent hover:text-accent-foreground`}
                      />
                      {hasRepayment && (
                        <div className="absolute z-50 hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-white border rounded-lg shadow-lg p-3">
                          <p className="font-semibold text-xs mb-2 border-b pb-1">{date.toLocaleDateString()}</p>
                          <div className="space-y-1 max-h-24 overflow-y-auto">
                            {dayRepayments.map((r: any) => (
                              <div key={r.id} className="flex justify-between text-xs py-0.5">
                                <span className="truncate">{r.loans?.loan_officers?.name || 'Unknown'}</span>
                                <span className="ml-2 text-red-600 font-medium">{formatNaira(r.expected_amount)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="border-t mt-2 pt-1 flex justify-between text-xs font-semibold">
                            <span>Total Expected:</span>
                            <span className="text-red-600">{formatNaira(totalAmount)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            {allRepayments.length} repayment{allRepayments.length !== 1 ? 's' : ''} scheduled • Hover over dates for details
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default Dashboard
