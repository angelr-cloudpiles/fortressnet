# Costes Mensuales del MVP por Fase

Estimaciones para AWS, sin Shield Advanced, con trafico moderado y pocos tenants iniciales.

## Supuestos

- 1 a 3 tenants piloto.
- 1 a 5 dominios protegidos.
- 1M a 10M requests por mes.
- 100 GB a 1 TB de transferencia mensual.
- Logs retenidos 30 dias.
- AI Analyst limitado a resumen, reporting y analisis de incidentes.

## Resumen

| Fase | Alcance | Coste mensual AWS estimado |
|---|---|---:|
| Fase 0 | PoC tecnico interno | $50-$150 |
| Fase 1 | Edge Security MVP | $250-$700 |
| Fase 2 | ZTNA MVP | +$250-$900 |
| Fase 3 | SASE basico | +$1,000-$4,000 |

## Total acumulado

| Estado | Coste mensual aproximado |
|---|---:|
| Solo Fase 0 | $50-$150 |
| Fase 1 activa | $250-$700 |
| Fase 1 + Fase 2 | $600-$1,600 |
| Fase 1 + Fase 2 + Fase 3 | $2,000-$6,000+ |

## Fase 1: Edge Security MVP

| Componente | Estimacion mensual |
|---|---:|
| CloudFront | $0-$150 |
| AWS WAF | $20-$100 |
| Route 53 | $1-$20 |
| ALB / API Gateway | $20-$150 |
| ECS Fargate | $60-$250 |
| RDS PostgreSQL | $50-$150 |
| S3 + CloudWatch logs | $20-$150 |
| Athena reports | $5-$50 |
| Bedrock AI Analyst | $20-$150 |
| Total | $250-$700 |

## Fase 2: ZTNA

| Componente | Estimacion mensual |
|---|---:|
| Verified Access, 1 app | ~$200 |
| Verified Access, 3 apps | ~$600 |
| Logs y metricas | $20-$100 |
| Cognito / SSO | $0-$100 |
| Workers FortressNet | $30-$150 |
| Incremental total | +$250-$900 |

## Fase 3: SASE basico

| Componente | Estimacion mensual |
|---|---:|
| AWS Network Firewall, 2 AZ | ~$570+ trafico |
| Network Firewall data processing | ~$0.065/GB |
| Cloud WAN, 2 edges | ~$730+ attachments |
| DNS Firewall | ~$0.60 por millon de queries |
| Transit Gateway / attachments | $100-$800 |
| Logs / analytics | $100-$800 |
| Incremental total | +$1,000-$4,000+ |

## Recomendacion de gasto

```text
Mes 1-2:
  Fase 1 minima
  objetivo: $250-$500/mes

Mes 3-4:
  Fase 1 completa + AI Analyst
  objetivo: $500-$1,000/mes

Mes 5-6:
  ZTNA piloto con 1 app privada
  objetivo total: $800-$1,500/mes

Despues:
  SASE solo con cliente enterprise
  objetivo total: $2,000-$6,000+/mes
```

