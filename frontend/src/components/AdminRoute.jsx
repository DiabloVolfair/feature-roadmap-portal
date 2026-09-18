import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Pure decision function for AdminRoute. Given the loading/isAuthenticated
 * state from Auth_Context plus the current user's is_verified/role, returns
 * which of three outcomes to render:
 * - "loading": Auth_Context hasn't finished its startup session check yet.
 * - "redirect-home": loading is done and the user is not an authenticated,
 *   verified admin.
 * - "children": loading is done and the user is an authenticated, verified
 *   admin.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
 */
export function selectAdminRouteOutcome({ loading, isAuthenticated, is_verified, role }) {
  if (loading) return "loading";
  if (!isAuthenticated || !is_verified || role !== "admin") return "redirect-home";
  return "children";
}

/**
 * AdminRoute gates its children on authentication, verification, and role
 * together. Unlike ProtectedRoute, a disallowed user is redirected to "/"
 * rather than "/login" - a logged-in non-admin isn't "not logged in", so
 * sending them to a login form would be misleading. Requirements: 15.1-15.5
 */
function AdminRoute({ children }) {
  const { user, isAuthenticated, loading } = useAuth();
  const outcome = selectAdminRouteOutcome({
    loading,
    isAuthenticated,
    is_verified: user?.is_verified,
    role: user?.role,
  });

  if (outcome === "loading") {
    return (
      <div className="flex justify-center py-12 text-slate-600" role="status">
        Loading...
      </div>
    );
  }

  if (outcome === "redirect-home") {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default AdminRoute;
