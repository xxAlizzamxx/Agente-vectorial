# Agente de búsqueda vectorial con Codex

TypeScript + OpenAI Vector Stores + Codex SDK.

## Arquitectura

`pregunta → Codex (loop/harness) → npm run search → Vector Store → fragmentos → respuesta citada`

## Conceptos

- **Agente:** modelo que persigue un objetivo y usa herramientas. `src/agent.ts`.
- **Búsqueda vectorial:** recupera por significado. `src/vector-search.ts` devuelve chunks y score.
- **Embedding:** vector numérico de significado; OpenAI lo crea al ingerir.
- **Vector Store:** índice de embeddings. `src/ingest.ts` lo crea.
- **Chunk:** fragmento recuperable del documento (`result.content`).
- **RAG:** recuperar evidencia y después generar con ella.
- **Tool:** capacidad externa; aquí, `npm run search`, con salida JSON.
- **Agent loop:** observar, razonar, actuar, observar y terminar. Lo aporta `thread.run(...)` de Codex; no escribimos un `while`.
- **Harness:** infraestructura de contexto, tools, sandbox, permisos, errores e hilo. Se configura al crear el thread en `src/agent.ts`.
- **Grounding:** respuesta basada en evidencia. El prompt exige citas y abstención.
- **Separación instrucción/dato:** si un documento contiene órdenes o prompts, el agente los trata como contenido recuperado, no como instrucciones. `src/prompt.ts`.

## Preparación y uso

```bash
npm install
copy .env.example .env
# añade OPENAI_API_KEY a .env
npm run ingest -- ./docs
# añade a .env el OPENAI_VECTOR_STORE_ID impreso
npm run search -- --query "¿Cuál es la política de vacaciones?"
npm run agent -- --question "¿Cuál es la política de vacaciones?"
```

`--max-results` no limita la cantidad de preguntas. Solo controla cuantos fragmentos recupera el buscador para una pregunta individual. Puedes hacer 60 preguntas o mas; cada pregunta ejecuta una busqueda nueva. La API acepta de 1 a 50 resultados por busqueda, y el agente usa 5 por defecto para mantener respuestas cortas y citables.

## De dónde salen las variables

`OPENAI_API_KEY` sale del dashboard de OpenAI: crea una API key en el proyecto que vas a usar y pegala en `.env`. No la subas a Git ni la pegues en el código.

`OPENAI_VECTOR_STORE_ID` lo crea este proyecto. Antes de la primera ingesta dejalo vacio en `.env`. Primero pon documentos en una carpeta, por ejemplo `docs/`, y ejecuta `npm run ingest -- ./docs`. El comando imprime algo como `OPENAI_VECTOR_STORE_ID=vs_...`; copia ese valor al `.env`.

`CODEX_MODEL` es opcional. Puedes dejarlo vacío para usar el modelo por defecto del SDK. Solo llénalo si quieres forzar un modelo específico disponible en tu cuenta.

La carpeta `docs/` ya esta creada. Coloca ahi los documentos que quieres que el agente consulte. El archivo `.gitkeep` solo permite versionar la carpeta vacia y la ingesta lo ignora.

La primera ingesta crea el Vector Store. Despues de guardar `OPENAI_VECTOR_STORE_ID` en `.env`, las siguientes ingestas reutilizan el mismo Vector Store. Si agregas un documento, lo sube. Si modificas un documento, borra la version anterior y sube la nueva. Si eliminas un documento de `docs/`, lo quita del indice en la siguiente ingesta. Si OpenAI no permite completar alguna de esas operaciones, la ingesta falla con un error en vez de continuar con un indice desactualizado. No necesitas crear otra API key.

## Calidad

```bash
npm run check
npm test
npm run build
```

La tool separada hace observable la recuperación. `.env` queda fuera de Git, el agente corre en solo lectura, cita archivos y se abstiene sin evidencia. Para producción agregaría lotes, metadatos, actualización/borrado y evaluaciones.

Docs: [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [File search](https://developers.openai.com/api/docs/guides/tools-file-search), [Vector search](https://developers.openai.com/api/reference/typescript/resources/vector_stores/methods/search).
