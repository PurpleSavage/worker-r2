# Desplegar el worker

Un solo codigo, dos workers en Cloudflare:

| | Desarrollo | Produccion |
|---|---|---|
| Comando | `npm run deploy` | `npm run deploy:prod` |
| Worker | `r2-file-upload-webhook-worker` | `r2-file-upload-webhook-worker-production` |
| Bucket | `polygon` | `palamind` (privado) |
| Cola | `r2-processing-file-queue` | `r2-processing-file-queue-prod` |
| Backend | ngrok | Render |

## Primera vez en produccion

1. En `wrangler.jsonc`, `env.production.vars.WEBHOOK_URL`: la URL de Render
   terminada en `/docengine/wherehouse/proposal/webhook`.
2. `npx wrangler login`
3. `npm run deploy:prod`
4. `npx wrangler secret put WEBHOOK_SECRET --env production` y pega el mismo
   valor que `CLOUDFLARE_WEBHOOK_SECRET` en Render.

## Desarrollo

- El secreto ya no esta en `wrangler.jsonc`. Una vez:
  `npx wrangler secret put WEBHOOK_SECRET --env=""`
- Para `wrangler dev`, copia `.dev.vars.example` a `.dev.vars`.

## Recursos del bucket de produccion (panel de Cloudflare)

- Aviso de eventos: creacion de objeto, prefijo `docs/bi/dataraws/`, cola
  `r2-processing-file-queue-prod`.
- CORS: `r2-cors.prod.json` (origen `http://wails.localhost`).
- Sin acceso publico: el backend descarga con una URL firmada.
