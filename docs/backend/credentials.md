# Configurar las credenciales pendientes

La sesión OAuth de Wrangler sirve para el despliegue interactivo, pero no incluye
permisos de Cloudflare Access. Los workflows mensuales también necesitan una
credencial propia que siga funcionando cuando esa sesión OAuth caduque.

No pegues estos valores en el chat, en comandos ni en archivos de Git.

## 1. Cloudflare Access

En [API Tokens de Cloudflare](https://dash.cloudflare.com/profile/api-tokens), crea
un token personalizado limitado a la cuenta donde está Manual SAMUR:

- Account → Access: Apps and Policies → Edit.
- Account → Access: Organizations, Identity Providers, and Groups → Edit.
- Account → Workers Scripts → Edit, para guardar los secretos del Worker.

Este token se usa para la configuración inicial del editor. No se guardará en
GitHub ni en el Worker como credencial de administración.

## 2. Automatización en GitHub

Crea otro token de Cloudflare limitado a esa misma cuenta con:

- Account → D1 → Edit.
- Account → Workers Scripts → Edit.
- Account → Account Settings → Read.

Se guardará como secreto de GitHub Actions para importar propuestas y desplegar
los adjuntos de las publicaciones. Mantenerlo separado evita dar permisos de
administración de Access a los workflows.

## 3. Publicar desde el editor

En [tokens de GitHub](https://github.com/settings/personal-access-tokens/new), crea
un token fine-grained, limitado al repositorio `miguelrzazo/ManualSAMUR`, con
Repository permissions → Actions → Read and write. No necesita permisos de
escritura de código. Se guardará como secreto del Worker para iniciar la compilación
de una publicación revisada.

## Introducirlos de forma segura

En la terminal del servidor `localcomputer`:

```bash
python3 /home/miguel/development/ManualSAMUR/.cloudflare/enter-deployment-secrets.py
```

El asistente pide los valores sin mostrarlos y los guarda con permisos privados en
un archivo excluido de Git. Los dos últimos se pueden dejar vacíos para completar
primero el acceso editorial. Avisa en el chat cuando termine; no compartas los valores.

Crear estos tokens no activa un plan de pago. El acceso editorial se configura
para una única identidad; no se añaden suscripciones ni servicios de pago.
