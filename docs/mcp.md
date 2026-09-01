# VisionBoard MCP Server

VisionBoard exposes a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server at `/api/mcp`. Any MCP-compatible AI client — Kiro, Claude.ai, Cursor, or a custom agent — can connect to it and interact with your workspaces, goals, tasks, documents, and AI tools programmatically.

---

## Quick Start

### 1. Generate an API key

Go to **Account Settings → API Keys** and click **Generate New Key**. Give it a descriptive label (e.g. "My Kiro Agent"). Copy the key — it's shown only once.

Your key looks like:
```
vsn_live_a3f8c2d1e4b7f9a0c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5
```

### 2. Discover the server

The server publishes a discovery document at:
```
GET /.well-known/mcp.json
```

Example response:
```json
{
  "mcpVersion": "2025-03-26",
  "serverUrl": "https://your-domain.com/api/mcp",
  "authScheme": "bearer",
  "description": "VisionBoard MCP Server — access workspaces, goals, tasks, documents, and AI tools."
}
```

### 3. Configure your MCP client

#### Kiro (IDE)
Add to your MCP server configuration:
```json
{
  "mcpServers": {
    "visionboard": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer vsn_live_YOUR_KEY_HERE"
      }
    }
  }
}
```

#### Claude.ai / Claude Desktop
In `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "visionboard": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-client-http"],
      "env": {
        "MCP_SERVER_URL": "https://your-domain.com/api/mcp",
        "MCP_AUTH_TOKEN": "vsn_live_YOUR_KEY_HERE"
      }
    }
  }
}
```

#### Cursor
In Cursor settings → MCP → Add Server:
- **URL**: `https://your-domain.com/api/mcp`
- **Auth**: Bearer `vsn_live_YOUR_KEY_HERE`

#### OpenAI Codex (CLI, IDE extension, desktop app)

Codex uses TOML, not JSON. The CLI, IDE extension, and ChatGPT desktop app all share a single config file at `~/.codex/config.toml` — you configure it once and it works everywhere.

**Step 1** — store your API key in an environment variable (add to `~/.zshrc` or `~/.bashrc`):
```bash
export VISIONBOARD_API_KEY="vsn_live_YOUR_KEY_HERE"
```

**Step 2** — add a `[mcp_servers.visionboard]` table to `~/.codex/config.toml`:
```toml
[mcp_servers.visionboard]
url = "https://your-domain.com/api/mcp"
bearer_token_env_var = "VISIONBOARD_API_KEY"
```

For local development, use `http://localhost:3000/api/mcp` as the URL.

**Or use the CLI to add it in one command:**
```bash
codex mcp add visionboard \
  --url https://your-domain.com/api/mcp \
  --bearer-token-env-var VISIONBOARD_API_KEY
```

**Verify the connection:**
```bash
codex mcp list
```

Inside the Codex TUI, type `/mcp` to see connected servers and the tools each one exposes.

> **Note:** The config key must be `mcp_servers` with an underscore — `mcp.servers` is silently ignored by Codex. Tokens should always go in an environment variable via `bearer_token_env_var`, not hardcoded in the file.

#### curl (manual testing)
```bash
curl -X POST https://your-domain.com/api/mcp \
  -H "Authorization: Bearer vsn_live_YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## Authentication

Every request to `/api/mcp` must include:
```
Authorization: Bearer vsn_live_<your_key>
```

Keys can be revoked at any time from Account Settings. A revoked key returns HTTP 401 immediately. There is no OAuth flow — API keys are the only authentication method.

---

## Available Tools

### Read Tools

#### `list_workspaces`
Returns all workspaces you are a member of.

```
Input:  (none)
Output: [{ id, name, slug, role }]
```

#### `list_goals`
Returns up to 100 goals in a workspace, ordered newest first.

```
Input:  { workspaceId: string }
Output: [{ id, title, objective, status, healthScore, targetDate, milestoneCount, activeTaskCount }]
```

#### `list_tasks`
Returns up to 500 tasks, optionally filtered by milestone or status.

```
Input:  { workspaceId: string, milestoneId?: string, status?: "todo"|"in_progress"|"in_review"|"blocked"|"done" }
Output: [{ id, title, status, priority, assigneeId, dueDate, blockedReason }]
```

#### `list_documents`
Returns document metadata paginated (no content blob).

```
Input:  { workspaceId: string, page?: number, limit?: number }  (default: page=1, limit=20, max 50)
Output: { documents: [{ id, title, authorId, createdAt, updatedAt, ... }], total, page, limit }
```

#### `search_workspace`
Semantic search across all workspace content (goals, tasks, documents, comments).

```
Input:  { workspaceId: string, query: string }  (query must be ≥ 2 chars)
Output: [{ title, snippet, entityType, entityId, url }]
```

---

### Write Tools

Write tools require the appropriate workspace role:

| Tool | Minimum role |
|---|---|
| `create_goal` | pm, admin, owner |
| `create_task` | eng, pm, admin, owner |
| `update_task_status` | eng, pm, admin, owner |
| `create_document` | any member |

#### `create_goal`
```
Input:  { workspaceId, title (max 255), objective, targetDate?: ISO string, keyResults?: [{title, target, unit}] }
Output: { id, title }
```

#### `create_task`
```
Input:  { workspaceId, milestoneId, title (max 255), priority?: "low"|"medium"|"high"|"urgent", assigneeId?: string, dueDate?: ISO string }
Output: { id, title }
```

#### `update_task_status`
```
Input:  { workspaceId, taskId, status: "todo"|"in_progress"|"in_review"|"blocked"|"done" }
Output: { id, title, status }
```

#### `create_document`
Creates a document and triggers background semantic indexing.
```
Input:  { workspaceId, title (max 255), content?: object }
Output: { id, title }
```

---

### AI Tools

AI tools consume one credit from your monthly AI allowance per call. Credits are refunded if the model returns an empty response.

#### `generate_roadmap`
Generates a structured goal + milestone plan from a free-text description.
```
Input:  { workspaceId, description: string (max 2000 chars) }
Output: { goalTitle, goalObjective, milestones: [{ title, description, targetDate, dependsOn, suggestedTasks }] }
```

#### `deconstruct_goal`
Breaks an objective into milestones, tasks, timelines, risks, and recommendations.
```
Input:  { workspaceId, objective: string (max 2000), keyResults?: string[] }
Output: { milestones, suggestedTimeline, risks, recommendation }
```

#### `copilot_chat`
RAG-powered Q&A grounded in your workspace knowledge base.
```
Input:  { workspaceId, message: string (max 3000) }
Output: { text, citations: [{ entityType, entityId, title, snippet, url }] }
```

#### `executive_summary`
Generates an executive status briefing for the workspace.
```
Input:  { workspaceId }
Output: { summary: string (markdown), generatedAt }
```

#### `standup_digest`
Generates a daily standup digest (completed / in-flight / blocked).
```
Input:  { workspaceId }
Output: { standup: string (markdown), generatedAt }
```

---

## Rate Limits

| Limit | Window | Scope |
|---|---|---|
| 60 requests | 15 minutes | per API key (all tools) |
| 10 AI tool calls | 15 minutes | per API key (AI tools only) |

When exceeded, the server returns an MCP error with code `-32429` and a `Retry-After` header indicating seconds until reset.

---

## Plan Limits

AI tools respect your account's monthly AI credit allowance:

| Plan | AI credits / month |
|---|---|
| Free | 10 |
| Startup | 100 |
| Growth | Unlimited |
| Enterprise | Unlimited |

Write tools also enforce document count and storage limits per your plan.

---

## Error Reference

| Code | Meaning |
|---|---|
| HTTP 401 | Missing, invalid, revoked, or expired API key |
| HTTP 403 | Valid key but no workspace memberships |
| `-32601` | Tool name not recognised |
| `-32602` | Invalid input (e.g. title too long, query too short, invalid status value) |
| `-32603` | Internal error or access denied (e.g. workspace not found, task not in workspace) |
| `-32429` | Rate limit exceeded — check `Retry-After` header |

---

## Managing API Keys

From **Account Settings → API Keys** you can:

- **Generate** up to 10 active keys, each with a custom label
- **See last used time** to identify stale keys
- **Revoke** any key immediately — takes effect on the next request

Keys have no expiry by default. Rotate them periodically as a security best practice.

---

## Security Notes

- API keys are stored as SHA-256 hashes — VisionBoard never stores the raw key
- The raw key is shown exactly once at creation time; copy it before closing the modal
- Each API key is scoped to your user account and its associated workspace memberships
- Keys do not grant access to workspaces you are not a member of
- All AI tool inputs and outputs are logged (as SHA-256 hashes) for audit purposes
