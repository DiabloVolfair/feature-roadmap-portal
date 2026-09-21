import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import RoadmapPage from "./pages/RoadmapPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import DashboardPage from "./pages/DashboardPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminBoardPage from "./pages/AdminBoardPage";
import FeatureDetailsPage from "./pages/FeatureDetailsPage";
import NotFoundPage from "./pages/NotFoundPage";

/**
 * App defines the top-level route table. Every route renders inside the
 * shared Layout (Navbar + Outlet) so navigation is present on every page.
 * AuthProvider wraps Routes (not the reverse) so any page or the Navbar
 * can call useAuth() to read/update authentication state.
 *
 * Requirements: 2.1, 2.2, 1.5, 21.1
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="signup" element={<SignupPage />} />
            <Route path="roadmap" element={<RoadmapPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />
            <Route path="verify-email" element={<VerifyEmailPage />} />
            <Route
              path="dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin"
              element={
                <AdminRoute>
                  <AdminDashboardPage />
                </AdminRoute>
              }
            />
            <Route
              path="admin/board"
              element={
                <AdminRoute>
                  <AdminBoardPage />
                </AdminRoute>
              }
            />
            <Route
              path="features/:featureId"
              element={<FeatureDetailsPage />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
