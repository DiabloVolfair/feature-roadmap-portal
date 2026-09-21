import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import LoginRequiredModal from "./LoginRequiredModal";

// Rendering-level tests for LoginRequiredModal. Navigation is asserted the
// same way as the other router-aware components in this directory
// (ProtectedRoute/AdminRoute/ResetPasswordPage): mount a real router with
// destination-marker routes and check that the marker page appears after an
// action, rather than mocking useNavigate. The modal starts on a `/` route so
// a navigation to /login or /signup swaps in a distinct marker.
// Validates: Requirements 14.3, 14.4, 14.5

const LOGIN_MARKER = "Login Page Marker";
const SIGNUP_MARKER = "Signup Page Marker";

function renderModal({ isOpen = true, onClose = vi.fn() } = {}) {
  const result = render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="/"
          element={<LoginRequiredModal isOpen={isOpen} onClose={onClose} />}
        />
        <Route path="/login" element={<div>{LOGIN_MARKER}</div>} />
        <Route path="/signup" element={<div>{SIGNUP_MARKER}</div>} />
      </Routes>
    </MemoryRouter>
  );
  return { ...result, onClose };
}

describe("LoginRequiredModal", () => {
  it("renders the exact message and Login/Signup/Cancel actions when open", () => {
    renderModal({ isOpen: true });

    expect(
      screen.getByText("Log in to vote for feature requests.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Signup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("renders nothing when isOpen is false", () => {
    renderModal({ isOpen: false });

    expect(
      screen.queryByText("Log in to vote for feature requests.")
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not navigate away when the modal opens (no navigation on mount)", () => {
    renderModal({ isOpen: true });

    // Still on the originating route: neither destination marker rendered.
    expect(screen.queryByText(LOGIN_MARKER)).not.toBeInTheDocument();
    expect(screen.queryByText(SIGNUP_MARKER)).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("navigates to /login when Login is activated", async () => {
    const user = userEvent.setup();
    renderModal({ isOpen: true });

    await user.click(screen.getByRole("button", { name: "Login" }));

    expect(screen.getByText(LOGIN_MARKER)).toBeInTheDocument();
    expect(screen.queryByText(SIGNUP_MARKER)).not.toBeInTheDocument();
  });

  it("navigates to /signup when Signup is activated", async () => {
    const user = userEvent.setup();
    renderModal({ isOpen: true });

    await user.click(screen.getByRole("button", { name: "Signup" }));

    expect(screen.getByText(SIGNUP_MARKER)).toBeInTheDocument();
    expect(screen.queryByText(LOGIN_MARKER)).not.toBeInTheDocument();
  });

  it("calls onClose and does not navigate when Cancel is activated", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal({ isOpen: true });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    // No navigation occurred: neither destination marker is present.
    expect(screen.queryByText(LOGIN_MARKER)).not.toBeInTheDocument();
    expect(screen.queryByText(SIGNUP_MARKER)).not.toBeInTheDocument();
  });
});
