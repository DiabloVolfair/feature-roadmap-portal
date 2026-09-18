import { useState } from "react";
import { NavLink } from "react-router-dom";

const NAV_LINKS = [
  { label: "Home", to: "/" },
  { label: "Login", to: "/login" },
  { label: "Signup", to: "/signup" },
  { label: "Roadmap", to: "/roadmap" },
];

function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const linkClassName = ({ isActive }) =>
    `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? "text-slate-900 bg-slate-100"
        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
    }`;

  return (
    <nav className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <span className="text-lg font-semibold text-slate-900">
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
        </ul>
      </div>
    </nav>
  );
}

export default Navbar;
