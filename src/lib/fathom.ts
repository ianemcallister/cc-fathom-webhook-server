import { Fathom } from "fathom-typescript";

const IANS_FATHOM_KEY = "IANS_FATHOM_KEY";
const FALLBACK_FATHOM_API_KEY_ENV = "FATHOM_API_KEY";

let fathomClient: Fathom | undefined;

function getFathomApiKey(): string {
	const apiKey =
		process.env[IANS_FATHOM_KEY] ??
		process.env[FALLBACK_FATHOM_API_KEY_ENV];

	if (!apiKey) {
		throw new Error(
			`Missing Fathom API key. Set ${IANS_FATHOM_KEY} (preferred) or ${FALLBACK_FATHOM_API_KEY_ENV}.`,
		);
	}

	return apiKey;
}

export function getFathomClient(): Fathom {
	if (!fathomClient) {
		fathomClient = new Fathom({
			security: {
				apiKeyAuth: getFathomApiKey(),
			},
		});
	}

	return fathomClient;
}

export async function listMeetings() {
	return getFathomClient().listMeetings({});
}

export default getFathomClient;
