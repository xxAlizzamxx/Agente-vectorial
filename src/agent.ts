import { pathToFileURL } from "node:url";
import { Codex } from "@openai/codex-sdk";
import { requireFlag } from "./args.js";
import { requireEnv } from "./config.js";
import { buildAgentPrompt } from "./prompt.js";

function buildCodexEnv(): Record<string, string> {
  const entries = Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined);
  return {
    ...Object.fromEntries(entries),
    OPENAI_API_KEY: requireEnv("OPENAI_API_KEY"),
    OPENAI_VECTOR_STORE_ID: requireEnv("OPENAI_VECTOR_STORE_ID"),
  };
}

async function main(): Promise<void> {
  const question = requireFlag(process.argv.slice(2), "--question");
  const codex = new Codex({ env: buildCodexEnv() });
  // Codex aporta el loop y harness: herramientas, contexto, sandbox y finalización.
  const thread = codex.startThread({
    workingDirectory: process.cwd(), skipGitRepoCheck: true,
    model: process.env.CODEX_MODEL || undefined,
    sandboxMode: "read-only", approvalPolicy: "never",
  });
  const result = await thread.run(buildAgentPrompt(question));
  process.stdout.write(`${result.finalResponse}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(`Error del agente: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
