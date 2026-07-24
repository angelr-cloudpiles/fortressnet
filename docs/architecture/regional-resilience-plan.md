# Plan de resiliencia regional y respaldo

## Estado de partida

FortressNet opera en `us-east-1` sobre dos zonas de disponibilidad. El control plane se ejecuta en ECS Fargate con dos tareas y un Application Load Balancer multi-AZ. La capa de datos combina:

- **Amazon RDS for PostgreSQL 17**, privado, cifrado, Multi-AZ, con retencion nativa de backups de siete dias y proteccion contra eliminacion.
- **Amazon DynamoDB** para estado operativo multi-tenant: tenants, dominios, politicas, aprobaciones, despliegues y configuracion. Las tablas tienen point-in-time recovery (PITR).
- **Amazon S3** para logs, informes y evidencias; CloudWatch para telemetria y alarmas.

Esto provee alta disponibilidad para fallas de instancia y de una AZ en RDS, ECS y ALB. No equivale aun a recuperacion ante perdida regional ni elimina todos los puntos unicos regionales.

## Objetivo antes de cross-region

Cerrar los riesgos de una sola region y demostrar, mediante ejercicios, los siguientes objetivos iniciales:

| Servicio | Objetivo de recuperacion | Objetivo de perdida de datos |
|---|---:|---:|
| Control plane | 60 minutos | 15 minutos para configuracion operativa |
| RDS PostgreSQL | 60 minutos | 15 minutos |
| DynamoDB | 60 minutos | PITR, hasta el segundo seleccionado |
| Logs y evidencias | 24 horas | 24 horas como maximo |

Los objetivos se validan en ejercicios de restauracion; no se declaran cumplidos solo por configurar backups.

## Fase 1: alta disponibilidad dentro de `us-east-1`

1. Reemplazar el NAT Gateway unico por un NAT Gateway por AZ, tablas de ruta privadas por AZ y rutas locales. Hoy una interrupcion de la AZ que contiene el NAT afecta el egreso HTTPS de las tareas aunque ECS y RDS sigan disponibles.
2. Mantener ECS con minimo dos tareas en subredes privadas de AZ distintas. Agregar Application Auto Scaling con minimo 2, maximo inicial 8, escalamiento por CPU, memoria y solicitudes por ALB; habilitar deployment circuit breaker con rollback.
3. Mantener RDS Multi-AZ y agregar alarmas de CPU, memoria disponible, conexiones, almacenamiento, replica/failover y latencia. El tamano actual `db.t4g.micro` es adecuado para piloto, no para crecimiento sostenido: se redimensiona con metricas antes de superar sus limites.
4. Agregar CloudWatch Synthetics externo para login, API autenticada y health check publico; conectar SNS a una lista de distribucion y al canal de guardia. Una alarma sin suscriptor no es una capacidad operativa.
5. Para cada tenant de SLA alto, exigir al menos dos origins independientes y un CloudFront Origin Group con health checks. La plataforma no puede hacer resiliente un origen unico del cliente.
6. Ejecutar trimestralmente pruebas de failover de RDS, perdida de tarea/AZ, restauracion de DynamoDB y recuperacion de una configuracion de tenant.

## Fase 2: respaldo administrado con AWS Backup

1. Crear un AWS Backup Vault cifrado con KMS dedicado y etiquetas de seleccion `Backup=fortressnet-production`.
2. Asociar RDS PostgreSQL y las tablas DynamoDB a un Backup Plan: copia diaria por 35 dias, semanal por 12 semanas y mensual por 12 meses. La retencion se confirma con negocio/compliance antes de aplicarla.
3. Proteger buckets S3 con versionado, bloqueo publico, lifecycle y backups de AWS Backup donde aplique. Los logs de auditoria no se sustituyen con snapshots de base de datos.
4. Activar Vault Lock en modo governance primero, verificar restauraciones y luego evaluar modo compliance. Para resistencia real ante borrado malicioso, usar una cuenta de backup separada de la cuenta de produccion mediante AWS Organizations.
5. Automatizar pruebas de restore trimestrales hacia una cuenta o VPC aislada: restaurar RDS, una tabla DynamoDB y una muestra S3; medir RTO/RPO, validar cifrado, accesos y consistencia.
6. Documentar y aprobar runbooks de declaracion de incidente, restore, rotacion de credenciales posteriores al restore y reconciliacion de colas/eventos.

## Criterio de salida regional

Se pasa a cross-region cuando los seis controles de Fase 1 y los seis de Fase 2 estan desplegados, monitoreados y probados en dos ejercicios consecutivos. La aprobacion debe registrar RTO/RPO observados, costo mensual y hallazgos pendientes.

## Fase posterior: recuperacion cross-region

La siguiente fase desplegara una region secundaria completa, no solo una copia de datos: ECS/ALB, secretos, KMS multi-region cuando corresponda, repositorio ECR replicado, Route 53 failover, copia de AWS Backup a la region secundaria, S3 Cross-Region Replication y una estrategia por dato.

- RDS: replica cross-region promovible o restauracion desde copia de AWS Backup, segun el RTO acordado.
- DynamoDB: Global Tables para estado que requiera escritura activa regional; backup copy para datos que acepten restauracion.
- S3: versionado y replicacion cross-region.
- Cognito e identidad: runbook de recuperacion y federacion, ya que un User Pool no se convierte automaticamente en activo-activo regional.

Cross-region aumenta disponibilidad y costo, y exige pruebas de failover DNS, consistencia, reversa y recuperacion de identidad antes de declarar DR operativo.

