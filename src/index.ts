export interface Env {
	WEBHOOK_URL: string;
	WEBHOOK_SECRET: string;
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

export default {
	async queue(batch, env): Promise<void> {
		for (let message of batch.messages) {
			// R2 envía el evento dentro del body del mensaje
			const eventData = message.body as R2EventNotification;

			const payload = {
				event: "r2.object.created",
				bucket: eventData.bucket,
				fileKey: eventData.object.key,
				sizeBytes: eventData.object.size,
				uploadedAt: eventData.eventTime,
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