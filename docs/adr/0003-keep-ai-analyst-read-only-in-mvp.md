# ADR 0003: Mantener AI Analyst en modo read-only durante el MVP

## Estado

Aceptada.

## Contexto

El analizador basado en IA puede ayudar a resumir incidentes, correlacionar eventos y recomendar cambios. Sin embargo, permitirle bloquear trafico o modificar politicas automaticamente aumenta el riesgo de falsos positivos e interrupciones.

## Decision

Durante el MVP, AI Security Analyst solo puede:

- Leer eventos.
- Generar findings.
- Recomendar acciones.
- Generar reportes.
- Proponer reglas.

No puede aplicar cambios sin aprobacion humana.

## Consecuencias

Ventajas:

- Reduce riesgo operacional.
- Facilita auditoria.
- Genera confianza con clientes.

Tradeoffs:

- Menos automatizacion.
- Requiere aprobacion manual para mitigaciones importantes.

