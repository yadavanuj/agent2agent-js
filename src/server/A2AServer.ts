import cors, { CorsOptions } from "cors";
import * as schema from "../common/Schema";
import { TaskStore, TaskAndHistory } from "./Store";

/**
 * Options for configuring the A2AServer.
 */
export interface A2AServerOptions {
  /** Task storage implementation. Defaults to InMemoryTaskStore. */
  taskStore?: TaskStore;
  /** CORS configuration options or boolean/string. Defaults to allowing all origins. */
  cors?: CorsOptions | boolean | string;
  /** Base path for the A2A endpoint. Defaults to '/'. */
  basePath?: string;
  /** Agent Card for the agent being served. */
  card?: schema.AgentCard;
}

/**
 * Abstract base class for A2A protocol servers.
 * Subclasses should implement protocol-specific server logic.
 */
export abstract class A2AServer {
  protected taskStore: TaskStore;
  protected cors: CorsOptions | boolean | string;
  protected basePath: string;
  protected card?: schema.AgentCard;

  constructor(options: A2AServerOptions = {}) {
    if (!options.taskStore) {
      throw new Error("taskStore is required");
    }
    this.taskStore = options.taskStore;
    this.cors = options.cors ?? true;
    this.basePath = options.basePath ?? "/";
    this.card = options.card;
  }

  /**
   * Starts the server. Subclasses should implement protocol-specific startup logic.
   */
  abstract start(): Promise<void>;

  /**
   * Stops the server. Subclasses should implement protocol-specific shutdown logic.
   */
  abstract stop(): Promise<void>;

  /**
   * Processes a task with the given task ID.
   * @param taskId The ID of the task to process.
   */
  abstract processTask(taskId: string): Promise<void>;

  /**
   * Handles an incoming request.
   * @param request The request object.
   * @returns A response object or a promise resolving to it.
   */
  abstract handleRequest(request: unknown): Promise<unknown>;

  /**
   * Handles streaming tasks or streaming responses.
   * @param taskId The ID of the task to stream.
   */
  abstract streamTask(taskId: string): AsyncIterable<unknown>;

  /**
   * Serves the .well-known JSON metadata endpoint.
   * @returns The JSON metadata object.
   */
  abstract getWellKnownJson(): Promise<unknown>;
}
