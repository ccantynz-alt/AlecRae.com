/**
 * Microsoft To Do provider — Microsoft Graph API.
 * Docs: https://learn.microsoft.com/en-us/graph/api/todotasklist-post-tasks
 */

import {
  priorityToGraphImportance,
  type TodoProject,
  type TodoProvider,
  type TodoTaskInput,
  type TodoTaskResult,
} from "../provider.js";

interface GraphTaskResponse {
  id: string;
}

interface GraphListsResponse {
  value: { id: string; displayName: string }[];
}

export class MicrosoftTodoProvider implements TodoProvider {
  public readonly name = "microsoft_todo" as const;
  public readonly authType = "oauth" as const;

  private readonly accessToken: string;
  private readonly listId: string;
  private readonly base = "https://graph.microsoft.com/v1.0";

  public constructor(accessToken: string, listId: string) {
    if (accessToken.length === 0) throw new Error("ms_todo_access_token_required");
    if (listId.length === 0) throw new Error("ms_todo_list_id_required");
    this.accessToken = accessToken;
    this.listId = listId;
  }

  public async createTask(input: TodoTaskInput): Promise<TodoTaskResult> {
    const body: Record<string, unknown> = {
      title: input.title,
      importance: priorityToGraphImportance(input.priority),
    };
    const content = this.buildBody(input);
    if (content !== undefined) {
      body["body"] = { content, contentType: "text" };
    }
    if (input.dueDate !== undefined) {
      body["dueDateTime"] = {
        dateTime: input.dueDate.toISOString(),
        timeZone: "UTC",
      };
    }
    if (input.tags !== undefined && input.tags.length > 0) {
      body["categories"] = [...input.tags];
    }

    try {
      const res = await fetch(`${this.base}/me/todo/lists/${encodeURIComponent(this.listId)}/tasks`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: `ms_todo_${res.status}: ${text}` };
      }
      const json = (await res.json()) as GraphTaskResponse;
      return {
        success: true,
        taskId: json.id,
        taskUrl: `https://to-do.live.com/tasks/id/${encodeURIComponent(json.id)}/details`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "ms_todo_request_failed",
      };
    }
  }

  public async listProjects(): Promise<readonly TodoProject[]> {
    const res = await fetch(`${this.base}/me/todo/lists`, {
      headers: { "Authorization": `Bearer ${this.accessToken}` },
    });
    if (!res.ok) throw new Error(`ms_todo_list_lists_${res.status}`);
    const json = (await res.json()) as GraphListsResponse;
    return json.value.map((l) => ({ id: l.id, name: l.displayName }));
  }

  private buildBody(input: TodoTaskInput): string | undefined {
    const parts: string[] = [];
    if (input.notes !== undefined) parts.push(input.notes);
    if (input.sourceEmailLink !== undefined) parts.push(`Source email: ${input.sourceEmailLink}`);
    return parts.length > 0 ? parts.join("\n\n") : undefined;
  }
}
