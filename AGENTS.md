<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:websocket-scaling-rules -->
## WebSocket / Real-time Presence — Scaling Constraint

The live-cursor and board-event WebSocket layer (`hooks/useWebSocket.ts`, `store/cursor-store.ts`)
connects to a stateful WebSocket server. **This does not work on Vercel Functions / Edge Runtime**
because serverless invocations cannot hold persistent TCP connections.

### Current state
- Works correctly in development and on single-instance servers (Railway, Fly.io, Docker).
- On multi-instance deployments, clients on different instances cannot exchange messages —
  presence state is silently isolated per replica.

### Required before horizontal scaling
Replace the custom WebSocket server with a managed real-time service. Recommended options:

| Option | Notes |
|--------|-------|
| **Liveblocks** | Drop-in presence + storage; React hooks available |
| **Ably**       | Channels + presence; Edge-compatible |
| **PartyKit**   | Next.js-native; handles presence natively |
| **Soketi**     | Self-hosted Pusher-compatible; needs a persistent process |

Until one of the above is wired in, do **not** add features that depend on cross-instance
WebSocket delivery working correctly in production.
<!-- END:websocket-scaling-rules -->
