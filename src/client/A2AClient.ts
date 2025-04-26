import {
  AgentCard,
  TaskSendParams,
  TaskQueryParams,
  TaskIdParams,
  TaskPushNotificationConfig,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
} from "../common/Schema";

// Simple error class for client-side representation of JSON-RPC errors
export class RpcError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = data;
  }
}

/**
 * Abstract base class for A2A protocol clients.
 * Defines the interface for protocol-specific client implementations.
 */
export abstract class A2AClient {
  /**
   * Retrieves the AgentCard.
   */
  abstract agentCard(): Promise<AgentCard>;

  /**
   * Sends a task request (non-streaming).
   * @param params The parameters for the tasks/send method.
   */
  abstract sendTask(params: TaskSendParams): Promise<unknown | null>;

  /**
   * Sends a task request and subscribes to streaming updates.
   * @param params The parameters for the tasks/sendSubscribe method.
   */
  abstract sendTaskSubscribe(
    params: TaskSendParams,
  ): AsyncIterable<TaskStatusUpdateEvent | TaskArtifactUpdateEvent>;

  /**
   * Retrieves the current state of a task.
   * @param params The parameters for the tasks/get method.
   */
  abstract getTask(params: TaskQueryParams): Promise<unknown | null>;

  /**
   * Cancels a currently running task.
   * @param params The parameters for the tasks/cancel method.
   */
  abstract cancelTask(params: TaskIdParams): Promise<unknown | null>;

  /**
   * Sets or updates the push notification config for a task.
   * @param params The parameters for the tasks/pushNotification/set method.
   */
  abstract setTaskPushNotification(
    params: TaskPushNotificationConfig,
  ): Promise<unknown | null>;

  /**
   * Retrieves the currently configured push notification config for a task.
   * @param params The parameters for the tasks/pushNotification/get method.
   */
  abstract getTaskPushNotification(
    params: TaskIdParams,
  ): Promise<unknown | null>;

  /**
   * Resubscribes to updates for a task after a potential connection interruption.
   * @param params The parameters for the tasks/resubscribe method.
   */
  abstract resubscribeTask(
    params: TaskQueryParams,
  ): AsyncIterable<TaskStatusUpdateEvent | TaskArtifactUpdateEvent>;

  /**
   * Optional: Checks if the server likely supports optional methods based on agent card.
   * @param capability The capability to check (e.g., 'streaming', 'pushNotifications').
   */
  abstract supports(capability: string): Promise<boolean>;
}
