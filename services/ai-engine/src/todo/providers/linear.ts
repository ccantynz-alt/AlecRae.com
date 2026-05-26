/**
 * Linear provider — GraphQL API.
 * Docs: https://developers.linear.app/docs/graphql/working-with-the-graphql-api
 */

import {
  priorityToLinearLevel,
  type TodoProject,
  type TodoProvider,
  type TodoTaskInput,
  type TodoTaskResult,
} from "../provider.js";

interface LinearGraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

interface CreateIssueData {
  issueCreate: {
    success: boolean;
    issue: { id: string; identifier: string; url: string } | null;
  };
}

interface TeamsData {
  teams: { nodes: { id: string; name: string }[] };
}

export class LinearProvider implements TodoProvider {
  public readonly name = "linear" as const;
  public readonly authType = "api_key" as const;

  private readonly apiKey: string;
  private readonly teamId: string;
  private readonly endpoint = "https://api.linear.app/graphql";

  public constructor(apiKey: string, teamId: string) {
    if (apiKey.length === 0) throw new Error("linear_api_key_required");
    if (teamId.length === 0) throw new Error("linear_team_id_required");
    this.apiKey = apiKey;
    this.teamId = teamId;
  }

  public async createTask(input: TodoTaskInput): Promise<TodoTaskResult> {
    const mutation = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url }
        }
      }
    `;
    const issueInput: Record<string, unknown> = {
      teamId: this.teamId,
      title: input.title,
      priority: priorityToLinearLevel(input.priority),
    };
    const description = this.buildDescription(input);
    if (description !== undefined) issueInput["description"] = description;
    if (input.dueDate !== undefined) {
      issueInput["dueDate"] = input.dueDate.toISOString().slice(0, 10);
    }
    if (input.projectId !== undefined) issueInput["projectId"] = input.projectId;
    if (input.tags !== undefined && input.tags.length > 0) {
      issueInput["labelIds"] = [...input.tags];
    }

    try {
      const res = await this.gql<CreateIssueData>(mutation, { input: issueInput });
      if (res.errors !== undefined && res.errors.length > 0) {
        return { success: false, error: `linear_${res.errors.map((e) => e.message).join("; ")}` };
      }
      const created = res.data?.issueCreate;
      if (created === undefined || !created.success || created.issue === null) {
        return { success: false, error: "linear_create_failed" };
      }
      return { success: true, taskId: created.issue.id, taskUrl: created.issue.url };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "linear_request_failed",
      };
    }
  }

  public async listProjects(): Promise<readonly TodoProject[]> {
    const query = `query { teams { nodes { id name } } }`;
    const res = await this.gql<TeamsData>(query, {});
    if (res.data === undefined) throw new Error("linear_list_projects_failed");
    return res.data.teams.nodes.map((t) => ({ id: t.id, name: t.name }));
  }

  private async gql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<LinearGraphQLResponse<T>> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Authorization": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`linear_http_${res.status}: ${text}`);
    }
    return (await res.json()) as LinearGraphQLResponse<T>;
  }

  private buildDescription(input: TodoTaskInput): string | undefined {
    const parts: string[] = [];
    if (input.notes !== undefined) parts.push(input.notes);
    if (input.sourceEmailLink !== undefined) parts.push(`Source email: ${input.sourceEmailLink}`);
    return parts.length > 0 ? parts.join("\n\n") : undefined;
  }
}
