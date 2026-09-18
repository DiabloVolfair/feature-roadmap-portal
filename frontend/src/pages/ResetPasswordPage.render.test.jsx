import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { toast } from "sonner";
import ResetPasswordPage from "./ResetPasswordPage";
import { authService } from "../services/authService";

// Rendering-level tests for ResetPasswordPage's validation/success/failure
// branches. The pure gate function (`validateResetPasswordForm`) is covered
// separately by the property test in ResetPasswordPage.test.jsx; this file
// only exercises the component's rendered output, service calls, toast
// calls, and navigation.
// Validates: Requirements 19.2, 19.4, 19.5
vi.mock("../services/authService", () => ({
  authService: {
    resetPassword: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderResetPasswordPage() {
  return render(
    <MemoryRouter initialEntries={["/reset-password?token=abc123"]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<div>Login Marker</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function fillAndSubmit(newPassword, confirmPassword) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("New Password"), newPassword);
  await user.type(screen.getByLabelText("Confirm Password"), confirmPassword);
  await user.click(screen.getByRole("button", { name: "Reset Password" }));
}

describe("ResetPasswordPage (rendering)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a validation message and does not call the service when the password is too short", async () => {
    renderResetPasswordPage();

    await fillAndSubmit("short", "short");

    expect(
      screen.getByText("Password must be at least 8 characters.")
    ).toBeInTheDocument();
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it("shows a validation message and does not call the service when the confirmation does not match", async () => {
    renderResetPasswordPage();

    await fillAndSubmit("longenough123", "somethingelse");

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it("on success toasts and navigates to /login", async () => {
    authService.resetPassword.mockResolvedValue({});
    renderResetPasswordPage();

    await fillAndSubmit("longenough123", "longenough123");

    await waitFor(() => {
      expect(authService.resetPassword).toHaveBeenCalledWith("abc123", "longenough123");
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Password updated.");
    });
    await waitFor(() => {
      expect(screen.getByText("Login Marker")).toBeInTheDocument();
    });
  });

  it("on failure toasts an error and stays on the page", async () => {
    authService.resetPassword.mockRejectedValue(new Error("invalid or expired token"));
    renderResetPasswordPage();

    await fillAndSubmit("longenough123", "longenough123");

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "This reset link is invalid or has expired."
      );
    });
    expect(screen.queryByText("Login Marker")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Password" })).toBeInTheDocument();
  });
});
