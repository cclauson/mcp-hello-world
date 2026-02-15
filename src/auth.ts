import { Request, Response, NextFunction } from 'express';
import { auth } from 'express-oauth2-jwt-bearer';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

// express-oauth2-jwt-bearer sets req.auth to { header, payload, token } (AuthResult).
// The MCP SDK reads req.auth expecting { token, clientId, scopes, ... } (AuthInfo).
// This bridge middleware runs after JWT validation and transforms one into the other.
function bridgeAuthToMcp(req: Request, _res: Response, next: NextFunction) {
  const auth0Auth = (req as any).auth;
  if (auth0Auth?.payload) {
    (req as any).auth = {
      token: auth0Auth.token,
      clientId: auth0Auth.payload.azp ?? auth0Auth.payload.client_id ?? auth0Auth.payload.sub ?? '',
      scopes: typeof auth0Auth.payload.scope === 'string'
        ? auth0Auth.payload.scope.split(' ')
        : [],
      expiresAt: auth0Auth.payload.exp,
      extra: { sub: auth0Auth.payload.sub, claims: auth0Auth.payload },
    } satisfies AuthInfo;
  }
  next();
}

export function createAuthMiddleware(auth0Domain: string, audience: string) {
  const jwtCheck = auth({
    audience,
    issuerBaseURL: `https://${auth0Domain}`,
    tokenSigningAlg: 'RS256',
  });

  return [jwtCheck, bridgeAuthToMcp];
}

// RFC 9728 - Protected Resource Metadata
// Tells MCP clients where to find the authorization server
export function handleProtectedResourceMetadata(req: Request, res: Response, auth0Domain: string) {
  const resource = `${req.protocol}://${req.headers.host}`;
  res.json({
    resource,
    authorization_servers: [`https://${auth0Domain}`],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid', 'profile', 'email'],
  });
}

// RFC 8414 - Authorization Server Metadata
// Proxies Auth0's metadata for clients that check the MCP server directly
export function handleAuthServerMetadata(res: Response, auth0Domain: string) {
  res.json({
    issuer: `https://${auth0Domain}/`,
    authorization_endpoint: `https://${auth0Domain}/authorize`,
    token_endpoint: `https://${auth0Domain}/oauth/token`,
    registration_endpoint: `https://${auth0Domain}/oidc/register`,
    jwks_uri: `https://${auth0Domain}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['openid', 'profile', 'email'],
  });
}
