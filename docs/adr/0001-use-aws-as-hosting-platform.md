# ADR 0001: Usar AWS como plataforma de hosting

## Estado

Aceptada.

## Contexto

FortressNet necesita construir una plataforma de seguridad edge, observabilidad y acceso privado sin operar una red global propia desde el dia uno.

## Decision

Usar AWS como plataforma inicial:

- CloudFront para edge/CDN.
- AWS WAF para WAF y rate limiting.
- Route 53 para DNS gestionado.
- ECS Fargate para servicios propios.
- RDS PostgreSQL para control plane.
- S3, CloudWatch y Athena para eventos y reporting.
- Bedrock para AI Security Analyst.

## Consecuencias

Ventajas:

- Reduce complejidad operativa.
- Permite salir al mercado mas rapido.
- Usa servicios gestionados de seguridad y networking.
- Facilita venta via AWS Marketplace en fases posteriores.

Tradeoffs:

- Dependencia fuerte de AWS.
- Costes variables por trafico y logs.
- Algunas capacidades quedan limitadas por las APIs y modelos de AWS.

