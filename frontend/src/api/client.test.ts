import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  clearToken,
  readToken,
  setUnauthorizedHandler,
  writeToken,
} from "./client";

/**
 * These tests exercise the axios instance via its adapter so we can stub
 * responses without a real network. Avoids pulling in an extra mock library.
 */

interface FakeResponse {
  status: number;
  data?: unknown;
}

function stubAdapter(handler: (config: { url?: string; headers?: Record<string, unknown> }) => FakeResponse) {
  const original = api.defaults.adapter;
  api.defaults.adapter = async (config) => {
    const { status, data } = handler({
      url: config.url,
      headers: (config.headers ?? {}) as Record<string, unknown>,
    });
    if (status >= 200 && status < 300) {
      return {
        data,
        status,
        statusText: "OK",
        headers: {},
        config,
        request: {},
      };
    }
    const err = new Error(`Request failed with status ${status}`) as Error & {
      response: FakeResponse & { headers: Record<string, unknown>; config: unknown };
      isAxiosError: true;
    };
    err.isAxiosError = true;
    err.response = { status, data, headers: {}, config };
    throw err;
  };
  return () => {
    api.defaults.adapter = original;
  };
}

describe("api client", () => {
  let restore: () => void = () => {};

  beforeEach(() => {
    clearToken();
  });

  afterEach(() => {
    restore();
    clearToken();
    setUnauthorizedHandler(() => {});
  });

  it("attaches Bearer token to outgoing requests when one is stored", async () => {
    writeToken("abc.def", true);
    let seen: unknown;
    restore = stubAdapter(({ headers }) => {
      seen = headers?.Authorization;
      return { status: 200, data: { ok: true } };
    });

    await api.get("/foo");
    expect(seen).toBe("Bearer abc.def");
  });

  it("does not set Authorization when there is no token", async () => {
    let seen: unknown;
    restore = stubAdapter(({ headers }) => {
      seen = headers?.Authorization;
      return { status: 200, data: { ok: true } };
    });

    await api.get("/foo");
    expect(seen).toBeUndefined();
  });

  it("clears the token and invokes the unauthorized handler on a 401", async () => {
    writeToken("stale.token", true);
    expect(readToken()).toBe("stale.token");

    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    restore = stubAdapter(() => ({ status: 401, data: { detail: "Invalid token." } }));

    await expect(api.get("/secure")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(readToken()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not invoke the handler on non-401 errors", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    restore = stubAdapter(() => ({ status: 409, data: { detail: "nope" } }));

    await expect(api.get("/conflict")).rejects.toMatchObject({
      response: { status: 409 },
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("respects the remember flag when storing tokens", () => {
    writeToken("remember-me", true);
    expect(localStorage.getItem("roster-engine-token")).toBe("remember-me");
    expect(sessionStorage.getItem("roster-engine-token")).toBeNull();

    writeToken("session-only", false);
    expect(sessionStorage.getItem("roster-engine-token")).toBe("session-only");
    expect(localStorage.getItem("roster-engine-token")).toBeNull();
  });
});
