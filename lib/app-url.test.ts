import { afterEach, describe, expect, it, vi } from "vitest";
import { appBaseUrl } from "./app-url";

describe("appBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("pins to NEXT_PUBLIC_APP_URL when configured, ignoring the request origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.dentalace.org/");
    expect(appBaseUrl("https://evil.example")).toBe("https://www.dentalace.org");
  });

  it("falls back to the canonical domain in production when unconfigured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(appBaseUrl()).toBe("https://www.dentalace.org");
    expect(appBaseUrl("https://evil.example")).toBe("https://www.dentalace.org");
  });

  it("uses the request origin in dev when unconfigured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(appBaseUrl("http://localhost:4000")).toBe("http://localhost:4000");
  });

  it("falls back to localhost in dev when no origin is in scope", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(appBaseUrl()).toBe("http://localhost:3000");
  });
});
