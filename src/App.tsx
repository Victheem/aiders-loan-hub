import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PublicRoute } from "@/components/PublicRoute";

import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import DashboardLayout from "./components/DashboardLayout";

import Dashboard from "./pages/Dashboard";
import LoanOfficers from "./pages/LoanOfficers";
import Loans from "./pages/Loans";
import Transactions from "./pages/Transactions";
import Staff from "./pages/Staff";
import Reports from "./pages/Reports";
import AuditLogs from "./pages/AuditLogs";
import MapView from "./pages/MapView";
import NotFound from "./pages/NotFound";
import Repayments from "./pages/Repayments";
import Expenses from "./pages/Expenses";

const queryClient = new QueryClient();

const AppRoutes = () => (
  <Routes>
    {/* PUBLIC */}
    <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
    <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />

    {/* PROTECTED */}
    <Route path="/app" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="loan-officers" element={<LoanOfficers />} />
      <Route path="loans" element={<Loans />} />
      <Route path="transactions" element={<Transactions />} />
      <Route path="expenses" element={<Expenses />} />
      <Route path="map" element={<MapView />} />
      <Route path="staff" element={<Staff />} />
      <Route path="reports" element={<Reports />} />
      <Route path="audit-logs" element={<AuditLogs />} />
      <Route path="repayments" element={<Repayments />} />
    </Route>

    {/* DEFAULT */}
    <Route path="/" element={<Navigate to="/login" replace />} />

    {/* 404 */}
    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default function App() {
  return (
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
}