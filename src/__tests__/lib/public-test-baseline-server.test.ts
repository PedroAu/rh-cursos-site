import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookies: vi.fn(async () => ({ get: mocks.cookieGet }))
}));

vi.mock("next/headers", () => ({
  cookies: () => mocks.cookies()
}));

describe("getServerPublicTestBaselineEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.cookieGet.mockReset();
    mocks.cookies.mockClear();
    vi.stubEnv("PLAYWRIGHT_TEST_BUILD", "0");
    vi.stubEnv("NEXT_PUBLIC_PLAYWRIGHT_TEST_BASELINE", "0");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("não lê cookies no build de produção, preservando ISR", async () => {
    const { getServerPublicTestBaselineEnabled } = await import("@/lib/public-test-baseline-server");

    await expect(getServerPublicTestBaselineEnabled()).resolves.toBe(false);
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it("mantém o cookie de baseline no build E2E determinístico", async () => {
    vi.stubEnv("PLAYWRIGHT_TEST_BUILD", "1");
    vi.stubEnv("NEXT_PUBLIC_PLAYWRIGHT_TEST_BASELINE", "1");
    mocks.cookieGet.mockReturnValue({ value: "1" });
    const { getServerPublicTestBaselineEnabled } = await import("@/lib/public-test-baseline-server");

    await expect(getServerPublicTestBaselineEnabled()).resolves.toBe(true);
    expect(mocks.cookies).toHaveBeenCalledTimes(1);
    expect(mocks.cookieGet).toHaveBeenCalledWith("rh_cursos_public_test_baseline");
  });

  it.each([undefined, { value: "0" }])(
    "não ativa o baseline E2E sem o cookie habilitado",
    async (cookie) => {
      vi.stubEnv("PLAYWRIGHT_TEST_BUILD", "1");
      vi.stubEnv("NEXT_PUBLIC_PLAYWRIGHT_TEST_BASELINE", "1");
      mocks.cookieGet.mockReturnValue(cookie);
      const { getServerPublicTestBaselineEnabled } = await import("@/lib/public-test-baseline-server");

      await expect(getServerPublicTestBaselineEnabled()).resolves.toBe(false);
      expect(mocks.cookies).toHaveBeenCalledTimes(1);
    }
  );
});
