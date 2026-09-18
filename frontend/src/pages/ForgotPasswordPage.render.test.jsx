import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ForgotPasswordPage from "./ForgotPasswordPage";
import { authService } from "../services/authService";
import { toast } from "sonner";

// Rendering/interaction-level tests for ForgotPasswordPage, kept in a
// separate file from ForgotPasswordPage.test.jsx (which covers the pure
// validateForgotPasswordForm property test) per the wave-separation
// convention documented in tasks.md.
//
// Validates: Requirements 18.3, 18.4, 18.5
vi.mock("../services/authService", () => ({
  authService: {
    forgotPassword: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>
  );
}

async function submitForm(email) {
  const user = userEvent.setup();
  if (email !== undefined) {
    await user.type(screen.getByLabelText("Email"), email);
  }
  await user.click(screen.getByRole("button", { name: /send reset link/i }));
}

describe("ForgotPasswordPage (rendering)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a validation message and does not call the service for an empty email", async () => {
    renderPage();

    await submitForm();

    await waitFor(() => {
      expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    });
    expect(authService.forgotPassword).not.toHaveBeenCalled();
  });

  it("shows a validation message and does not call the service for an invalidly formatted email", async () => {
    renderPage();

    await submitForm("not-an-email");

    await waitFor(() => {
      expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    });
    expect(authService.forgotPassword).not.toHaveBeenCalled();
  });

  it("shows the exact success toast when the mocked response includes a token field (development mode)", async () => {
    authService.forgotPassword.mockResolvedValue({
      message: "If an account exists, a reset link has been generated.",
      data: { token: "raw-dev-token" },
    });

    renderPage();

    await submitForm("user@example.com");

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "If an account exists, a reset link has been generated."
      );
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the same exact success toast when the mocked response has no token field (production mode / unknown account)", async () => {
    authService.forgotPassword.mockResolvedValue({
      message: "If an account exists, a reset link has been generated.",
      data: null,
    });

    renderPage();

    await submitForm("user@example.com");

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "If an account exists, a reset link has been generated."
      );
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows an error toast and stays on the page when the service call rejects", async () => {
    authService.forgotPassword.mockRejectedValue(new Error("Network error"));

    renderPage();

    await submitForm("user@example.com");

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Network error");
    });
    expect(toast.success).not.toHaveBeenCalled();
    // Still on the ForgotPasswordPage form.
    expect(screen.getByRole("heading", { name: "Forgot Password" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});
