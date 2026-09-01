import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthenticatedKeyContext } from "./auth";
import { registerReadTools } from "./tools/read-tools";
import { registerWriteTools } from "./tools/write-tools";
import { registerAiTools } from "./tools/ai-tools";

export function createMcpServer(ctx: AuthenticatedKeyContext): McpServer {
  const server = new McpServer({
    name: "visionboard",
    version: process.env.npm_package_version ?? "0.1.0",
  });

  registerReadTools(server, ctx);
  registerWriteTools(server, ctx);
  registerAiTools(server, ctx);

  return server;
}
