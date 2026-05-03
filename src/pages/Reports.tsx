import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { formatNaira } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Download, FileText } from 'lucide-react';

const Reports = () => {
  const { data: statusData = [] } = useQuery({
    queryKey: ['report-status'],
    queryFn: async () => {
      const { data } = await supabase.from('loans').select('status');
      if (!data) return [];
      const counts: Record<string, number> = {};
      data.forEach(l => { counts[l.status] = (counts[l.status] || 0) + 1; });
      const colors: Record<string, string> = {
        approved: 'hsl(var(--chart-1))', pending: 'hsl(var(--chart-4))',
        repaid: 'hsl(var(--chart-3))', overdue: 'hsl(var(--chart-5))',
      };
      return Object.entries(counts).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1), value,
        color: colors[name] || 'hsl(var(--chart-2))',
      }));
    },
  });

  const { data: monthlyData = [] } = useQuery({
    queryKey: ['report-monthly'],
    queryFn: async () => {
      const { data } = await supabase.from('transactions').select('amount, type, date');
      if (!data) return [];
      const byMonth: Record<string, { disbursed: number; repaid: number }> = {};
      data.forEach(t => {
        const month = new Date(t.date).toLocaleString('default', { month: 'short', year: '2-digit' });
        if (!byMonth[month]) byMonth[month] = { disbursed: 0, repaid: 0 };
        if (t.type === 'disbursement') byMonth[month].disbursed += Number(t.amount);
        else byMonth[month].repaid += Number(t.amount);
      });
      return Object.entries(byMonth).map(([month, v]) => ({ month, ...v }));
    },
  });

  const { data: officerPerformance = [] } = useQuery({
    queryKey: ['report-officer-performance'],
    queryFn: async () => {
      const { data: officers } = await supabase.from('loan_officers').select('id, name');
      if (!officers) return [];
      return Promise.all(officers.map(async (o) => {
        const { data: loans } = await supabase.from('loans').select('amount, outstanding_balance').eq('officer_id', o.id);
        const disbursed = (loans || []).reduce((s, l) => s + Number(l.amount), 0);
        const outstanding = (loans || []).reduce((s, l) => s + Number(l.outstanding_balance), 0);
        const repaid = Math.max(0, disbursed - outstanding);
        return { name: o.name, disbursed, repaid, outstanding };
      }));
    },
  });

  const { data: loansList = [] } = useQuery({
    queryKey: ['report-loans-list'],
    queryFn: async () => {
      const { data } = await supabase.from('loans').select('*, loan_officers(name)').order('created_at', { ascending: false });
      return data || [];
    },
  });

  const exportCSV = () => {
    const headers = ['Officer', 'Amount', 'Interest%', 'Duration', 'Status', 'Outstanding', 'Disbursement Date'];
    const rows = loansList.map((l: any) => [
      l.loan_officers?.name, l.amount, l.interest,
      l.duration, l.status, l.outstanding_balance, l.disbursement_date || 'N/A',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loan-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    const [jsPDFModule, autoTableModule] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ]);
    const jsPDF = jsPDFModule.default;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Aiders Global - Loan Report', 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);

    (doc as any).autoTable({
      startY: 38,
      head: [['Officer', 'Amount', 'Interest', 'Status', 'Outstanding']],
      body: loansList.map((l: any) => [
        l.loan_officers?.name,
        formatNaira(l.amount), `${l.interest}%`, l.status, formatNaira(l.outstanding_balance),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 95] },
    });

    doc.save(`loan-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Reports & Analytics</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-2" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileText className="w-4 h-4 mr-2" /> PDF</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Loan Status Distribution</CardTitle></CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {statusData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-[250px] flex items-center justify-center text-muted-foreground">No loan data</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Monthly Disbursement vs Repayment</CardTitle></CardHeader>
          <CardContent>
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(value: number) => formatNaira(value)} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                  <Legend />
                  <Bar dataKey="disbursed" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Disbursed" />
                  <Bar dataKey="repaid" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} name="Repaid" />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-[250px] flex items-center justify-center text-muted-foreground">No transaction data</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Officer Performance Comparison</CardTitle></CardHeader>
        <CardContent>
          {officerPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={officerPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip formatter={(value: number) => formatNaira(value)} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                <Legend />
                <Bar dataKey="disbursed" fill="hsl(var(--chart-1))" name="Disbursed" />
                <Bar dataKey="repaid" fill="hsl(var(--chart-3))" name="Repaid" />
                <Bar dataKey="outstanding" fill="hsl(var(--chart-5))" name="Outstanding" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-[300px] flex items-center justify-center text-muted-foreground">No officer data</div>}
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
