import "dotenv/config";

export function requireEnv(name: "OPENAI_API_KEY" | "OPENAI_VECTOR_STORE_ID"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}. Copia .env.example a .env y completa esa variable.`);
  if (value === "sk-..." || value === "vs_...") throw new Error(`Completa ${name} con un valor real en .env.`);
  if (name === "OPENAI_API_KEY" && !value.startsWith("sk-")) throw new Error("OPENAI_API_KEY debe empezar por sk-.");
  if (name === "OPENAI_VECTOR_STORE_ID" && !value.startsWith("vs_")) throw new Error("OPENAI_VECTOR_STORE_ID debe empezar por vs_.");
  return value;
}

export function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`Se esperaba un entero positivo: ${value}`);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Se esperaba un entero positivo: ${value}`);
  return parsed;
}
