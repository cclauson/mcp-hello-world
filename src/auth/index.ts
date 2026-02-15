import type { AuthProvider } from './types.js';
import { createAuth0Provider } from './auth0.js';
import { createEntraProvider } from './entra.js';

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

    default:
      throw new Error(`Unknown AUTH_PROVIDER: '${provider}'. Must be 'auth0' or 'entra'.`);
  }
}
