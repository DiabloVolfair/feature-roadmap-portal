import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";

/**
 * Layout wraps every page with the shared Navbar and a consistent page
 * shell (light background, dark text, base typography/spacing).
 *
 * Requirements: 3.1, 3.4, 3.7
 */
function Layout() {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-slate-50 text-slate-900 font-sans">
      <Navbar />
      <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
