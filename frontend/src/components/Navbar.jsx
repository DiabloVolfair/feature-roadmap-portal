import { useState } from "react";
import { NavLink } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { authService } from "../services/authService";

const NAV_LINKS = [
  { label: "Home", to: "/" },
  { label: "Roadmap", to: "/roadmap" },
];

const GUEST_NAV_LINKS = [
  { label: "Login", to: "/login" },
  { label: "Signup", to: "/signup" },
];

const navLinkClassName = ({ isActive }) =>
  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? "text-slate-900 bg-slate-100"
      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
  }`;

const logoutButtonClassName =
  "block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors";

const verifyEmailButtonClassName =
  "block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors";

/**
 * selectNavbarState is a pure function of the current authentication state
 * that decides which of the Navbar's four mutually-exclusive states to
 * render. It has no side effects and does not read from `useAuth()`
 * directly, so it can be tested independently of React rendering.
 *
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6
 */
export function selectNavbarState({ loading, isAuthenticated, is_verified, role }) {
  if (loading) return "loading";
  if (!isAuthenticated) return "guest";
  if (!is_verified) return "unverified";
  if (role === "admin") return "admin";
  return "verified-user";
}

function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, loading, logout } = useAuth();

  const linkClassName = navLinkClassName;

  const navState = selectNavbarState({
    loading,
    isAuthenticated,
    is_verified: user?.is_verified,
    role: user?.role,
  });

  function handleSendVerification() {
    authService
      .sendVerification()
      .then(() => {
        toast.success("Verification email sent.");
      })
      .catch(() => {
        toast.error("Failed to send verification email.");
      });
  }

  function renderAuthItems(onNavigate) {
    if (navState === "loading") {
      return null;
    }

    if (navState === "guest") {
      return GUEST_NAV_LINKS.map((link) => (
        <li key={link.to}>
          <NavLink to={link.to} className={linkClassName} onClick={onNavigate}>
            {link.label}
          </NavLink>
        </li>
      ));
    }

    if (navState === "unverified") {
      return (
        <>
          <li>
            <button
              type="button"
              className={verifyEmailButtonClassName}
              onClick={() => {
                onNavigate?.();
                handleSendVerification();
              }}
            >
              Verify Email
            </button>
          </li>
          <li>
            <NavLink to="/dashboard" className={linkClassName} onClick={onNavigate}>
              Dashboard
            </NavLink>
          </li>
        </>
      );
    }

    if (navState === "admin") {
      return (
        <>
          <li className="px-3 py-2 text-sm font-medium text-slate-900">
            {user?.name}
          </li>
          <li>
            <NavLink to="/dashboard" className={linkClassName} onClick={onNavigate}>
              Dashboard
            </NavLink>
          </li>
          <li>
            <NavLink to="/admin" className={linkClassName} onClick={onNavigate}>
              Admin Panel
            </NavLink>
          </li>
          <li>
            <button
              type="button"
              className={logoutButtonClassName}
              onClick={() => {
                onNavigate?.();
                logout();
              }}
            >
              Logout
            </button>
          </li>
        </>
      );
    }

    // navState === "verified-user"
    return (
      <>
        <li className="px-3 py-2 text-sm font-medium text-slate-900">
          {user?.name}
        </li>
        <li>
          <NavLink to="/dashboard" className={linkClassName} onClick={onNavigate}>
            Dashboard
          </NavLink>
        </li>
        <li>
          <button
            type="button"
            className={logoutButtonClassName}
            onClick={() => {
              onNavigate?.();
              logout();
            }}
          >
            Logout
          </button>
        </li>
      </>
    );
  }

  return (
    <nav className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <span className="text-base font-bold text-indigo-600">
            Feature Roadmap Portal
          </span>

          <ul className="hidden md:flex items-center gap-2">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} className={linkClassName}>
                  {link.label}
                </NavLink>
              </li>
            ))}
            {renderAuthItems()}
          </ul>

          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              {isMobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        <ul
          className={`md:hidden pb-3 ${isMobileMenuOpen ? "flex" : "hidden"} flex-col gap-1`}
        >
          {NAV_LINKS.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={linkClassName}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </NavLink>
            </li>
          ))}
          {renderAuthItems(() => setIsMobileMenuOpen(false))}
        </ul>
      </div>
    </nav>
  );
}

export default Navbar;
