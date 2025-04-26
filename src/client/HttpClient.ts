import {
  AgentCard,
  AgentCapabilities,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  A2ARequest,
  SendTaskRequest,
  GetTaskRequest,
  CancelTaskRequest,
  SendTaskStreamingRequest,
  TaskResubscriptionRequest,
  SetTaskPushNotificationRequest,
  GetTaskPushNotificationRequest,
  TaskSendParams,
  TaskQueryParams,
  TaskIdParams,
  TaskPushNotificationConfig,
  SendTaskResponse,
  GetTaskResponse,
  CancelTaskResponse,
  SendTaskStreamingResponse,
  SetTaskPushNotificationResponse,
  GetTaskPushNotificationResponse,
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
} from "../common/Schema";
import { A2AClient, RpcError } from "./A2AClient";

/**
 * HTTP client implementation for the A2A protocol using JSON-RPC over HTTP.
 */
export class HttpClient extends A2AClient {
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private cachedAgentCard: AgentCard | null = null;

  constructor(baseUrl: string, fetchImpl: typeof fetch = fetch) {
    super();
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    this.fetchImpl = fetchImpl;
  }

  private _generateRequestId(): string | number {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    } else {
      return Date.now();
    }
  }

  private async _makeHttpRequest<Req extends A2ARequest>(
    method: Req["method"],
    params: Req["params"],
    acceptHeader: "application/json" | "text/event-stream" = "application/json",
  ): Promise<Response> {
    const requestId = this._generateRequestId();
    const requestBody: JSONRPCRequest = {
      jsonrpc: "2.0",
      id: requestId,
      method: method,
      params: params,
    };

    try {
      const response = await this.fetchImpl(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: acceptHeader,
        },
        body: JSON.stringify(requestBody),
      });
      return response;
    } catch (networkError) {
      console.error("Network error during RPC call:", networkError);
      throw new RpcError(
        -32603,
        `Network error: ${
          networkError instanceof Error
            ? networkError.message
            : String(networkError)
        }`,
        networkError,
      );
    }
  }

  private async _handleJsonResponse<Res extends JSONRPCResponse>(
    response: Response,
    expectedMethod?: string,
  ): Promise<Res["result"] | null> {
    let responseBody: string | null = null;
    try {
      if (!response.ok) {
        responseBody = await response.text();
        let errorData: JSONRPCError | null = null;
        try {
          const parsedError = JSON.parse(responseBody) as JSONRPCResponse;
          if (parsedError.error) {
            errorData = parsedError.error;
            throw new RpcError(
              errorData.code,
              errorData.message,
              errorData.data,
            );
          }
        } catch {
          // Ignore parsing error
        }
        throw new Error(
          `HTTP error ${response.status}: ${response.statusText}${
            responseBody ? ` - ${responseBody}` : ""
          }`,
        );
      }

      responseBody = await response.text();
      const jsonResponse = JSON.parse(responseBody) as Res;

      if (
        typeof jsonResponse !== "object" ||
        jsonResponse === null ||
        jsonResponse.jsonrpc !== "2.0"
      ) {
        throw new RpcError(
          -32603,
          "Invalid JSON-RPC response structure received from server.",
        );
      }

      if (jsonResponse.error) {
        throw new RpcError(
          jsonResponse.error.code,
          jsonResponse.error.message,
          jsonResponse.error.data,
        );
      }

      return jsonResponse.result ?? null;
    } catch (error) {
      console.error(
        `Error processing RPC response for method ${
          expectedMethod || "unknown"
        }:`,
        error,
        responseBody ? `\nResponse Body: ${responseBody}` : "",
      );
      if (error instanceof RpcError) {
        throw error;
      } else {
        throw new RpcError(
          -32603,
          `Failed to process response: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error,
        );
      }
    }
  }

  private async *_handleStreamingResponse<StreamRes extends JSONRPCResponse>(
    response: Response,
    expectedMethod?: string,
  ): AsyncIterable<StreamRes["result"]> {
    if (!response.ok || !response.body) {
      let errorText: string | null = null;
      try {
        errorText = await response.text();
      } catch {
        // Ignore read error
      }
      console.error(
        `HTTP error ${response.status} received for streaming method ${
          expectedMethod || "unknown"
        }.`,
        errorText ? `Response: ${errorText}` : "",
      );
      throw new Error(
        `HTTP error ${response.status}: ${response.statusText} - Failed to establish stream.`,
      );
    }

    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.trim()) {
            console.warn(
              `SSE stream ended with partial data in buffer for method ${expectedMethod}: ${buffer}`,
            );
          }
          break;
        }

        buffer += value;
        const lines = buffer.replace(/\r/g, "").split("\n\n");
        buffer = lines.pop() || "";
        for (const message of lines) {
          if (message.startsWith("data: ")) {
            const dataLine = message.substring("data: ".length).trim();
            if (dataLine) {
              try {
                const parsedData = JSON.parse(dataLine) as StreamRes;
                if (
                  typeof parsedData !== "object" ||
                  parsedData === null ||
                  !("jsonrpc" in parsedData && parsedData.jsonrpc === "2.0")
                ) {
                  console.error(
                    `Invalid SSE data structure received for method ${expectedMethod}:`,
                    dataLine,
                  );
                  continue;
                }

                if (parsedData.error) {
                  console.error(
                    `Error received in SSE stream for method ${expectedMethod}:`,
                    parsedData.error,
                  );
                  throw new RpcError(
                    parsedData.error.code,
                    parsedData.error.message,
                    parsedData.error.data,
                  );
                } else if (parsedData.result !== undefined) {
                  if (parsedData.result !== undefined) {
                    yield parsedData.result as StreamRes["result"];
                  }
                } else {
                  console.warn(
                    `SSE data for ${expectedMethod} has neither result nor error:`,
                    parsedData,
                  );
                }
              } catch (e) {
                console.error(
                  `Failed to parse SSE data line for method ${expectedMethod}:`,
                  dataLine,
                  e,
                );
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(
        `Error reading SSE stream for method ${expectedMethod}:`,
        error,
      );
      throw error;
    } finally {
      reader.releaseLock();
      console.log(`SSE stream finished for method ${expectedMethod}.`);
    }
  }

  async agentCard(): Promise<AgentCard> {
    if (this.cachedAgentCard) {
      return this.cachedAgentCard;
    }

    const cardUrl = `${this.baseUrl}/agent-card`;

    try {
      const response = await this.fetchImpl(cardUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `HTTP error ${response.status} fetching agent card from ${cardUrl}: ${response.statusText}`,
        );
      }

      const card = await response.json();
      this.cachedAgentCard = card as AgentCard;
      return this.cachedAgentCard;
    } catch (error) {
      console.error("Failed to fetch or parse agent card:", error);
      throw new RpcError(
        -32603,
        `Could not retrieve agent card: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error,
      );
    }
  }

  async sendTask(params: TaskSendParams): Promise<Task | null> {
    const httpResponse = await this._makeHttpRequest<SendTaskRequest>(
      "tasks/send",
      params,
    );
    const result = await this._handleJsonResponse<SendTaskResponse>(
      httpResponse,
      "tasks/send",
    );
    return result ?? null;
  }

  sendTaskSubscribe(
    params: TaskSendParams,
  ): AsyncIterable<TaskStatusUpdateEvent | TaskArtifactUpdateEvent> {
    const streamGenerator = async function* (
      this: HttpClient,
    ): AsyncIterable<TaskStatusUpdateEvent | TaskArtifactUpdateEvent> {
      const httpResponse =
        await this._makeHttpRequest<SendTaskStreamingRequest>(
          "tasks/sendSubscribe",
          params,
          "text/event-stream",
        );
      const iterable = this._handleStreamingResponse<SendTaskStreamingResponse>(
        httpResponse,
        "tasks/sendSubscribe",
      );
      if (iterable === undefined || iterable === null) {
        return;
      }
      for await (const item of iterable) {
        if (item !== undefined && item !== null) {
          yield item;
        }
      }
    }.bind(this)();

    return streamGenerator ?? (async function* () {})();
  }

  async getTask(params: TaskQueryParams): Promise<Task | null> {
    const httpResponse = await this._makeHttpRequest<GetTaskRequest>(
      "tasks/get",
      params,
    );
    const result = await this._handleJsonResponse<GetTaskResponse>(
      httpResponse,
      "tasks/get",
    );
    return result ?? null;
  }

  async cancelTask(params: TaskIdParams): Promise<Task | null> {
    const httpResponse = await this._makeHttpRequest<CancelTaskRequest>(
      "tasks/cancel",
      params,
    );
    const result = await this._handleJsonResponse<CancelTaskResponse>(
      httpResponse,
      "tasks/cancel",
    );
    return result ?? null;
  }

  async setTaskPushNotification(
    params: TaskPushNotificationConfig,
  ): Promise<TaskPushNotificationConfig | null> {
    const httpResponse =
      await this._makeHttpRequest<SetTaskPushNotificationRequest>(
        "tasks/pushNotification/set",
        params,
      );
    const result =
      await this._handleJsonResponse<SetTaskPushNotificationResponse>(
        httpResponse,
        "tasks/pushNotification/set",
      );
    return result ?? null;
  }

  async getTaskPushNotification(
    params: TaskIdParams,
  ): Promise<TaskPushNotificationConfig | null> {
    const httpResponse =
      await this._makeHttpRequest<GetTaskPushNotificationRequest>(
        "tasks/pushNotification/get",
        params,
      );
    const result =
      await this._handleJsonResponse<GetTaskPushNotificationResponse>(
        httpResponse,
        "tasks/pushNotification/get",
      );
    return result ?? null;
  }

  resubscribeTask(
    params: TaskQueryParams,
  ): AsyncIterable<TaskStatusUpdateEvent | TaskArtifactUpdateEvent> {
    const streamGenerator = async function* (
      this: HttpClient,
    ): AsyncIterable<TaskStatusUpdateEvent | TaskArtifactUpdateEvent> {
      const httpResponse =
        await this._makeHttpRequest<TaskResubscriptionRequest>(
          "tasks/resubscribe",
          params,
          "text/event-stream",
        );
      const iterable = this._handleStreamingResponse<SendTaskStreamingResponse>(
        httpResponse,
        "tasks/resubscribe",
      );
      if (iterable === undefined || iterable === null) {
        return;
      }
      for await (const item of iterable) {
        if (item !== undefined && item !== null) {
          yield item;
        }
      }
    }.bind(this)();

    return streamGenerator ?? (async function* () {})();
  }

  async supports(
    capability: "streaming" | "pushNotifications",
  ): Promise<boolean> {
    try {
      const card = await this.agentCard();
      switch (capability) {
        case "streaming":
          return !!card.capabilities?.streaming;
        case "pushNotifications":
          return !!card.capabilities?.pushNotifications;
        default:
          return false;
      }
    } catch (error) {
      console.error(
        `Failed to determine support for capability '${capability}':`,
        error,
      );
      return false;
    }
  }
}
