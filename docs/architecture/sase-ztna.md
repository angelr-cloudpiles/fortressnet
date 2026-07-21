# SASE y ZTNA

SASE y ZTNA son extensiones naturales de FortressNet, pero no pertenecen al primer MVP de edge security.

## Definiciones

- **ZTNA**: acceso Zero Trust a aplicaciones privadas sin exponerlas directamente ni depender de VPN tradicional.
- **SASE**: plataforma que combina networking y seguridad: ZTNA, SWG, CASB, FWaaS, DNS security, DLP, segmentacion y observabilidad.

## Producto

```text
FortressNet Shield
  Apps publicas, APIs, WAF, bot protection, reporting

FortressNet Access
  ZTNA, acceso privado, SSO, posture, auditoria

FortressNet SASE
  Red global, inspeccion, DNS security, egress control, segmentacion
```

## ZTNA con AWS Verified Access

```mermaid
flowchart TD
    USER[Usuario] --> IDP[IdP: Okta / Azure AD / Google]
    USER --> VA[AWS Verified Access]
    IDP --> VA
    VA --> POLICY[FortressNet Policy Engine]
    POLICY --> APP[Private App in VPC]
    VA --> LOGS[Access Logs]
    LOGS --> REPORTS[ZTNA Reports]
```

FortressNet aporta:

- Portal por tenant.
- Politicas como codigo.
- Mapeo de grupos a permisos.
- Auditoria de accesos.
- Trazabilidad por usuario y app.
- Recomendaciones IA.

## SASE basico

```mermaid
flowchart TD
    USER[User / Branch / Workload] --> CONNECTOR[FortressNet Agent / Connector]
    CONNECTOR --> WAN[AWS Cloud WAN / Transit Gateway]
    WAN --> SECVPC[Security VPC]
    SECVPC --> NFW[AWS Network Firewall]
    SECVPC --> DNSFW[Route 53 Resolver DNS Firewall]
    NFW --> APPS[Private Apps]
    NFW --> INTERNET[Internet / SaaS]
    NFW --> LOGS[Security Logs]
    DNSFW --> LOGS
```

Funciones:

- Segmentacion de red.
- Control de egress.
- DNS filtering.
- Inspeccion L3-L7.
- Integracion con VPCs y sedes.
- Reporting de red.

## Orden recomendado

1. Edge Security MVP.
2. ZTNA para 1 app privada.
3. ZTNA multi-app por tenant.
4. SASE basico con Security VPC.
5. SASE enterprise multi-region.

No activar SASE completo hasta tener cliente enterprise que pague el coste operativo.

