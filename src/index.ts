export interface Env {
	WEBHOOK_URL: string;
	WEBHOOK_SECRET: string;
	R2_PUBLIC_URL: string;
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

			// El backend descarga el archivo con http.Get (sin credenciales),
			// así que necesita la URL pública del objeto.
			const publicUrl = `${env.R2_PUBLIC_URL}/${key}`;

			const payload = {
				tenantId: tenantId,
				bucket: eventData.bucket,
				key: key,
				url: publicUrl,
				size: eventData.object.size,
				etag: eventData.object.eTag,
			};

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
