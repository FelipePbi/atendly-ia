import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

export const LANGGRAPH_SCHEMA = "langgraph";

export async function createPostgresGraphCheckpointer(
  connectionString: string,
): Promise<PostgresSaver> {
  const checkpointer = PostgresSaver.fromConnString(connectionString, {
    schema: LANGGRAPH_SCHEMA,
  });
  await checkpointer.setup();
  return checkpointer;
}
