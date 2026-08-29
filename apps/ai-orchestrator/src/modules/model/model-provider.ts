import { randomUUID } from "node:crypto";

import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  isAIMessage,
  isBaseMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";

import { env, requireOpenAiEnv } from "../../config/env.js";

export interface ModelInputMessage {
  role: "assistant" | "user";
  content: string;
}

export interface ModelToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ModelToolResult {
  toolCallId: string;
  toolName: string;
  content: string;
}

export interface ModelResponse {
  id: string;
  text: string;
  toolCalls: ModelToolCall[];
  continuation: unknown;
}

export interface ModelTurn {
  response: ModelResponse;
  toolResults: ModelToolResult[];
}

export interface ModelRequest {
  instructions: string;
  messages: ModelInputMessage[];
  turns: ModelTurn[];
  tools: StructuredToolInterface[];
}

export interface ModelProvider {
  invoke(request: ModelRequest): Promise<ModelResponse>;
}

export class LangChainModelProvider implements ModelProvider {
  async invoke(request: ModelRequest): Promise<ModelResponse> {
    requireOpenAiEnv();

    const model = new ChatOpenAI({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      maxCompletionTokens: env.OPENAI_MAX_OUTPUT_TOKENS,
      maxRetries: 2,
      useResponsesApi: true,
      zdrEnabled: true,
    }).bindTools(request.tools, {
      parallel_tool_calls: false,
    });

    const response = await model.invoke(toLangChainMessages(request));
    return {
      id: response.id ?? randomUUID(),
      text: extractMessageText(response.content),
      toolCalls: (response.tool_calls ?? []).map((call) => ({
        id: call.id ?? randomUUID(),
        name: call.name,
        args: isRecord(call.args) ? call.args : {},
      })),
      continuation: response,
    };
  }
}

function toLangChainMessages(request: ModelRequest): BaseMessage[] {
  const messages: BaseMessage[] = [new SystemMessage(request.instructions)];
  messages.push(
    ...request.messages.map((message) =>
      message.role === "assistant"
        ? new AIMessage(message.content)
        : new HumanMessage(message.content),
    ),
  );

  for (const turn of request.turns) {
    messages.push(requireAssistantContinuation(turn.response.continuation));
    messages.push(
      ...turn.toolResults.map(
        (result) =>
          new ToolMessage({
            content: result.content,
            name: result.toolName,
            tool_call_id: result.toolCallId,
          }),
      ),
    );
  }

  return messages;
}

function requireAssistantContinuation(value: unknown): BaseMessage {
  if (isBaseMessage(value) && isAIMessage(value)) return value;
  throw new Error("Model continuation is invalid.");
}

function extractMessageText(content: AIMessage["content"]): string {
  if (typeof content === "string") return content.trim();

  return content
    .flatMap((block) => {
      if (typeof block === "string") return [block];
      if (isRecord(block) && typeof block.text === "string") {
        return [block.text];
      }
      return [];
    })
    .join("\n")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
