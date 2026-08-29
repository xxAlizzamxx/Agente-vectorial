import assert from "node:assert/strict";
import test from "node:test";
import { readFlag, requireFlag } from "../src/args.js";
import { parsePositiveInt, requireEnv } from "../src/config.js";
import { buildAgentPrompt } from "../src/prompt.js";
import { readQuery } from "../src/search.js";

test("lee argumentos y valida valores faltantes", () => {
  assert.equal(readFlag(["--query", "vacaciones"], "--query"), "vacaciones");
  assert.throws(() => requireFlag([], "--query"), /Uso requerido/);
  assert.throws(() => readFlag(["--query", "--otro"], "--query"), /necesita un valor/);
});

test("el prompt obliga a buscar, citar y abstenerse", () => {
  const prompt = buildAgentPrompt("¿Cuál es la política?");
  assert.match(prompt, /npm run search -- --query-b64/);
  assert.match(prompt, /Cita cada afirmacion/);
  assert.match(prompt, /contenido citado/);
  assert.match(prompt, /No encontre evidencia suficiente/);
  assert.match(prompt, /pregunta esta fuera del tema/);
});

test("acepta preguntas codificadas para evitar problemas de shell", () => {
  const encoded = Buffer.from('¿Qué dice "RRHH" sobre vacaciones?', "utf8").toString("base64");
  assert.equal(readQuery(["--query-b64", encoded]), '¿Qué dice "RRHH" sobre vacaciones?');
  assert.throws(() => readQuery(["--query", "uno", "--query-b64", encoded]), /no ambos/);
  assert.throws(() => readQuery(["--query-b64", ""]), /necesita un valor/);
  assert.throws(() => readQuery(["--query-b64", "no-es-base64"]), /Base64 valido/);
});

test("valida configuracion antes de llamar APIs externas", () => {
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousVectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;
  try {
    process.env.OPENAI_API_KEY = "sk-...";
    process.env.OPENAI_VECTOR_STORE_ID = "abc";
    assert.throws(() => requireEnv("OPENAI_API_KEY"), /valor real/);
    assert.throws(() => requireEnv("OPENAI_VECTOR_STORE_ID"), /debe empezar/);
    assert.equal(parsePositiveInt(undefined, 5), 5);
    assert.equal(parsePositiveInt("12", 5), 12);
    assert.throws(() => parsePositiveInt("0", 5), /entero positivo/);
    assert.throws(() => parsePositiveInt("5abc", 5), /entero positivo/);
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
    if (previousVectorStoreId === undefined) delete process.env.OPENAI_VECTOR_STORE_ID;
    else process.env.OPENAI_VECTOR_STORE_ID = previousVectorStoreId;
  }
});
