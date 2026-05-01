import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";

interface Props {
  children: JSX.Element;
}

export function PublicRoute({ children }: Props) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Checking authentication...</div>;
  }

  if (isAuthenticated) {
    // If user is logged in, redirect to dashboard
    return <Navigate to="/app/dashboard" replace state={{ from: location }} />;
  }

  return children;
}