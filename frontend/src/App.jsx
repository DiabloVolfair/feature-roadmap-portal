import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import RoadmapPage from "./pages/RoadmapPage";
import NotFoundPage from "./pages/NotFoundPage";

/**
 * App defines the top-level route table. Every route renders inside the
 * shared Layout (Navbar + Outlet) so navigation is present on every page.
 *
 * Requirements: 2.1, 2.2, 1.5
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<SignupPage />} />
          <Route path="roadmap" element={<RoadmapPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
