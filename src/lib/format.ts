export function formatNaira(amount: number): string {
  return '₦' + amount.toLocaleString('en-NG');
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'approved': return 'bg-success/10 text-success';
    case 'pending': return 'bg-warning/10 text-warning';
    case 'repaid': return 'bg-info/10 text-info';
    case 'overdue': return 'bg-destructive/10 text-destructive';
    default: return 'bg-muted text-muted-foreground';
  }
}
