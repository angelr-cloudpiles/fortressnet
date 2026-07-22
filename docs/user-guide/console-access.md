# Acceso a la consola FortressNet

## URLs de produccion

La consola esta disponible en cualquiera de estas URLs:

- `https://fortressnet.app`
- `https://app.fortressnet.app`

Ambas URL son origenes OAuth registrados. Use una unica URL durante una sesion; al cerrar sesion, el navegador vuelve al mismo origen.

## Primer acceso por invitacion

1. Abra la consola y seleccione **Sign in with Cognito**.
2. Ingrese el email al que llego la invitacion y la contrasena temporal.
3. Defina una nueva contrasena que cumpla la politica indicada por Cognito.
4. Cuando vuelva a la consola, abra **Profile**.
5. En **Multi-Factor Authentication**, seleccione **Configure authenticator**.
6. Escanee el QR desde la aplicacion autenticadora y confirme el codigo de seis digitos.

El QR de este flujo se identifica como `FortressNet`. El secreto solo se conserva en memoria del navegador durante el alta, no se guarda en FortressNet y no aparece en los registros de auditoria. Tras la verificacion, Cognito deja el autenticador TOTP como MFA preferido para la cuenta.

No inicie el alta del autenticador desde una pantalla generica de Cognito si necesita que la etiqueta de la aplicacion sea `FortressNet`: esa experiencia administrada controla su propio emisor. Use la pantalla **Profile** de la consola.

## Problemas de acceso

### El email de invitacion no llega

- Revise spam y cuarentena corporativa.
- Confirme que la invitacion fue enviada a la casilla correcta.
- Un propietario de plataforma debe aplicar el procedimiento administrativo de recuperacion para restablecer una invitacion existente. No reutilice ni comparta una contrasena temporal.

### Cognito muestra `redirect_mismatch`

Abra la consola desde una de las URLs de produccion anteriores y reinicie el flujo de inicio de sesion. Las URLs de retorno permitidas son:

- `https://fortressnet.app/auth/callback`
- `https://app.fortressnet.app/auth/callback`

No use una IP, un host de ALB, `localhost`, ni una URL con un path distinto. Esos origenes se rechazan intencionalmente.

### Se perdio el autenticador

Un propietario de plataforma debe validar la identidad del usuario y reemitir la invitacion o aplicar el procedimiento de recuperacion aprobado. No se envian secretos TOTP por correo ni se conservan en DynamoDB.

## Responsabilidades por rol

- `platform_owner`: administra la plataforma, tenants, planes y propietarios de plataforma.
- `tenant_admin`: administra recursos y usuarios de su tenant.
- `security_admin` y `security_analyst`: operan y consultan controles de seguridad segun sus scopes.
- `billing_admin`: consulta y administra aspectos de facturacion autorizados.
- `read_only`: consulta recursos asignados sin cambios.

Las API keys y el token de recuperacion son mecanismos separados del inicio de sesion humano. Las API keys se crean con scopes limitados, se muestran una sola vez y deben revocarse cuando dejan de usarse.
