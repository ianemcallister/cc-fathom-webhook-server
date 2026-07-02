import { google, sheets_v4 } from "googleapis";

const GOOGLE_SHEET_ID_ENV = "GOOGLE_SHEET_ID";
const GOOGLE_SHEET_TAB_ENV = "GOOGLE_SHEET_TAB";

const SHEETS_SCOPE = ["https://www.googleapis.com/auth/spreadsheets"];

let sheetsClient: sheets_v4.Sheets | undefined;

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function getSheetsClient(): sheets_v4.Sheets {
	if (!sheetsClient) {
		const auth = new google.auth.GoogleAuth({
			scopes: SHEETS_SCOPE,
		});

		sheetsClient = google.sheets({ version: "v4", auth });
	}

	return sheetsClient;
}

export interface AppendWebhookRowParams {
	webhookType?: string;
	payload: unknown;
	receivedAt?: Date;
	sheetId?: string;
	sheetTab?: string;
}

function serializePayload(payload: unknown): string {
	if (typeof payload === "string") {
		return payload;
	}

	try {
		return JSON.stringify(payload);
	} catch {
		return String(payload);
	}
}

function getDefaultSheetRange(sheetTab?: string): string {
	const tab = sheetTab ?? process.env[GOOGLE_SHEET_TAB_ENV] ?? "Sheet1";
	return `${tab}!A:C`;
}

function getDefaultSheetId(sheetId?: string): string {
	return sheetId ?? requiredEnv(GOOGLE_SHEET_ID_ENV);
}

export async function appendWebhookRow(
	params: AppendWebhookRowParams,
): Promise<sheets_v4.Schema$AppendValuesResponse> {
	const receivedAt = params.receivedAt ?? new Date();
	const row = [
		receivedAt.toISOString(),
		params.webhookType ?? "unknown",
		serializePayload(params.payload),
	];

	const response = await getSheetsClient().spreadsheets.values.append({
		spreadsheetId: getDefaultSheetId(params.sheetId),
		range: getDefaultSheetRange(params.sheetTab),
		valueInputOption: "RAW",
		insertDataOption: "INSERT_ROWS",
		requestBody: {
			values: [row],
		},
	});

	return response.data;
}

export default appendWebhookRow;
