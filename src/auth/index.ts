import type { AuthProvider } from './types.js';
import { createAuth0Provider } from './auth0.js';
import { createEntraProvider } from './entra.js';
import { createEntraProxyProvider } from './entra-proxy.js';

export type { AuthProvider } from './types.js';

export function createAuthProvider(): AuthProvider {
  const provider = process.env.AUTH_PROVIDER;

  switch (provider) {
    case 'auth0': {
      const domain = process.env.AUTH0_DOMAIN;
      const audience = process.env.AUTH0_AUDIENCE;
      if (!domain || !audience) {
        throw new Error('AUTH_PROVIDER=auth0 requires AUTH0_DOMAIN and AUTH0_AUDIENCE');
      }
      return createAuth0Provider(domain, audience);
    }

    case 'entra': {
      const tenantId = process.env.ENTRA_TENANT_ID;
      const tenantName = process.env.ENTRA_TENANT_NAME;
      const clientId = process.env.ENTRA_CLIENT_ID;
      if (!tenantId || !tenantName || !clientId) {
        throw new Error('AUTH_PROVIDER=entra requires ENTRA_TENANT_ID, ENTRA_TENANT_NAME, and ENTRA_CLIENT_ID');
      }
      return createEntraProvider(tenantId, tenantName, clientId);
    }

    case 'entra-proxy': {
      const tenantId = process.env.ENTRA_TENANT_ID;
      const clientId = process.env.ENTRA_CLIENT_ID;
      const proxyBaseUrl = process.env.PROXY_BASE_URL;
      if (!tenantId || !clientId || !proxyBaseUrl) {
        throw new Error('AUTH_PROVIDER=entra-proxy requires ENTRA_TENANT_ID, ENTRA_CLIENT_ID, and PROXY_BASE_URL');
      }
      return createEntraProxyProvider(tenantId, clientId, proxyBaseUrl);
    }

    default:
      throw new Error(`Unknown AUTH_PROVIDER: '${provider}'. Must be 'auth0', 'entra', or 'entra-proxy'.`);
  }
}
