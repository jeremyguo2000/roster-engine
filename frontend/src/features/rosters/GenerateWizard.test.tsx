import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { GenerateWizard } from "./GenerateWizard";
import { api } from "@/api/client";

/**
 * Stubs the axios adapter to satisfy the wizard's internal data deps
 * (profiles list, demands in window, rosters list) so we can exercise the
 * step-validation logic end-to-end.
 */
function stubBackend() {
  const original = api.defaults.adapter;
  api.defaults.adapter = async (config) => {
    const url = config.url ?? "";
    let data: unknown = [];
    if (url === "/profiles") {
      data = [{ id: 1, name: "Default", config: {} }];
    } else if (url === "/demands") {
      data = [];
    } else if (url === "/rosters") {
      data = [];
    }
    return {
      data,
      status: 200,
      statusText: "OK",
      headers: {},
      config,
      request: {},
    };
  };
  return () => {
    api.defaults.adapter = original;
  };
}

function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <GenerateWizard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GenerateWizard", () => {
  let restore: () => void;

  beforeEach(() => {
    restore = stubBackend();
  });

  afterEach(() => {
    restore();
    vi.restoreAllMocks();
  });

  it("blocks Next on step 1 until a profile is selected", async () => {
    renderWizard();

    const nextBtn = await screen.findByRole("button", { name: /next/i });
    expect(nextBtn).toBeDisabled();

    // Wait for profiles query to resolve and populate the select.
    await screen.findByText("Select a profile");
    expect(nextBtn).toBeDisabled(); // still disabled — profile not chosen
  });

  it("blocks Next on the window step if name is empty", async () => {
    const user = userEvent.setup();
    renderWizard();

    // Step 1 — pick the only profile.
    const trigger = await screen.findByRole("combobox");
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Default" }));

    const nextBtn = screen.getByRole("button", { name: /next/i });
    expect(nextBtn).toBeEnabled();
    await user.click(nextBtn);

    // Step 2 — name field is empty so Next is disabled.
    expect(await screen.findByLabelText(/name/i)).toBeInTheDocument();
    const next2 = screen.getByRole("button", { name: /next/i });
    expect(next2).toBeDisabled();

    await user.type(screen.getByLabelText(/name/i), "Week of 2026-05-18");
    expect(next2).toBeEnabled();
  });
});
