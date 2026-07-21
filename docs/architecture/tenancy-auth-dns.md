# Tenancy, Autenticacion y DNS

## Modelo multi-tenant

El MVP usa aislamiento logico:

- Una plataforma compartida.
- Base de datos compartida.
- Todas las entidades con `tenant_id`.
- Row Level Security en PostgreSQL.
- Logs particionados por tenant.
- Recursos AWS etiquetados por tenant.

Clientes enterprise podran usar aislamiento dedicado:

- Cuenta AWS separada.
- KMS dedicado.
- Buckets dedicados.
- Web ACLs y distribuciones dedicadas.
- Politicas de retencion especificas.

## Entidades base

```text
tenant
  id
  name
  plan
  region
  isolation_mode
  status

user
  id
  tenant_id
  email
  role
  identity_provider

domain
  id
  tenant_id
  hostname
  verification_status
  tls_status
  cloudfront_distribution_id

application
  id
  tenant_id
  domain_id
  origin_url
  status

policy
  id
  tenant_id
  application_id
  version
  status
  document
```

## Autenticacion del dashboard

El dashboard usa Cognito inicialmente.

```mermaid
sequenceDiagram
    participant User
    participant Cognito
    participant Dashboard
    participant API as FortressNet API

    User->>Dashboard: Login
    Dashboard->>Cognito: OIDC auth
    Cognito-->>Dashboard: ID token / access token
    Dashboard->>API: Request con token
    API->>API: Validar token y tenant_id
    API-->>Dashboard: Datos del tenant
```

Claims esperados:

```json
{
  "sub": "user_123",
  "email": "secops@example.com",
  "tenant_id": "tenant_acme",
  "role": "security_admin"
}
```

Roles iniciales:

- `owner`
- `admin`
- `security_admin`
- `developer`
- `viewer`
- `billing`

## SSO por tenant

Para clientes B2B:

- OIDC con Okta, Azure AD o Google Workspace.
- SAML para enterprise.
- Mapeo de grupos del IdP a roles FortressNet.

La autenticacion del dashboard es independiente de la autenticacion de usuarios finales de las aplicaciones protegidas.

## Gestion DNS

### Modo A: CNAME simple

El cliente conserva su DNS:

```text
api.customer.com CNAME tenant123.edge.fortressnet.io
```

Es el modo recomendado para el MVP.

### Modo B: Delegacion de subdominio

El cliente delega un subdominio:

```text
edge.customer.com NS ns-xxx.awsdns.com
```

FortressNet gestiona la hosted zone en Route 53.

### Modo C: DNS completo gestionado

FortressNet gestiona toda la zona DNS del cliente. Esta opcion queda para fases posteriores por el riesgo operativo.

## Flujo de onboarding de dominio

```mermaid
sequenceDiagram
    participant Admin as Tenant Admin
    participant FN as FortressNet
    participant DNS as DNS Provider
    participant AWS

    Admin->>FN: Crear dominio
    FN-->>Admin: TXT de verificacion
    Admin->>DNS: Crear TXT
    FN->>DNS: Verificar ownership
    FN->>AWS: Solicitar certificado ACM
    FN->>AWS: Crear CloudFront + WAF
    FN-->>Admin: CNAME objetivo
    Admin->>DNS: Crear CNAME
    FN->>FN: Activar dominio
```

