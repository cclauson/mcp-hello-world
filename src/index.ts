import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createAuthProvider } from './auth/index.js';

const app = express();

// Log every incoming request before anything else
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`, {
    hasAuth: !!req.headers.authorization,
    contentType: req.headers['content-type'],
    sessionId: req.headers['mcp-session-id'] || 'none',
  });
  next();
});

app.use(express.json());

const PORT = process.env.PORT || 3000;
const authProvider = createAuthProvider();

// --- OAuth2 discovery endpoints (MCP spec) ---

// RFC 9728 - Protected Resource Metadata
// Tells MCP clients which authorization server to use
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  authProvider.handleProtectedResourceMetadata(req, res);
});

// RFC 8414 - Authorization Server Metadata
// Proxies the auth server's metadata for clients that check the MCP server directly
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  authProvider.handleAuthServerMetadata(req, res);
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

// MCP StreamableHTTP endpoint - POST (messages)
// Mounted at / because Claude sends MCP requests to the server root
app.post('/', authProvider.middleware, async (req: Request, res: Response) => {
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
app.get('/', authProvider.middleware, async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session ID' });
    return;
  }
  const { transport } = sessions.get(sessionId)!;
  await transport.handleRequest(req as any, res as any);
});

// MCP StreamableHTTP endpoint - DELETE (session termination)
app.delete('/', authProvider.middleware, async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session ID' });
    return;
  }
  const { transport } = sessions.get(sessionId)!;
  await transport.handleRequest(req as any, res as any);
});

// Log JWT validation errors with detail
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Try to decode the token payload (without verification) for debugging
  const authHeader = req.headers.authorization;
  let tokenClaims: any = null;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const parts = authHeader.slice(7).split('.');
      if (parts.length === 3) {
        tokenClaims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      }
    } catch { /* ignore decode errors */ }
  }
  console.error('Auth error:', {
    name: err.name,
    message: err.message,
    code: err.code,
    status: err.status,
    tokenClaims,
  });
  res.status(err.status || 401).json({
    error: err.message,
    code: err.code,
  });
});

app.listen(PORT, () => {
  console.log(`MCP Hello World server listening on port ${PORT}`);
});
