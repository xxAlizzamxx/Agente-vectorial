import OpenAI from "openai";

export type SearchHit = { filename: string; score: number; text: string };
type VectorSearchClient = Pick<OpenAI, "vectorStores">;

export async function searchVectorStore(client: VectorSearchClient, vectorStoreId: string, query: string, maxResults = 5): Promise<SearchHit[]> {
  const page = await client.vectorStores.search(vectorStoreId, { query, max_num_results: maxResults, rewrite_query: true });
  return page.data.map((result) => ({
    filename: result.filename,
    score: result.score,
    text: result.content.filter((part) => part.type === "text").map((part) => part.text).join("\n"),
  }));
}
