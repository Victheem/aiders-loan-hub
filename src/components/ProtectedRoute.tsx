import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";

interface Props {
  children: JSX.Element;
}

export function ProtectedRoute({ children }: Props) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Checking authentication...</div>;
  }

  if (!isAuthenticated) {
    // If not logged in, redirect to login
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}