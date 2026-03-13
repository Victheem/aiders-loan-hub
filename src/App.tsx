import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import LoanOfficers from "./pages/LoanOfficers";

import Loans from "./pages/Loans";
import Transactions from "./pages/Transactions";
import Staff from "./pages/Staff";
import Reports from "./pages/Reports";
import AuditLogs from "./pages/AuditLogs";
import MapView from "./pages/MapView";
import DashboardLayout from "./components/DashboardLayout";
import NotFound from "./pages/NotFound";
import { ReactNode } from "react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<PublicRoute><Login /></PublicRoute>} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="loan-officers" element={<LoanOfficers />} />
      
      <Route path="loans" element={<Loans />} />
      <Route path="transactions" element={<Transactions />} />
      <Route path="map" element={<MapView />} />
      <Route path="staff" element={<Staff />} />
      <Route path="reports" element={<Reports />} />
      <Route path="audit-logs" element={<AuditLogs />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
