# Arquitectura General

FortressNet se compone de dos planos:

- **Data plane**: procesa trafico, aplica protecciones y genera eventos.
- **Control plane**: gestiona tenants, dominios, policies, despliegues AWS, usuarios, billing y reporting.

```mermaid
flowchart TD
    U[Usuario, bot o atacante] --> R53[Route 53 / DNS externo]
    R53 --> CF[CloudFront]
    CF --> WAF[AWS WAF]
    WAF --> EDGE[CloudFront Functions / Edge logic]
    EDGE --> ORIGIN[ALB / API Gateway / Origin]

    CP[FortressNet Control Plane] --> PC[Policy Compiler]
    PC --> WAF
    PC --> CF
    PC --> APIGW[API Gateway]

    CF --> LOGS[Logs y eventos]
    WAF --> LOGS
    ORIGIN --> LOGS
    LOGS --> DATA[Security Data Lake]
    DATA --> DASH[FortressNet Dashboard]
    DATA --> AI[AI Security Analyst]
```

## Componentes principales

### Control Plane

Responsable de:

- Crear y administrar tenants.
- Gestionar usuarios, roles y SSO.
- Registrar dominios y validar ownership.
- Definir origins y aplicaciones.
- Crear policies de seguridad.
- Compilar policies hacia servicios AWS.
- Mostrar metricas, eventos, findings y reportes.
- Gestionar billing y planes.

### Data Plane

Responsable de:

- Recibir trafico HTTP/HTTPS.
- Aplicar CDN, routing y TLS.
- Ejecutar WAF, rate limiting y reglas edge.
- Enviar trafico permitido al origin.
- Bloquear, desafiar o limitar trafico sospechoso.
- Generar eventos trazables por request.

### Security Analytics Plane

Responsable de:

- Ingestar logs de CloudFront, WAF, API Gateway, ALB y Decision Engine.
- Normalizar eventos por tenant.
- Calcular metricas agregadas.
- Detectar anomalias.
- Generar findings.
- Producir reportes ejecutivos y tecnicos.
- Alimentar el AI Security Analyst.

## Principio de diseño

FortressNet no debe ser solo una coleccion de servicios AWS. El valor diferencial esta en:

- Politicas declarativas y versionables.
- Explicabilidad de decisiones.
- Trazabilidad por request.
- Multi-tenancy gestionado.
- Reporting de seguridad orientado al cliente.
- Analisis IA sobre eventos y comportamiento.

