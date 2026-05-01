// src/pages/Expenses.tsx
import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNaira } from '@/lib/format'
import { Plus, Edit, Trash2, Calendar, PieChart, Receipt } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Cell, Pie } from 'recharts'

type Expense = {
  id?: string
  description: string
  amount: number
  category: string
  date: string
}

const expenseCategories = [
  'Office Supplies',
  'Travel',
  'Marketing',
  'Utilities',
  'Rent',
  'Equipment',
  'Software',
  'Training',
  'Insurance',
  'Miscellaneous'
]

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF7C7C', '#8DD1E1', '#D084D0']

const Expenses = () => {
  const queryClient = useQueryClient()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    category: '',
    date: new Date().toISOString().split('T')[0]
  })

  // Fetch expenses
  const { data: expenses = [], isLoading, error } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false })
      
      if (error) {
        // If table doesn't exist, return empty array
        if (error.message?.includes('relation "public.expenses" does not exist')) {
          return []
        }
        throw error
      }
      return data || []
    },
  })

  const expensesTableMissing = error?.message?.includes('relation "public.expenses" does not exist') || false

  // Fetch expense analytics
  const { data: expenseAnalytics } = useQuery({
    queryKey: ['expense-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('amount, category, date')

      if (error) {
        // If table doesn't exist, return empty analytics
        if (error.message?.includes('relation "public.expenses" does not exist')) {
          return { daily: [], weekly: [], monthly: [], yearly: [], categoryBreakdown: [] }
        }
        throw error
      }

      if (!data) return { daily: [], weekly: [], monthly: [], yearly: [], categoryBreakdown: [] }

      // Daily expenses for last 30 days
      const dailyData: Record<string, number> = {}
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      data.forEach(expense => {
        const date = expense.date
        if (new Date(date) >= thirtyDaysAgo) {
          dailyData[date] = (dailyData[date] || 0) + Number(expense.amount)
        }
      })

      const daily = Object.entries(dailyData)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date))

      // Weekly expenses for last 12 weeks
      const weeklyData: Record<string, number> = {}
      data.forEach(expense => {
        const date = new Date(expense.date)
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay())
        const weekKey = weekStart.toISOString().split('T')[0]
        weeklyData[weekKey] = (weeklyData[weekKey] || 0) + Number(expense.amount)
      })

      const weekly = Object.entries(weeklyData)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-12)

      // Monthly expenses for last 12 months
      const monthlyData: Record<string, number> = {}
      data.forEach(expense => {
        const date = new Date(expense.date)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        monthlyData[monthKey] = (monthlyData[monthKey] || 0) + Number(expense.amount)
      })

      const monthly = Object.entries(monthlyData)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-12)

      // Yearly expenses
      const yearlyData: Record<string, number> = {}
      data.forEach(expense => {
        const year = new Date(expense.date).getFullYear().toString()
        yearlyData[year] = (yearlyData[year] || 0) + Number(expense.amount)
      })

      const yearly = Object.entries(yearlyData)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date))

      // Category breakdown
      const categoryData: Record<string, number> = {}
      data.forEach(expense => {
        categoryData[expense.category] = (categoryData[expense.category] || 0) + Number(expense.amount)
      })

      const categoryBreakdown = Object.entries(categoryData)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount)

      return { daily, weekly, monthly, yearly, categoryBreakdown }
    },
  })

  // Create expense mutation
  const createExpense = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
       .insert([{
  title: formData.category, // ✅ ADDED THIS LINE (fix)
  description: formData.description,
  amount: Number(formData.amount),
  category: formData.category,
  date: formData.date
}])
        .select()
        .single()

      if (error) {
        if (error.message?.includes('relation "public.expenses" does not exist')) {
          throw new Error('Expenses table not yet available. Please contact administrator to run database migrations.')
        }
        throw error
      }
      return data
    },
    onSuccess: () => {
      toast.success('Expense created successfully')
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['expense-analytics'] })
      resetForm()
      setIsCreateOpen(false)
    },
    onError: (e: any) => {
      toast.error(e.message)
    },
  })

  // Update expense mutation
  const updateExpense = useMutation({
    mutationFn: async () => {
      if (!editingExpense?.id) return

      const { data, error } = await supabase
        .from('expenses')
        .update({
          description: formData.description,
          amount: Number(formData.amount),
          category: formData.category,
          date: formData.date
        })
        .eq('id', editingExpense.id)
        .select()
        .single()

      if (error) {
        if (error.message?.includes('relation "public.expenses" does not exist')) {
          throw new Error('Expenses table not yet available. Please contact administrator to run database migrations.')
        }
        throw error
      }
      return data
    },
    onSuccess: () => {
      toast.success('Expense updated successfully')
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['expense-analytics'] })
      resetForm()
      setEditingExpense(null)
    },
    onError: (e: any) => {
      toast.error(e.message)
    },
  })

  // Delete expense mutation
  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)

      if (error) {
        if (error.message?.includes('relation "public.expenses" does not exist')) {
          throw new Error('Expenses table not yet available. Please contact administrator to run database migrations.')
        }
        throw error
      }
    },
    onSuccess: () => {
      toast.success('Expense deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['expense-analytics'] })
    },
    onError: (e: any) => {
      toast.error(e.message)
    },
  })

  const resetForm = () => {
    setFormData({
      description: '',
      amount: '',
      category: '',
      date: new Date().toISOString().split('T')[0]
    })
  }

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense)
    setFormData({
      description: expense.description,
      amount: expense.amount.toString(),
      category: expense.category,
      date: expense.date
    })
  }

  const handleSubmit = () => {
    if (!formData.description.trim()) {
      toast.error('Description is required')
      return
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
      toast.error('Amount must be greater than 0')
      return
    }
    if (!formData.category) {
      toast.error('Category is required')
      return
    }
    if (!formData.date) {
      toast.error('Date is required')
      return
    }

    if (editingExpense) {
      updateExpense.mutate()
    } else {
      createExpense.mutate()
    }
  }

  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Expenses</h1>
          {expensesTableMissing && (
            <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              The expenses table is missing in the current database schema. Run the migration or create <code>public.expenses</code> before adding expenses.
            </div>
          )}
        </div>
        <Dialog open={isCreateOpen || !!editingExpense} onOpenChange={(open) => {
          setIsCreateOpen(open)
          if (!open) {
            setEditingExpense(null)
            resetForm()
          }
        }}>
          <DialogTrigger asChild>
            <Button 
              type="button"
              disabled={expensesTableMissing}
              onClick={() => {
                setIsCreateOpen(true)
                setEditingExpense(null)
                resetForm()
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Expense
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingExpense ? 'Edit Expense' : 'Add New Expense'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter expense description"
                />
              </div>
              <div>
                <Label htmlFor="amount">Amount (₦)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseCategories.map(category => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button onClick={handleSubmit} disabled={createExpense.isPending || updateExpense.isPending}>
                  {editingExpense ? 'Update' : 'Create'} Expense
                </Button>
                <Button variant="outline" onClick={() => {
                  setIsCreateOpen(false)
                  setEditingExpense(null)
                  resetForm()
                }}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {error && error.message?.includes('relation "public.expenses" does not exist') 
                ? 'N/A' 
                : formatNaira(totalExpenses)
              }
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {error && error.message?.includes('relation "public.expenses" does not exist') 
                ? 'N/A' 
                : formatNaira(expenseAnalytics?.monthly?.[expenseAnalytics.monthly.length - 1]?.amount || 0)
              }
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {error && error.message?.includes('relation "public.expenses" does not exist') 
                ? 'N/A' 
                : formatNaira(expenseAnalytics?.weekly?.[expenseAnalytics.weekly.length - 1]?.amount || 0)
              }
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {error && error.message?.includes('relation "public.expenses" does not exist') 
                ? 'N/A' 
                : formatNaira(expenseAnalytics?.daily?.[expenseAnalytics.daily.length - 1]?.amount || 0)
              }
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Expenses Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Daily Expenses (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error && error.message?.includes('relation "public.expenses" does not exist') ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Expenses table not yet available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={expenseAnalytics?.daily || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatNaira(value)} />
                  <Line type="monotone" dataKey="amount" stroke="#ef4444" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <PieChart className="w-4 h-4" />
              Expenses by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error && error.message?.includes('relation "public.expenses" does not exist') ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Expenses table not yet available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <RechartsPieChart>
                  <Pie
                    data={expenseAnalytics?.categoryBreakdown || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="amount"
                  >
                    {expenseAnalytics?.categoryBreakdown?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatNaira(value)} />
                </RechartsPieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Weekly Expenses Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Weekly Expenses (Last 12 Weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            {error && error.message?.includes('relation "public.expenses" does not exist') ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Expenses table not yet available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={expenseAnalytics?.weekly || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatNaira(value)} />
                  <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Monthly Expenses Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Monthly Expenses (Last 12 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            {error && error.message?.includes('relation "public.expenses" does not exist') ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Expenses table not yet available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={expenseAnalytics?.monthly || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatNaira(value)} />
                  <Line type="monotone" dataKey="amount" stroke="#22c55e" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle>Expense Records</CardTitle>
        </CardHeader>
        <CardContent>
          {error && error.message?.includes('relation "public.expenses" does not exist') ? (
            <div className="text-center py-8">
              <div className="text-muted-foreground mb-4">
                <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">Expenses Feature Not Yet Available</h3>
                <p className="text-sm">
                  The expenses table has not been created in the database yet.
                  Please contact your administrator to run the database migrations.
                </p>
              </div>
            </div>
          ) : isLoading ? (
            <div className="text-center py-4">Loading expenses...</div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">No expenses recorded yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-left p-2">Category</th>
                    <th className="text-right p-2">Amount</th>
                    <th className="text-right p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense.id} className="border-b hover:bg-muted/50">
                      <td className="p-2">{new Date(expense.date).toLocaleDateString()}</td>
                      <td className="p-2">{expense.description}</td>
                      <td className="p-2">{expense.category}</td>
                      <td className="p-2 text-right">{formatNaira(expense.amount)}</td>
                      <td className="p-2 text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(expense)}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this expense?')) {
                                deleteExpense.mutate(expense.id!)
                              }
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
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
  )
}

export default Expenses