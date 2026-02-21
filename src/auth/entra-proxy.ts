import { auth } from 'express-oauth2-jwt-bearer';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Request, Response, NextFunction } from 'express';
import type { AuthProvider } from './types.js';

export function createEntraProxyProvider(tenantId: string, entraClientId: string, proxyBaseUrl: string): AuthProvider {
  const issuerBaseURL = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  const resource = `api://${entraClientId}`;

  const jwtCheck = auth({
    audience: resource,
    issuerBaseURL,
    tokenSigningAlg: 'RS256',
  });

  // Bridge express-oauth2-jwt-bearer's AuthResult → MCP SDK's AuthInfo
  // Entra uses 'scp' for scopes and 'azp'/'appid' for client ID
  function bridgeAuthToMcp(req: Request, _res: Response, next: NextFunction) {
    const entraAuth = (req as any).auth;
    if (entraAuth?.payload) {
      (req as any).auth = {
        token: entraAuth.token,
        clientId: entraAuth.payload.azp ?? entraAuth.payload.appid ?? entraAuth.payload.sub ?? '',
        scopes: typeof entraAuth.payload.scp === 'string'
          ? entraAuth.payload.scp.split(' ')
          : [],
        expiresAt: entraAuth.payload.exp,
        extra: { sub: entraAuth.payload.sub, oid: entraAuth.payload.oid, claims: entraAuth.payload },
      } satisfies AuthInfo;
    }
    next();
  }

  return {
    middleware: [jwtCheck, bridgeAuthToMcp],

    handleProtectedResourceMetadata(_req, res) {
      res.json({
        resource,
        authorization_servers: [proxyBaseUrl],
        bearer_methods_supported: ['header'],
        scopes_supported: ['openid', 'profile', 'mcp.access'],
      });
    },

    handleAuthServerMetadata(_req, res) {
      res.json({
        issuer: proxyBaseUrl,
        authorization_endpoint: `${proxyBaseUrl}/authorize`,
        token_endpoint: `${proxyBaseUrl}/oauth/token`,
        registration_endpoint: `${proxyBaseUrl}/oidc/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: ['openid', 'profile', 'mcp.access'],
      });
    },
  };
}
