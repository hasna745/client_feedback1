import { Navigate, Outlet, useLocation } from "react-router-dom";
import { defaultRouteForRole, useAuth } from "../auth/AuthContext";
import { PageSkeleton } from "./LoadingStates";
import type { Role } from "../types";

export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="px-4 py-6 md:px-6 lg:px-8">
        <PageSkeleton />
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={defaultRouteForRole(user.role)} replace />;
  }

  return <Outlet />;
}
