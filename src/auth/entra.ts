import { auth } from 'express-oauth2-jwt-bearer';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Request, Response, NextFunction } from 'express';
import type { AuthProvider } from './types.js';

export function createEntraProvider(tenantId: string, tenantName: string, clientId: string): AuthProvider {
  // Entra External ID (CIAM) authority
  const authority = `https://${tenantName}.ciamlogin.com/${tenantId}/v2.0`;

  // express-oauth2-jwt-bearer works with any OIDC-compliant issuer
  const jwtCheck = auth({
    audience: clientId,
    issuerBaseURL: authority,
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

    handleProtectedResourceMetadata(req, res) {
      const resource = `${req.protocol}://${req.headers.host}`;
      res.json({
        resource,
        authorization_servers: [authority],
        bearer_methods_supported: ['header'],
        scopes_supported: ['openid', 'profile', 'email'],
      });
    },

    handleAuthServerMetadata(_req, res) {
      // Entra External ID does not support native DCR - no registration_endpoint
      res.json({
        issuer: authority,
        authorization_endpoint: `https://${tenantName}.ciamlogin.com/${tenantId}/oauth2/v2.0/authorize`,
        token_endpoint: `https://${tenantName}.ciamlogin.com/${tenantId}/oauth2/v2.0/token`,
        jwks_uri: `https://${tenantName}.ciamlogin.com/${tenantId}/discovery/v2.0/keys`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: ['openid', 'profile', 'email'],
      });
    },
  };
}
