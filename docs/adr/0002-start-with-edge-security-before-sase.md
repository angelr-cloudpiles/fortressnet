# ADR 0002: Empezar con Edge Security antes de SASE

## Estado

Aceptada.

## Contexto

SASE completo implica networking enterprise, inspeccion de red, conectividad entre sedes, egress control y costes altos. El producto necesita una primera version vendible con menor complejidad.

## Decision

Construir primero Edge Security MVP:

- Dominios.
- CloudFront.
- AWS WAF.
- API protection.
- Reporting.
- AI Analyst.

ZTNA y SASE se agregan como fases posteriores.

## Consecuencias

Ventajas:

- MVP mas acotado.
- Menor coste mensual.
- Menor riesgo operativo.
- Mejor camino para validar clientes.

Tradeoffs:

- No cubre acceso privado ni networking enterprise en la primera fase.
- Competencia inicial mas directa con WAF/CDN existentes.

