import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Navbar from "./Navbar";

const EXPECTED_LINKS = [
  { name: "Home", href: "/" },
  { name: "Login", href: "/login" },
  { name: "Signup", href: "/signup" },
  { name: "Roadmap", href: "/roadmap" },
];

function renderNavbar() {
  return render(
    <MemoryRouter>
      <Navbar />
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
  it("renders exactly four navigation links with the correct hrefs", () => {
    renderNavbar();

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
    renderNavbar();

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
});
