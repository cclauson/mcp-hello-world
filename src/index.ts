import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createAuthMiddleware, handleProtectedResourceMetadata, handleAuthServerMetadata } from './auth.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN!;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE!;

// --- OAuth2 discovery endpoints (MCP spec) ---

// RFC 9728 - Protected Resource Metadata
// Tells MCP clients which authorization server to use
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  handleProtectedResourceMetadata(req, res, AUTH0_DOMAIN);
});

// RFC 8414 - Authorization Server Metadata (proxied to Auth0)
// Fallback for clients that check the MCP server directly
app.get('/.well-known/oauth-authorization-server', (_req, res) => {
  handleAuthServerMetadata(res, AUTH0_DOMAIN);
});

// --- Health check ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// --- MCP server setup ---

const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'mcp-hello-world',
    version: '1.0.0',
  });

  server.tool(
    'hello',
    'Says hello to someone',
    { name: z.string().describe('Name to greet') },
    async ({ name }) => ({
      content: [{ type: 'text', text: `Hello, ${name}! This is a response from the MCP Hello World server.` }],
    }),
  );

  return server;
}

const authMiddleware = createAuthMiddleware(AUTH0_DOMAIN, AUTH0_AUDIENCE);

// MCP StreamableHTTP endpoint - POST (messages)
app.post('/mcp', authMiddleware, async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  // Existing session
  if (sessionId && sessions.has(sessionId)) {
    const { transport } = sessions.get(sessionId)!;
    await transport.handleRequest(req as any, res as any, req.body);
    return;
  }

  // New session - must be an initialize request
  if (sessionId || !isInitializeRequest(req.body)) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Bad request: expected initialize request without session ID' },
      id: req.body?.id ?? null,
    });
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  const server = createMcpServer();

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) sessions.delete(sid);
  };

  await server.connect(transport);

  if (transport.sessionId) {
    sessions.set(transport.sessionId, { transport, server });
  }

  await transport.handleRequest(req as any, res as any, req.body);
});

// MCP StreamableHTTP endpoint - GET (SSE stream for server-to-client notifications)
app.get('/mcp', authMiddleware, async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session ID' });
    return;
  }
  const { transport } = sessions.get(sessionId)!;
  await transport.handleRequest(req as any, res as any);
});

// MCP StreamableHTTP endpoint - DELETE (session termination)
app.delete('/mcp', authMiddleware, async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session ID' });
    return;
  }
  const { transport } = sessions.get(sessionId)!;
  await transport.handleRequest(req as any, res as any);
});

app.listen(PORT, () => {
  console.log(`MCP Hello World server listening on port ${PORT}`);
});
