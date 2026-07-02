import express, { type Express, type NextFunction, type Request, type Response } from "express";
import dotenv from "dotenv";
import morgan from "morgan";

import { appendWebhookRow } from "./lib/google";

dotenv.config();

const app: Express = express();
const port = Number(process.env.PORT ?? 8080);
const isProduction = process.env.IS_PRODUCTION?.toLowerCase() === "true";
const webhookSharedSecret = process.env.WEBHOOK_SHARED_SECRET;

app.use(morgan(isProduction ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));

function getWebhookType(body: unknown): string {
	if (body && typeof body === "object") {
		const eventType = (body as { event?: unknown }).event;
		if (typeof eventType === "string" && eventType.trim().length > 0) {
			return eventType;
		}

		const type = (body as { type?: unknown }).type;
		if (typeof type === "string" && type.trim().length > 0) {
			return type;
		}
	}

	return "unknown";
}

function validateWebhookSecret(req: Request): boolean {
	if (!webhookSharedSecret) {
		return true;
	}

	const incomingSecret = req.header("x-webhook-secret");
	return incomingSecret === webhookSharedSecret;
}

app.get("/api/test", (_req: Request, res: Response) => {
	res.status(200).send({ message: "Test endpoint is working!" });
});

app.post("/webhook/fathom", async (req: Request, res: Response, next: NextFunction) => {
	try {
		if (!validateWebhookSecret(req)) {
			res.status(401).json({ message: "Unauthorized webhook request." });
			return;
		}

		await appendWebhookRow({
			webhookType: getWebhookType(req.body),
			payload: req.body,
		});

		res.status(200).json({ message: "Webhook received." });
	} catch (error) {
		next(error);
	}
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
	const message = error instanceof Error ? error.message : "Unknown error";
	console.error("Webhook processing error:", error);
	res.status(500).json({ message: "Failed to process webhook.", detail: message });
});

app.listen(port, () => {
	console.log(
		`Express server is up and running on port ${port} in ${isProduction ? "production" : "development"} mode.`,
	);
});
