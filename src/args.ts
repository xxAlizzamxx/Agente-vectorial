export function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`El argumento ${name} necesita un valor.`);
  return value;
}

export function requireFlag(args: string[], name: string): string {
  const value = readFlag(args, name)?.trim();
  if (!value) throw new Error(`Uso requerido: ${name} "valor"`);
  return value;
}
