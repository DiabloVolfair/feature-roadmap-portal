import { describe, it, expect, vi } from "vitest";
import { render, screen, within, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Navbar from "./Navbar";
import { AuthProvider } from "../context/AuthContext";
import { authService } from "../services/authService";

const EXPECTED_LINKS = [
  { name: "Home", href: "/" },
  { name: "Login", href: "/login" },
  { name: "Signup", href: "/signup" },
  { name: "Roadmap", href: "/roadmap" },
];

// Navbar reads `useAuth()`, so it must be rendered under an AuthProvider
// ancestor (matching how it's mounted in the real app via App.jsx). The
// underlying authService calls are mocked to reject immediately so the
// provider's startup session-check effect settles into the logged-out
// state without making a real network call in jsdom.
vi.mock("../services/authService", () => ({
  authService: {
    refresh: vi.fn(),
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    signup: vi.fn(),
    sendVerification: vi.fn().mockResolvedValue({}),
  },
}));

async function renderNavbar() {
  authService.refresh.mockRejectedValue(new Error("no session"));

  const result = render(
    <MemoryRouter>
      <AuthProvider>
        <Navbar />
      </AuthProvider>
    </MemoryRouter>
  );

  // Wait for the provider's startup effect to finish so Navbar has settled
  // out of its `loading` state before assertions run.
  await waitFor(() => {
    expect(screen.getAllByRole("link", { name: "Login" }).length).toBeGreaterThan(0);
  });

  return result;
}

// Renders the Navbar with the AuthProvider settled into a specific
// authenticated state, driven by the shape of the mocked `getCurrentUser`
// response. Passing `null` settles the provider into the logged-out
// ("guest") state, mirroring `renderNavbar()`'s existing behavior.
async function renderNavbarAs(user) {
  if (user === null) {
    authService.refresh.mockRejectedValue(new Error("no session"));
  } else {
    authService.refresh.mockResolvedValue("access-token");
    authService.getCurrentUser.mockResolvedValue(user);
  }

  const result = render(
    <MemoryRouter>
      <AuthProvider>
        <Navbar />
      </AuthProvider>
    </MemoryRouter>
  );

  await waitFor(() => {
    // The provider's startup effect always finishes by rendering the
    // Navbar's primary nav list with more than the two always-present
    // Home/Roadmap links once settled out of "loading".
    const links = within(getPrimaryLinkList()).getAllByRole("link");
    expect(links.length).toBeGreaterThan(2);
  });

  return result;
}

// Renders the Navbar with `refresh()` left pending indefinitely so the
// AuthProvider never settles out of its initial `loading` state, allowing
// assertions against the Navbar's "loading" rendering (no auth controls).
function renderNavbarLoading() {
  authService.refresh.mockReturnValue(new Promise(() => {}));

  return render(
    <MemoryRouter>
      <AuthProvider>
        <Navbar />
      </AuthProvider>
    </MemoryRouter>
  );
}

// The Navbar renders two <ul> lists in the DOM at all times (a desktop list
// shown via a `md:flex` breakpoint class, and a collapsible mobile list) so
// that responsive CSS - which jsdom does not apply during tests - can toggle
// visibility without React re-mounting either list. Both lists always
// contain the same four canonical navigation links, so we assert the
// "exactly four links" requirement against the primary (desktop) list and
// separately confirm the collapsible (mobile) list mirrors it.
function getPrimaryLinkList() {
  const nav = screen.getByRole("navigation");
  const [primaryList] = within(nav).getAllByRole("list");
  return primaryList;
}

function getCollapsibleLinkList() {
  const nav = screen.getByRole("navigation");
  const lists = within(nav).getAllByRole("list");
  return lists[1];
}

function classTokens(element) {
  return element.className.split(/\s+/).filter(Boolean);
}

describe("Navbar", () => {
  it("renders exactly four navigation links with the correct hrefs", async () => {
    await renderNavbar();

    const links = within(getPrimaryLinkList()).getAllByRole("link");
    expect(links).toHaveLength(4);

    EXPECTED_LINKS.forEach(({ name, href }) => {
      const matches = links.filter((link) => link.textContent === name);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toHaveAttribute("href", href);
    });
  });

  it("expands the collapsed link list when the toggle is activated, and collapses it again on a second activation", async () => {
    const user = userEvent.setup();
    await renderNavbar();

    const toggle = screen.getByRole("button", { name: /toggle navigation menu/i });
    const collapsibleList = getCollapsibleLinkList();

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(classTokens(collapsibleList)).toContain("hidden");
    expect(classTokens(collapsibleList)).not.toContain("flex");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(classTokens(collapsibleList)).toContain("flex");
    expect(classTokens(collapsibleList)).not.toContain("hidden");
    expect(within(collapsibleList).getAllByRole("link")).toHaveLength(4);

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(classTokens(collapsibleList)).toContain("hidden");
    expect(classTokens(collapsibleList)).not.toContain("flex");
  });

  it("renders no auth controls while in the loading state", () => {
    renderNavbarLoading();

    const nav = screen.getByRole("navigation");
    expect(within(nav).queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Signup" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Verify Email" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Logout" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Admin Panel" })).not.toBeInTheDocument();
  });

  it("renders Login/Signup links and no authenticated controls in the guest state", async () => {
    await renderNavbarAs(null);

    const list = getPrimaryLinkList();
    expect(within(list).getByRole("link", { name: "Login" })).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: "Signup" })).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: "Verify Email" })).not.toBeInTheDocument();
    expect(within(list).queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: "Logout" })).not.toBeInTheDocument();
    expect(within(list).queryByRole("link", { name: "Admin Panel" })).not.toBeInTheDocument();
  });

  it("renders a Verify Email control and Dashboard link, but no Logout control, in the unverified state", async () => {
    await renderNavbarAs({
      id: "1",
      name: "Pat",
      email: "pat@example.com",
      is_verified: false,
      role: "user",
    });

    const list = getPrimaryLinkList();
    expect(within(list).getByRole("button", { name: "Verify Email" })).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: "Logout" })).not.toBeInTheDocument();
    expect(within(list).queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
    expect(within(list).queryByRole("link", { name: "Admin Panel" })).not.toBeInTheDocument();
  });

  it("renders a Dashboard link and Logout control, but no Admin Panel link or Verify Email control, in the verified-user state", async () => {
    await renderNavbarAs({
      id: "1",
      name: "Pat",
      email: "pat@example.com",
      is_verified: true,
      role: "user",
    });

    const list = getPrimaryLinkList();
    expect(within(list).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Logout" })).toBeInTheDocument();
    expect(within(list).queryByRole("link", { name: "Admin Panel" })).not.toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: "Verify Email" })).not.toBeInTheDocument();
  });

  it("renders Dashboard, Admin Panel, and Logout controls in the admin state", async () => {
    await renderNavbarAs({
      id: "1",
      name: "Pat",
      email: "pat@example.com",
      is_verified: true,
      role: "admin",
    });

    const list = getPrimaryLinkList();
    expect(within(list).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: "Admin Panel" })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Logout" })).toBeInTheDocument();
  });

  it("calls authService.sendVerification when the Verify Email control is clicked", async () => {
    const user = userEvent.setup();
    await renderNavbarAs({
      id: "1",
      name: "Pat",
      email: "pat@example.com",
      is_verified: false,
      role: "user",
    });

    const verifyButton = within(getPrimaryLinkList()).getByRole("button", { name: "Verify Email" });
    await user.click(verifyButton);

    expect(authService.sendVerification).toHaveBeenCalledTimes(1);
  });

  it("never renders a dropdown/menu element in any authentication state", async () => {
    // loading
    renderNavbarLoading();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    cleanup();

    // guest
    await renderNavbarAs(null);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    cleanup();

    // unverified
    await renderNavbarAs({
      id: "1",
      name: "Pat",
      email: "pat@example.com",
      is_verified: false,
      role: "user",
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    cleanup();

    // verified-user
    await renderNavbarAs({
      id: "1",
      name: "Pat",
      email: "pat@example.com",
      is_verified: true,
      role: "user",
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    cleanup();

    // admin
    await renderNavbarAs({
      id: "1",
      name: "Pat",
      email: "pat@example.com",
      is_verified: true,
      role: "admin",
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    cleanup();
  });
});
