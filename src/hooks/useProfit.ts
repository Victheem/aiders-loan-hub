import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export const useProfit = () => {
  return useQuery({
    queryKey: ['profit-dashboard'],
    queryFn: async () => {
      // 1. TOTAL INCOME (from repayments / transactions)
      const { data: incomeData } = await supabase
        .from('transactions')
        .select('amount, type')

      const totalIncome =
        incomeData
          ?.filter(t => t.type === 'repayment')
          .reduce((sum, t) => sum + Number(t.amount), 0) || 0

      // 2. TOTAL EXPENSES
      const { data: expenseData } = await supabase
        .from('expenses')
        .select('amount')

      const totalExpenses =
        expenseData?.reduce((sum, e) => sum + Number(e.amount), 0) || 0

      // 3. PROFIT CALCULATION
      const profit = totalIncome - totalExpenses

      return {
        totalIncome,
        totalExpenses,
        profit
      }
    }
  })
}