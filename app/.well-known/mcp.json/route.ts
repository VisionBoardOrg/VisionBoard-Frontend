export async function GET(): Promise<Response> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const doc = {
    mcpVersion: "2025-03-26",
    serverUrl: `${appUrl}/api/mcp`,
    authScheme: "bearer",
    description:
      "VisionBoard MCP Server — access workspaces, goals, tasks, documents, and AI tools.",
  };
  return Response.json(doc, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
