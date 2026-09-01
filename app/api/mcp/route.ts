import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { apiKeyAuth } from "@/lib/mcp/auth";
import { mcpRateLimit } from "@/lib/mcp/rate-limit";
import { createMcpServer } from "@/lib/mcp/server";

// Required: Prisma + Node.js crypto (SHA-256)
export const runtime = "nodejs";

/**
 * Builds a Node.js-style IncomingMessage-like object from a NextRequest.
 * The StreamableHTTPServerTransport expects req.method, req.headers, and
 * an optional req.auth field. It does NOT read the body from req directly
 * when parsedBody is supplied, so we only need method and headers here.
 */
function buildNodeReq(request: NextRequest): Record<string, unknown> {
  // Convert Headers (Web API) → plain object (Node.js style)
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    method: request.method,
    headers,
    // auth is not set here — auth is handled by apiKeyAuth above the transport
  };
}

/**
 * Builds a Node.js-style ServerResponse-like object backed by a
 * TransformStream. The transport calls writeHead/write/end/flushHeaders
 * on this object; we capture the status, headers, and body chunks and
 * resolve them into a Web API Response after the transport finishes.
 */
function buildNodeRes(): {
  res: Record<string, unknown>;
  getResponse: () => Response;
} {
  let statusCode = 200;
  const responseHeaders: Record<string, string> = {};
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  let isSSE = false;

  // TransformStream for streaming SSE responses
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const readableStream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const eventListeners: Record<string, (() => void)[]> = {};

  const res: Record<string, unknown> = {
    writeHead(code: number, headers?: Record<string, string>) {
      statusCode = code;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          responseHeaders[k.toLowerCase()] = v;
        }
      }
      // Check for SSE
      if (
        responseHeaders["content-type"]?.includes("text/event-stream")
      ) {
        isSSE = true;
      }
      return res;
    },
    flushHeaders() {
      // No-op in our implementation — headers are sent when we create the Response
    },
    write(chunk: string | Uint8Array) {
      const bytes =
        typeof chunk === "string" ? encoder.encode(chunk) : chunk;
      if (isSSE && controller) {
        controller.enqueue(bytes);
      } else {
        chunks.push(bytes);
      }
      return true;
    },
    end(chunk?: string | Uint8Array) {
      if (chunk !== undefined) {
        const bytes =
          typeof chunk === "string" ? encoder.encode(chunk) : chunk;
        if (isSSE && controller) {
          controller.enqueue(bytes);
        } else {
          chunks.push(bytes);
        }
      }
      if (controller) {
        controller.close();
      }
    },
    on(event: string, listener: () => void) {
      if (!eventListeners[event]) {
        eventListeners[event] = [];
      }
      eventListeners[event].push(listener);
      return res;
    },
    // Called by the SDK's SSE code when the connection is closed on the client side.
    // In Next.js serverless we don't have long-lived connections so this is a no-op.
    socket: null,
  };

  function getResponse(): Response {
    if (isSSE) {
      return new Response(readableStream, {
        status: statusCode,
        headers: responseHeaders,
      });
    }

    // Non-SSE: assemble buffered body
    const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new Response(body, {
      status: statusCode,
      headers: responseHeaders,
    });
  }

  return { res, getResponse };
}

export async function POST(request: NextRequest): Promise<Response> {
  // Step 1: Authenticate via API key
  const ctx = await apiKeyAuth(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Step 2: Ensure user has at least one workspace
  if (ctx.workspaceIds.length === 0) {
    return NextResponse.json(
      { error: "No accessible workspaces" },
      { status: 403 }
    );
  }

  // Step 3: General rate limit (60 req / 15 min per API key)
  const rateCheck = await mcpRateLimit(ctx.apiKeyId, "general", request);
  if (!rateCheck.allowed) {
    return new Response(JSON.stringify(rateCheck.mcpErrorResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(rateCheck.resetSec),
      },
    });
  }

  // Step 4: Parse request body
  const body = await request.json();

  // Step 5: Create stateless transport (new per request)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  // Step 6: Create MCP server with authenticated context injected
  const server = createMcpServer(ctx);

  // Step 7: Connect server to transport
  await server.connect(transport);

  // Step 8: Build Node.js-style bridge objects
  const nodeReq = buildNodeReq(request);
  const { res: nodeRes, getResponse } = buildNodeRes();

  // Step 9: Delegate to transport — pass pre-parsed body to avoid re-reading the stream.
  // The SDK expects Node.js IncomingMessage/ServerResponse shapes; we provide duck-typed
  // bridge objects that satisfy the subset the transport actually uses.
  await transport.handleRequest(
    nodeReq as unknown as Parameters<typeof transport.handleRequest>[0],
    nodeRes as unknown as Parameters<typeof transport.handleRequest>[1],
    body
  );

  // Step 10: Return the captured response
  return getResponse();
}
