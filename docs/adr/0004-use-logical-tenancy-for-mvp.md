# ADR 0004: Usar multi-tenancy logica en el MVP

## Estado

Aceptada.

## Contexto

El producto debe soportar varios clientes, pero crear una cuenta AWS dedicada por tenant desde el inicio aumenta coste y complejidad.

## Decision

Usar multi-tenancy logica para el MVP:

- Una plataforma compartida.
- Base de datos compartida con `tenant_id`.
- Row Level Security.
- Logs particionados por tenant.
- Recursos AWS etiquetados.

El aislamiento dedicado se reserva para clientes enterprise.

## Consecuencias

Ventajas:

- Menor coste.
- Onboarding mas rapido.
- Operacion mas simple.

Tradeoffs:

- Mayor disciplina requerida en controles de autorizacion.
- Menor aislamiento que cuenta dedicada.
- Se necesita buen testing de tenant isolation.

