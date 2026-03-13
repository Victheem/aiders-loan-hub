import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning';
}

const variantStyles = {
  default: 'bg-card border-border',
  primary: 'bg-card border-border',
  success: 'bg-card border-border',
  warning: 'bg-card border-border',
};

const iconStyles = {
  default: 'bg-primary/10 text-primary',
  primary: 'bg-accent/10 text-accent',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
};

const KPICard = ({ title, value, icon: Icon, trend, variant = 'default' }: KPICardProps) => {
  return (
    <Card className={`${variantStyles[variant]} animate-fade-in`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {trend && <p className="text-xs text-success mt-1">{trend}</p>}
          </div>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconStyles[variant]}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default KPICard;
