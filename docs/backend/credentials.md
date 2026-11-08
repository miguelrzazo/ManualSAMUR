# Credenciales del backend editorial

## Acceso con GitHub

La aplicación OAuth **Manual SAMUR · Administración** usa
`https://manualsamur.apta-academy.com/auth/github/callback` como URL de retorno.
El Worker de producción necesita los secretos `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET` y `EDITOR_EMAIL`. Comprueba sus nombres con
`npx wrangler secret list --env production`.

Si es necesario aprovisionar o rotar credenciales, configura la aplicación en
[GitHub](https://github.com/settings/developers) y usa el asistente interactivo:

```bash
python3 scripts/backend/setup-github.py
```

El asistente pide el secreto con entrada oculta y lo guarda en Cloudflare.
Usa como correo propietario una dirección verificada por GitHub. Las demás
cuentas se invitan desde **Usuarios**; solo necesitan verificar allí el correo
de la invitación. No es necesario activar Cloudflare Zero Trust.

En producción, abre [Administración](https://manualsamur.apta-academy.com/admin),
comprueba el inicio de sesión y confirma que una ventana privada recibe un 401
en `/api/editor/session`. No compartas secretos o códigos de acceso por chat.

## Despliegues de código

La ejecución interactiva usa `npx wrangler login`. GitHub `deploy.yml` conserva un
token de Cloudflare separado y limitado a D1 Edit, Workers Scripts Edit, Workers KV
Storage Edit y Account Settings Read, además de los permisos específicos que
Cloudflare requiera para desplegar el Workflow. Su alcance debe seguir limitado a
esta cuenta. No necesita permisos para administrar Access.

La detección y publicación editorial ya no necesitan tokens de GitHub, secretos
de CI para importar propuestas ni `PUBLICATION_GITHUB_TOKEN`. No retirar las
credenciales usadas por despliegues de código u otros proyectos.

Ninguno de estos pasos autoriza activar planes de pago. La publicación y sus
adjuntos deben operar dentro del plan gratuito acordado.
