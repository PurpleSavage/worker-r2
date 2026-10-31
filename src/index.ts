export interface Env {
	WEBHOOK_URL: string;
	WEBHOOK_SECRET: string;
	// Opcional. En produccion el bucket es privado y no hay URL publica: el
	// backend firma su propia URL de descarga con la clave del objeto.
	R2_PUBLIC_URL?: string;
}

interface R2EventNotification {
	account: string;
	bucket: string;
	object: {
		key: string;
		size: number;
		eTag: string;
	};
	action: string;
	eventTime: string;
}

// El backend genera las claves con el formato:
// docs/bi/dataraws/{tenantId}/{fileId}-{name}.xlsx
// El tenantId viaja en el path, por eso se extrae de ahí.
const KEY_PREFIX = "docs/bi/dataraws/";

function extractTenantId(key: string): string | null {
	if (!key.startsWith(KEY_PREFIX)) return null;

	const segments = key.slice(KEY_PREFIX.length).split("/");
	const tenantId = segments[0];

	if (!tenantId) return null;

	return tenantId;
}

export default {
	async queue(batch, env): Promise<void> {
		for (let message of batch.messages) {
			// R2 envía el evento dentro del body del mensaje
			const eventData = message.body as R2EventNotification;
			const key = eventData.object.key;

			const tenantId = extractTenantId(key);
			if (!tenantId) {
				console.error(`Key fuera del prefijo esperado, se descarta: ${key}`);
				message.ack();
				continue;
			}

			const payload: Record<string, unknown> = {
				tenantId: tenantId,
				bucket: eventData.bucket,
				key: key,
				size: eventData.object.size,
				etag: eventData.object.eTag,
			};
			// Solo informativo: el backend descarga con una URL firmada propia.
			if (env.R2_PUBLIC_URL) {
				payload.url = `${env.R2_PUBLIC_URL}/${key}`;
			}

			if (!env.WEBHOOK_SECRET) {
				console.error("Falta WEBHOOK_SECRET (wrangler secret put WEBHOOK_SECRET)");
				message.retry();
				continue;
			}

			try {
				const response = await fetch(env.WEBHOOK_URL, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Webhook-Secret": env.WEBHOOK_SECRET,
					},
					body: JSON.stringify(payload),
				});

				if (!response.ok) {
					console.error(`Error enviando webhook al backend. Status: ${response.status}`);
					// Reintenta entregar el mensaje si tu backend responde con error HTTP
					message.retry();
					continue;
				}

				// Confirma el procesamiento exitoso
				message.ack();
			} catch (err) {
				console.error("Error de conexión al enviar el webhook:", err);
				message.retry();
			}
		}
	},
} satisfies ExportedHandler<Env>;
