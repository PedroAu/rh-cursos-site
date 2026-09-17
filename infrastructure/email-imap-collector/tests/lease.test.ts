import { describe, expect, it, vi } from "vitest";

import { runWithLease, type LeaseStore } from "../src/lease.js";

function leaseStore(acquired: boolean) {
  return {
    acquireLease: vi.fn().mockResolvedValue(acquired),
    releaseLease: vi.fn().mockResolvedValue(true),
  } satisfies LeaseStore;
}

describe("runWithLease", () => {
  it("executa e libera a concessão quando ela é adquirida", async () => {
    const store = leaseStore(true);
    const operation = vi.fn().mockResolvedValue("done");

    await expect(runWithLease(store, "account", "request-1", 100, 90, operation))
      .resolves.toEqual({ acquired: true, value: "done" });
    expect(store.acquireLease).toHaveBeenCalledWith("account", "request-1", 100, 190);
    expect(store.releaseLease).toHaveBeenCalledWith("account", "request-1");
  });

  it("não executa quando outra invocação possui a concessão", async () => {
    const store = leaseStore(false);
    const operation = vi.fn();

    await expect(runWithLease(store, "account", "request-2", 100, 90, operation))
      .resolves.toEqual({ acquired: false });
    expect(operation).not.toHaveBeenCalled();
    expect(store.releaseLease).not.toHaveBeenCalled();
  });

  it("libera a concessão mesmo quando a coleta falha", async () => {
    const store = leaseStore(true);
    const operation = vi.fn().mockRejectedValue(new Error("temporary"));

    await expect(runWithLease(store, "account", "request-3", 100, 90, operation))
      .rejects.toThrow("temporary");
    expect(store.releaseLease).toHaveBeenCalledWith("account", "request-3");
  });
});
