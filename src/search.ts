import { Buffer } from "node:buffer";
import { pathToFileURL } from "node:url";
import OpenAI from "openai";
import { requireFlag, readFlag } from "./args.js";
import { parsePositiveInt, requireEnv } from "./config.js";
import { searchVectorStore } from "./vector-search.js";

export function readQuery(args: string[]): string {
  const plainQuery = readFlag(args, "--query")?.trim();
  const encodedQuery = readFlag(args, "--query-b64")?.trim();
  if (plainQuery && encodedQuery) throw new Error("Usa solo --query o --query-b64, no ambos.");
  if (encodedQuery) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encodedQuery) || encodedQuery.length % 4 !== 0) {
      throw new Error("El argumento --query-b64 no es Base64 valido.");
    }
    const decoded = Buffer.from(encodedQuery, "base64").toString("utf8").trim();
    if (!decoded) throw new Error("El argumento --query-b64 no contiene una pregunta valida.");
    return decoded;
  }
  if (plainQuery) return plainQuery;
  return requireFlag(args, "--query");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const query = readQuery(args);
  const maxResults = parsePositiveInt(readFlag(args, "--max-results"), 5);
  if (maxResults > 50) throw new Error("--max-results debe estar entre 1 y 50.");
  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const hits = await searchVectorStore(client, requireEnv("OPENAI_VECTOR_STORE_ID"), query, maxResults);
  process.stdout.write(`${JSON.stringify({ query, hits }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(`Error de búsqueda: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
