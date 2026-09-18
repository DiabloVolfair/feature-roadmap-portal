import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Pure decision function for ProtectedRoute. Given the loading/isAuthenticated
 * state from Auth_Context, returns which of three outcomes to render:
 * - "loading": Auth_Context hasn't finished its startup session check yet.
 * - "redirect-login": loading is done and the user is not authenticated.
 * - "children": loading is done and the user is authenticated.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */
export function selectProtectedRouteOutcome({ loading, isAuthenticated }) {
  if (loading) return "loading";
  if (!isAuthenticated) return "redirect-login";
  return "children";
}

/**
 * ProtectedRoute gates its children on authentication state alone (not
 * verification or role - see AdminRoute for that). Requirements: 14.1-14.5
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const outcome = selectProtectedRouteOutcome({ loading, isAuthenticated });

  if (outcome === "loading") {
    return (
      <div className="flex justify-center py-12 text-slate-600" role="status">
        Loading...
      </div>
    );
  }

  if (outcome === "redirect-login") {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default ProtectedRoute;
