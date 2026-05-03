import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Briefcase,
  CreditCard,
  FileText,
  UserCog,
  BarChart3,
  LogOut,
  ChevronDown,
  Menu,
  X,
  ClipboardList,
  Map,
  Wallet,
  Receipt,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/app/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: ["super_admin", "loan_officer", "staff"] },
  { to: "/app/loan-officers", icon: Briefcase, label: "Loan Officers", roles: ["super_admin"] },
  { to: "/app/loans", icon: CreditCard, label: "Loans", roles: ["super_admin", "loan_officer"] },
  { to: "/app/transactions", icon: FileText, label: "Transactions", roles: ["super_admin", "loan_officer"] },
  { to: "/app/expenses", icon: Receipt, label: "Expenses", roles: ["super_admin"] },
  { to: "/app/repayments", icon: Wallet, label: "Repayments", roles: ["super_admin"] },
  { to: "/app/map", icon: Map, label: "Officer Map", roles: ["super_admin"] },
  { to: "/app/staff", icon: UserCog, label: "Staff", roles: ["super_admin"] },
  { to: "/app/reports", icon: BarChart3, label: "Reports", roles: ["super_admin"] },
  { to: "/app/audit-logs", icon: ClipboardList, label: "Audit Logs", roles: ["super_admin"] },
];

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true }); // ✅ FIXED
  };

  const filteredNav = navItems.filter((item) =>
    item.roles.includes(user?.role || "staff")
  );

  const SidebarContent = () => (
    <>
      <div className="p-5 flex items-center gap-3">
        <img src="/logo.png" alt="AIDERS Global Logo" className="w-9 h-9 rounded-lg" />
        <div>
          <h1 className="text-base font-bold text-sidebar-primary">AIDERS</h1>
          <p className="text-[10px] text-sidebar-muted uppercase tracking-widest">
            Global
          </p>
        </div>
      </div>

      <nav className="flex-1 px-3 mt-2 space-y-1">
        {filteredNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
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
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full hover:bg-sidebar-accent/50"
        >
          <LogOut className="w-[18px] h-[18px]" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-[240px] flex-col bg-sidebar border-r fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-black/30"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-[260px] bg-sidebar flex flex-col z-50">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 lg:ml-[240px] flex flex-col min-h-screen">
        <header className="h-16 border-b flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>

            <h2 className="text-lg font-semibold">
              Aiders Global Admin Panel
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white">
              {user?.name?.charAt(0)}
            </div>

            <div className="hidden sm:block">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {user?.role?.replace("_", " ")}
              </p>
            </div>

            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">
          <Outlet /> {/* 🔥 REQUIRED */}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;