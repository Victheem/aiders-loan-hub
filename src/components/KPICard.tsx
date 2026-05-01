import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

const variantStyles = {
  default: 'bg-card border-border',
  primary: 'bg-blue-50 border-blue-200',
  success: 'bg-green-50 border-green-200',
  warning: 'bg-yellow-50 border-yellow-200',
  danger: 'bg-red-50 border-red-200',
};

const iconStyles = {
  default: 'bg-primary/10 text-primary',
  primary: 'bg-blue-100 text-blue-600',
  success: 'bg-green-100 text-green-600',
  warning: 'bg-yellow-100 text-yellow-600',
  danger: 'bg-red-100 text-red-600',
};

const KPICard = ({ title, value, icon: Icon, trend, variant = 'default' }: KPICardProps) => {
  return (
    <Card className={`${variantStyles[variant]} border-2 animate-fade-in min-h-[80px] flex-shrink-0`}>
      <CardContent className="p-2">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium text-muted-foreground truncate">{title}</p>
            <p className="text-sm font-bold text-foreground truncate leading-tight" title={value}>{value}</p>
            {trend && <p className="text-[10px] text-success truncate">{trend}</p>}
          </div>
          <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${iconStyles[variant]}`}>
            <Icon className="w-3 h-3" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default KPICard;
