import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { toast } from "sonner";
import VerifyEmailPage from "./VerifyEmailPage";
import { authService } from "../services/authService";

// Rendering-level tests for VerifyEmailPage's success/failure branches. The
// pure gate function (`shouldCallVerifyEmail`) is covered separately by the
// property test in VerifyEmailPage.state.test.jsx; this file only exercises
// the component's rendered output, toast calls, and the setTimeout-based
// navigation delay.
// Validates: Requirements 17.3, 17.4
vi.mock("../services/authService", () => ({
  authService: {
    verifyEmail: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderVerifyEmailPage() {
  return render(
    <MemoryRouter initialEntries={["/verify-email?token=abc123"]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/login" element={<div>Login Marker</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// authService.verifyEmail resolves/rejects under *real* timers (its promise
// microtasks aren't affected by faking setTimeout), so instead of switching
// the whole clock to fake timers - which would not retroactively catch a
// setTimeout already scheduled under real timers - we spy directly on the
// global setTimeout used for the two-second navigation delay. This lets us
// assert the exact delay requested and trigger it deterministically without
// an actual 2-second wait or fake/real timer-mode juggling.
let setTimeoutSpy;

beforeEach(() => {
  vi.clearAllMocks();
  setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
});

afterEach(() => {
  setTimeoutSpy.mockRestore();
});

describe("VerifyEmailPage (rendering)", () => {
  it("on success shows a success state, toasts, and navigates to /login after the delay", async () => {
    authService.verifyEmail.mockResolvedValue({});

    renderVerifyEmailPage();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Email verified successfully.");
    });
    expect(
      screen.getByText("Your email has been verified. Redirecting to login...")
    ).toBeInTheDocument();
    expect(screen.queryByText("Login Marker")).not.toBeInTheDocument();

    // The success handler must schedule navigation exactly 2000ms out.
    const navigationCall = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 2000);
    expect(navigationCall).toBeDefined();
    const [navigationCallback] = navigationCall;

    act(() => {
      navigationCallback();
    });

    await waitFor(() => {
      expect(screen.getByText("Login Marker")).toBeInTheDocument();
    });
  });

  it("on failure shows a failure state, toasts an error, and never navigates", async () => {
    authService.verifyEmail.mockRejectedValue(new Error("invalid token"));

    renderVerifyEmailPage();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "This verification link is invalid or has expired."
      );
    });
    expect(
      screen.getByText("This verification link is invalid or has expired.")
    ).toBeInTheDocument();

    // No navigation delay should ever be scheduled on the failure branch.
    const navigationCall = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 2000);
    expect(navigationCall).toBeUndefined();
    expect(screen.queryByText("Login Marker")).not.toBeInTheDocument();
  });
});
