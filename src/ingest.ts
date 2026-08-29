import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import OpenAI from "openai";
import { requireEnv } from "./config.js";

const SUPPORTED = new Set([".txt", ".md", ".pdf", ".docx", ".html", ".json"]);
const STATE_DIR = ".agente-vectorial";
const MANIFEST_PATH = path.join(STATE_DIR, "ingested-files.json");

type ManifestEntry = {
  size: number;
  mtimeMs: number;
  openaiFileId: string;
  vectorStoreFileId: string;
  uploadedAt: string;
};

type Manifest = Record<string, ManifestEntry>;

function isNodeError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "status" in error && error.status === 404);
}

async function collect(inputPath: string): Promise<string[]> {
  const info = await stat(inputPath);
  if (info.isFile()) return [inputPath];
  if (!info.isDirectory()) throw new Error("La ruta no es un archivo ni un directorio.");
  const entries = await readdir(inputPath, { withFileTypes: true });
  const nested = await Promise.all(entries.filter((e) => !e.name.startsWith(".")).map((e) => collect(path.join(inputPath, e.name))));
  return nested.flat();
}

async function loadManifest(): Promise<Manifest> {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as Manifest;
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) return {};
    throw error;
  }
}

async function saveManifest(manifest: Manifest): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function getOrCreateVectorStoreId(client: OpenAI): Promise<string> {
  const existingId = process.env.OPENAI_VECTOR_STORE_ID?.trim();
  if (existingId) {
    if (existingId === "vs_...") throw new Error("Completa OPENAI_VECTOR_STORE_ID con un valor real en .env o dejalo vacio para crear uno nuevo.");
    if (!existingId.startsWith("vs_")) throw new Error("OPENAI_VECTOR_STORE_ID debe empezar por vs_.");
    const store = await client.vectorStores.retrieve(existingId);
    console.log(`Usando Vector Store existente: ${store.id}`);
    return store.id;
  }

  const store = await client.vectorStores.create({ name: "Agente vectorial - documentos" });
  console.log(`Vector Store creado: ${store.id}`);
  console.log(`\nGuarda esto en .env:\nOPENAI_VECTOR_STORE_ID=${store.id}\n`);
  return store.id;
}

function manifestKey(filePath: string): string {
  return path.relative(process.cwd(), filePath).replaceAll("\\", "/");
}

function isIngestedFromInput(key: string, inputPath: string, inputIsDirectory: boolean): boolean {
  const inputKey = manifestKey(inputPath);
  if (!inputIsDirectory) return key === inputKey;
  return key === inputKey || key.startsWith(`${inputKey}/`);
}

async function removePreviousVersion(client: OpenAI, vectorStoreId: string, previous: ManifestEntry, fileName: string): Promise<void> {
  try {
    await client.vectorStores.files.delete(previous.vectorStoreFileId, { vector_store_id: vectorStoreId });
  } catch (error: unknown) {
    if (!isNotFoundError(error)) throw error;
  }

  try {
    await client.files.delete(previous.openaiFileId);
  } catch (error: unknown) {
    if (!isNotFoundError(error)) throw error;
  }
}

async function removeDeletedFiles(client: OpenAI, vectorStoreId: string, manifest: Manifest, inputPath: string, inputIsDirectory: boolean, currentKeys: Set<string>): Promise<number> {
  let deletedCount = 0;
  for (const [key, entry] of Object.entries(manifest)) {
    if (!isIngestedFromInput(key, inputPath, inputIsDirectory) || currentKeys.has(key)) continue;
    await removePreviousVersion(client, vectorStoreId, entry, key);
    delete manifest[key];
    deletedCount += 1;
    console.log(`DEL ${key} (ya no existe en docs)`);
  }
  return deletedCount;
}

async function main(): Promise<void> {
  const inputPath = path.resolve(process.argv[2] ?? "docs");
  const inputInfo = await stat(inputPath).catch((error: unknown) => {
    if (isNodeError(error, "ENOENT")) throw new Error(`No existe ${inputPath}. Crea la carpeta o usa: npm run ingest -- ./docs`);
    throw error;
  });
  const files = (await collect(inputPath)).filter((f) => SUPPORTED.has(path.extname(f).toLowerCase()));
  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const manifest = await loadManifest();
  if (files.length === 0 && Object.keys(manifest).length === 0 && !process.env.OPENAI_VECTOR_STORE_ID?.trim()) {
    throw new Error(`No hay documentos compatibles en ${inputPath}. Agrega archivos .txt, .md, .pdf, .docx, .html o .json.`);
  }
  if (Object.keys(manifest).length > 0 && !process.env.OPENAI_VECTOR_STORE_ID?.trim()) {
    throw new Error("Existe un manifiesto local de ingesta, pero OPENAI_VECTOR_STORE_ID esta vacio. Restaura el vs_... en .env o elimina .agente-vectorial/ para empezar de cero.");
  }

  const vectorStoreId = await getOrCreateVectorStoreId(client);
  const currentKeys = new Set(files.map(manifestKey));
  const deletedCount = await removeDeletedFiles(client, vectorStoreId, manifest, inputPath, inputInfo.isDirectory(), currentKeys);
  let uploadedCount = 0;
  let skippedCount = 0;

  for (const filePath of files) {
    const info = await stat(filePath);
    const key = manifestKey(filePath);
    const previous = manifest[key];
    if (previous && previous.size === info.size && previous.mtimeMs === info.mtimeMs) {
      console.log(`SKIP ${path.basename(filePath)} (sin cambios)`);
      skippedCount += 1;
      continue;
    }

    const uploaded = await client.files.create({ file: createReadStream(filePath), purpose: "assistants" });
    const vectorStoreFile = await client.vectorStores.files.createAndPoll(vectorStoreId, { file_id: uploaded.id });
    if (vectorStoreFile.status !== "completed") {
      throw new Error(`No se pudo procesar ${path.basename(filePath)}: ${vectorStoreFile.last_error?.message ?? vectorStoreFile.status}`);
    }
    if (previous) {
      try {
        await removePreviousVersion(client, vectorStoreId, previous, path.basename(filePath));
      } catch (error: unknown) {
        await removePreviousVersion(client, vectorStoreId, {
          size: info.size,
          mtimeMs: info.mtimeMs,
          openaiFileId: uploaded.id,
          vectorStoreFileId: vectorStoreFile.id,
          uploadedAt: new Date().toISOString(),
        }, path.basename(filePath));
        throw error;
      }
    }
    manifest[key] = {
      size: info.size,
      mtimeMs: info.mtimeMs,
      openaiFileId: uploaded.id,
      vectorStoreFileId: vectorStoreFile.id,
      uploadedAt: new Date().toISOString(),
    };
    await saveManifest(manifest);
    uploadedCount += 1;
    console.log(`OK ${path.basename(filePath)}`);
  }
  if (deletedCount > 0) await saveManifest(manifest);
  console.log(`\nListo. Subidos: ${uploadedCount}. Sin cambios: ${skippedCount}. Eliminados del indice: ${deletedCount}. Vector Store: ${vectorStoreId}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(`Error de ingesta: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
