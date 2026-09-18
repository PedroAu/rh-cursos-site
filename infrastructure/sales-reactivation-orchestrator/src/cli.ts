import { runDryRun, runLiveBatch } from "./orchestrator.js";
import { createRuntime } from "./runtime.js";

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const command = process.argv[2] ?? "status";
  const runtime = await createRuntime();
  if (command === "status") return runtime.store.loadStatus(runtime.config.campaignKey, new Date());
  if (command === "dry-run") return runDryRun(runtime.store, { ...runtime.config, runMode: "DRY_RUN" });
  if (command === "pause") {
    await runtime.store.pause("sales-cli");
    return { paused: true };
  }
  if (command === "resume") {
    if (!process.argv.includes("--confirm-live")) throw new Error("resume requires --confirm-live.");
    const approval = option("approval");
    if (!approval) throw new Error("resume requires --approval=<reference>.");
    await runtime.store.resume("sales-cli", approval);
    return { resumed: true, approvalReference: approval };
  }
  if (command === "run-batch") {
    if (!process.argv.includes("--confirm-live")) throw new Error("run-batch requires --confirm-live.");
    return runLiveBatch(
      runtime,
      { ...runtime.config, runMode: "LIVE" },
      runtime.secret,
      new Date(),
      undefined,
      { discover: process.argv.includes("--discover") },
    );
  }
  throw new Error("Unknown command. Use status, dry-run, pause, resume or run-batch.");
}

main()
  .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Unknown failure"}\n`);
    process.exitCode = 1;
  });
