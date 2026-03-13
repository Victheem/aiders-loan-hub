import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import KPICard from '@/components/KPICard';
import { formatNaira, getStatusColor } from '@/lib/format';
import { Wallet, ArrowUpRight, TrendingUp, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const Dashboard = () => {
  const { data: kpis } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: async () => {
      const [loansRes, txRes, officersRes] = await Promise.all([
        supabase.from('loans').select('amount, outstanding_balance, status, total_with_interest'),
        supabase.from('transactions').select('amount, type'),
        supabase.from('loan_officers').select('id'),
      ]);
      const loans = loansRes.data || [];
      const txs = txRes.data || [];

      const totalOutstanding = loans.reduce((s, l) => s + Number(l.outstanding_balance), 0);
      const totalDisbursed = txs.filter(t => t.type === 'disbursement').reduce((s, t) => s + Number(t.amount), 0);
      const totalRepaid = txs.filter(t => t.type === 'repayment').reduce((s, t) => s + Number(t.amount), 0);
      const activeLoans = loans.filter(l => l.status === 'approved' || l.status === 'overdue').length;
      const overdueLoans = loans.filter(l => l.status === 'overdue').length;
      const officerCount = officersRes.data?.length || 0;

      return { totalOutstanding, totalDisbursed, totalRepaid, activeLoans, overdueLoans, officerCount };
    },
  });

  const { data: officerSummary = [] } = useQuery({
    queryKey: ['dashboard-officers'],
    queryFn: async () => {
      const { data: officers } = await supabase.from('loan_officers').select('id, name');
      if (!officers) return [];
      return Promise.all(
        officers.map(async (o) => {
          const { data: loans } = await supabase.from('loans').select('amount, outstanding_balance').eq('officer_id', o.id);
          const totalDisbursed = (loans || []).reduce((s, l) => s + Number(l.amount), 0);
          const outstanding = (loans || []).reduce((s, l) => s + Number(l.outstanding_balance), 0);
          return { ...o, totalDisbursed, outstanding, repaid: Math.max(0, totalDisbursed - outstanding) };
        })
      );
    },
  });

  const { data: recentLoans = [] } = useQuery({
    queryKey: ['dashboard-recent-loans'],
    queryFn: async () => {
      const { data } = await supabase.from('loans').select('id, amount, duration, status, daily_repayment_amount, loan_officers(name)').order('created_at', { ascending: false }).limit(5);
      return data || [];
    },
  });

  const { data: repaymentTrend = [] } = useQuery({
    queryKey: ['dashboard-repayment-trend'],
    queryFn: async () => {
      const { data } = await supabase.from('transactions').select('amount, type, date').eq('type', 'repayment').order('date', { ascending: true });
      if (!data) return [];
      const byDate: Record<string, number> = {};
      data.forEach(t => {
        byDate[t.date] = (byDate[t.date] || 0) + Number(t.amount);
      });
      return Object.entries(byDate).slice(-14).map(([date, amount]) => ({ date, amount }));
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Disbursed" value={formatNaira(kpis?.totalDisbursed || 0)} icon={ArrowUpRight} variant="primary" />
        <KPICard title="Total Repaid" value={formatNaira(kpis?.totalRepaid || 0)} icon={TrendingUp} variant="success" />
        <KPICard title="Outstanding Balance" value={formatNaira(kpis?.totalOutstanding || 0)} icon={Wallet} variant="warning" />
        <KPICard title="Active Loans" value={`${kpis?.activeLoans || 0} (${kpis?.overdueLoans || 0} overdue)`} icon={AlertTriangle} variant="default" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Officer Disbursement & Repayment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 font-medium text-muted-foreground">Officer</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Disbursed</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Repaid</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {officerSummary.map((o: any) => (
                    <tr key={o.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 font-medium text-foreground">{o.name}</td>
                      <td className="py-3 text-right text-foreground">{formatNaira(o.totalDisbursed)}</td>
                      <td className="py-3 text-right text-success">{formatNaira(o.repaid)}</td>
                      <td className="py-3 text-right text-warning">{formatNaira(o.outstanding)}</td>
                    </tr>
                  ))}
                  {officerSummary.length === 0 && (
                    <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Repayment Trend (Last 14 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {repaymentTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={repaymentTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(value: number) => formatNaira(value)} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                  <Line type="monotone" dataKey="amount" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">No repayment data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Recent Loans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentLoans.map((loan: any) => (
              <div key={loan.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{loan.loan_officers?.name}</p>
                  <p className="text-xs text-muted-foreground">{formatNaira(loan.amount)} · {loan.duration} days · Daily: {formatNaira(Number(loan.daily_repayment_amount) || 0)}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${getStatusColor(loan.status)}`}>
                  {loan.status}
                </span>
              </div>
            ))}
            {recentLoans.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No loans yet</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
