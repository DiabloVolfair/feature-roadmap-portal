import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";
import { useHealthCheck } from "./hooks/useHealthCheck";

vi.mock("./hooks/useHealthCheck");

// App.jsx renders a BrowserRouter, so routes are exercised by pushing the
// desired path onto jsdom's history before rendering <App /> for each case.
function renderAppAtPath(path) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("App routing", () => {
  beforeEach(() => {
    useHealthCheck.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
    });
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("renders the HomePage at /", () => {
    renderAppAtPath("/");

    expect(
      screen.getByRole("heading", {
        name: "Feature Request & Public Roadmap Portal",
      })
    ).toBeInTheDocument();
  });

  it("renders the LoginPage at /login", () => {
    renderAppAtPath("/login");

    expect(
      screen.getByRole("heading", { name: /Login/i })
    ).toBeInTheDocument();
  });

  it("renders the SignupPage at /signup", () => {
    renderAppAtPath("/signup");

    expect(
      screen.getByRole("heading", { name: /Signup/i })
    ).toBeInTheDocument();
  });

  it("renders the RoadmapPage at /roadmap", () => {
    renderAppAtPath("/roadmap");

    expect(
      screen.getByRole("heading", { name: /Roadmap/i })
    ).toBeInTheDocument();
  });

  it("renders the NotFoundPage at an undefined path", () => {
    renderAppAtPath("/nonexistent-path");

    expect(
      screen.getByRole("heading", { name: /Not Found/i })
    ).toBeInTheDocument();
  });
});
