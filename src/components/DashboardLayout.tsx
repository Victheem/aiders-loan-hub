import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard, Users, Briefcase, CreditCard, FileText, UserCog, BarChart3,
  LogOut, Shield, ChevronDown, Menu, X, ClipboardList, Map
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['super_admin', 'loan_officer', 'staff'] },
  { to: '/loan-officers', icon: Briefcase, label: 'Loan Officers', roles: ['super_admin'] },
  
  { to: '/loans', icon: CreditCard, label: 'Loans', roles: ['super_admin', 'loan_officer'] },
  { to: '/transactions', icon: FileText, label: 'Transactions', roles: ['super_admin', 'loan_officer'] },
  { to: '/map', icon: Map, label: 'Officer Map', roles: ['super_admin'] },
  { to: '/staff', icon: UserCog, label: 'Staff', roles: ['super_admin'] },
  { to: '/reports', icon: BarChart3, label: 'Reports', roles: ['super_admin'] },
  { to: '/audit-logs', icon: ClipboardList, label: 'Audit Logs', roles: ['super_admin'] },
];

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const filteredNav = navItems.filter(item => user && item.roles.includes(user.role));

  const SidebarContent = () => (
    <>
      <div className="p-5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-sidebar-accent flex items-center justify-center">
          <Shield className="w-5 h-5 text-sidebar-primary" />
        </div>
        <div>
          <h1 className="text-base font-bold text-sidebar-primary tracking-tight">AIDERS</h1>
          <p className="text-[10px] text-sidebar-muted tracking-[0.25em] uppercase">Global</p>
        </div>
      </div>

      <nav className="flex-1 px-3 mt-2 space-y-1">
        {filteredNav.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-primary'
              }`
            }
          >
            <item.icon className="w-[18px] h-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 mt-auto">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-primary transition-colors w-full"
        >
          <LogOut className="w-[18px] h-[18px]" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[240px] flex-col bg-sidebar border-r border-sidebar-border fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed inset-y-0 left-0 w-[260px] bg-sidebar flex flex-col animate-slide-in-left z-50">
            <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 text-sidebar-foreground">
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-[240px] flex flex-col min-h-screen">
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-8 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <h2 className="text-lg font-semibold text-foreground">Aiders Global Admin Panel</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-sm font-semibold text-primary-foreground">
              {user?.name?.charAt(0)}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-foreground">{user?.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
