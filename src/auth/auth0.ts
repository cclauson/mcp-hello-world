import { auth } from 'express-oauth2-jwt-bearer';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Request, Response, NextFunction } from 'express';
import type { AuthProvider } from './types.js';

export function createAuth0Provider(domain: string, audience: string): AuthProvider {
  const jwtCheck = auth({
    audience,
    issuerBaseURL: `https://${domain}`,
    tokenSigningAlg: 'RS256',
  });

  // Bridge express-oauth2-jwt-bearer's AuthResult → MCP SDK's AuthInfo
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

  return {
    middleware: [jwtCheck, bridgeAuthToMcp],

    handleProtectedResourceMetadata(req, res) {
      // Use x-forwarded-proto if behind a reverse proxy (e.g. Container Apps ingress)
      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      const resource = `${proto}://${req.headers.host}`;
      res.json({
        resource,
        authorization_servers: [`https://${domain}`],
        bearer_methods_supported: ['header'],
        scopes_supported: ['openid', 'profile', 'email'],
      });
    },

    handleAuthServerMetadata(_req, res) {
      res.json({
        issuer: `https://${domain}/`,
        authorization_endpoint: `https://${domain}/authorize`,
        token_endpoint: `https://${domain}/oauth/token`,
        registration_endpoint: `https://${domain}/oidc/register`,
        jwks_uri: `https://${domain}/.well-known/jwks.json`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: ['openid', 'profile', 'email'],
      });
    },
  };
}
