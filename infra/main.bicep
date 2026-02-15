param location string = resourceGroup().location
param containerRegistryName string
param containerAppEnvName string
param logAnalyticsWorkspaceName string
param containerAppName string = 'mcp-hello-world'

@allowed(['auth0', 'entra'])
param authProvider string

// Auth0 params (used when authProvider == 'auth0')
@secure()
param auth0Domain string = ''

@secure()
param auth0Audience string = ''

// Entra External ID params (used when authProvider == 'entra')
@secure()
param entraTenantId string = ''

param entraTenantName string = ''

@secure()
param entraClientId string = ''

// --- Log Analytics (required by Container Apps) ---

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// --- Container Registry ---

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: containerRegistryName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

// --- Container Apps Environment ---

resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerAppEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// --- Secrets and env vars (conditional on auth provider) ---

var acrSecret = {
  name: 'acr-password'
  value: containerRegistry.listCredentials().passwords[0].value
}

var auth0Secrets = authProvider == 'auth0' ? [
  { name: 'auth0-domain', value: auth0Domain }
  { name: 'auth0-audience', value: auth0Audience }
] : []

var entraSecrets = authProvider == 'entra' ? [
  { name: 'entra-tenant-id', value: entraTenantId }
  { name: 'entra-client-id', value: entraClientId }
] : []

var commonEnv = [
  { name: 'PORT', value: '3000' }
  { name: 'AUTH_PROVIDER', value: authProvider }
]

var auth0Env = authProvider == 'auth0' ? [
  { name: 'AUTH0_DOMAIN', secretRef: 'auth0-domain' }
  { name: 'AUTH0_AUDIENCE', secretRef: 'auth0-audience' }
] : []

var entraEnv = authProvider == 'entra' ? [
  { name: 'ENTRA_TENANT_ID', secretRef: 'entra-tenant-id' }
  { name: 'ENTRA_TENANT_NAME', value: entraTenantName }
  { name: 'ENTRA_CLIENT_ID', secretRef: 'entra-client-id' }
] : []

// --- Container App ---

resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          username: containerRegistry.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: concat([acrSecret], auth0Secrets, entraSecrets)
    }
    template: {
      containers: [
        {
          name: containerAppName
          image: '${containerRegistry.properties.loginServer}/${containerAppName}:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: concat(commonEnv, auth0Env, entraEnv)
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

// --- Outputs ---

output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output containerRegistryLoginServer string = containerRegistry.properties.loginServer
