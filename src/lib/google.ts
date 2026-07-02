import { google, sheets_v4 } from "googleapis";

const GOOGLE_SHEET_ID_ENV = "GOOGLE_SHEET_ID";
const GOOGLE_SHEET_TAB_ENV = "GOOGLE_SHEET_TAB";
const WRITE_HEADERS_ENV = "WRITE_HEADERS";
const MAX_SHEET_CELL_CHARACTERS = 49_999;
const MAX_SCHEMA_DEPTH = 3;
const MAX_SCHEMA_KEYS = 40;
const DEFAULT_SHEET_RANGE = "A:S";

const SHEET_HEADERS = [
	"timestamp",
	"status",
	"recording_id",
	"title",
	"meeting_title",
	"created_at",
	"recording_start_time",
	"recording_end_time",
	"scheduled_start_time",
	"scheduled_end_time",
	"recorded_by_name",
	"recorded_by_email",
	"share_url",
	"meeting_url",
	"is_test_event",
	"calendar_invitees_count",
	"transcript_count",
	"action_items_count",
	"default_summary_markdown_formatted",
];

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

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}

	return value as UnknownRecord;
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function asNumberString(value: unknown): string {
	return typeof value === "number" ? String(value) : "";
}

function asBooleanString(value: unknown): string {
	return typeof value === "boolean" ? String(value) : "";
}

function asArrayLength(value: unknown): string {
	return Array.isArray(value) ? String(value.length) : "0";
}

export function parseFathomPayloadForSheet(
	payload: unknown,
	options?: {
		timestamp?: Date;
		status?: string;
	},
): string[] {
	const payloadRecord = asRecord(payload);
	const recordedBy = asRecord(payloadRecord?.recorded_by);
	const defaultSummary = asRecord(payloadRecord?.default_summary);

	return [
		(options?.timestamp ?? new Date()).toISOString(),
		options?.status ?? "received",
		asNumberString(payloadRecord?.recording_id),
		asString(payloadRecord?.title),
		asString(payloadRecord?.meeting_title),
		asString(payloadRecord?.created_at),
		asString(payloadRecord?.recording_start_time),
		asString(payloadRecord?.recording_end_time),
		asString(payloadRecord?.scheduled_start_time),
		asString(payloadRecord?.scheduled_end_time),
		asString(recordedBy?.name),
		asString(recordedBy?.email),
		asString(payloadRecord?.share_url),
		asString(payloadRecord?.meeting_url),
		asBooleanString(payloadRecord?.is_test_event),
		asArrayLength(payloadRecord?.calendar_invitees),
		asArrayLength(payloadRecord?.transcript),
		asArrayLength(payloadRecord?.action_items),
		asString(defaultSummary?.markdown_formatted),
	];
}

function truncateForSheetCell(value: string): string {
	if (value.length <= MAX_SHEET_CELL_CHARACTERS) {
		return value;
	}

	return value.slice(0, MAX_SHEET_CELL_CHARACTERS);
}

function truncateParsedRowForSheet(row: string[]): string[] {
	return row.map(truncateForSheetCell);
}

function shouldWriteHeaders(): boolean {
	return process.env[WRITE_HEADERS_ENV]?.toLowerCase() === "true";
}

function buildPayloadSchema(payload: unknown, depth = 0): unknown {
	if (payload === null) {
		return "null";
	}

	if (Array.isArray(payload)) {
		if (depth >= MAX_SCHEMA_DEPTH) {
			return { type: "array", length: payload.length };
		}

		const itemSchema = payload.length > 0
			? buildPayloadSchema(payload[0], depth + 1)
			: "unknown";

		return {
			type: "array",
			length: payload.length,
			itemSchema,
		};
	}

	if (typeof payload === "object") {
		if (depth >= MAX_SCHEMA_DEPTH) {
			return "object";
		}

		const entries = Object.entries(payload as Record<string, unknown>);
		const schema: Record<string, unknown> = {};

		for (const [key, value] of entries.slice(0, MAX_SCHEMA_KEYS)) {
			schema[key] = buildPayloadSchema(value, depth + 1);
		}

		if (entries.length > MAX_SCHEMA_KEYS) {
			schema.__truncatedKeys = entries.length - MAX_SCHEMA_KEYS;
		}

		return schema;
	}

	return typeof payload;
}

function getDefaultSheetRange(sheetTab?: string): string {
	const tab = sheetTab ?? process.env[GOOGLE_SHEET_TAB_ENV] ?? "Sheet1";
	return `${tab}!${DEFAULT_SHEET_RANGE}`;
}

function getDefaultSheetId(sheetId?: string): string {
	return sheetId ?? requiredEnv(GOOGLE_SHEET_ID_ENV);
}

export async function appendWebhookRow(
	params: AppendWebhookRowParams,
): Promise<sheets_v4.Schema$AppendValuesResponse> {
	const payloadSchema = buildPayloadSchema(params.payload);
	console.log("Incoming webhook payload schema:", JSON.stringify(payloadSchema));

	const receivedAt = params.receivedAt ?? new Date();
	const parsedRow = parseFathomPayloadForSheet(params.payload, {
		timestamp: receivedAt,
		status: params.webhookType ?? "unknown",
	});
	const row = truncateParsedRowForSheet(parsedRow);
	const values = shouldWriteHeaders()
		? [truncateParsedRowForSheet(SHEET_HEADERS), row]
		: [row];

	const response = await getSheetsClient().spreadsheets.values.append({
		spreadsheetId: getDefaultSheetId(params.sheetId),
		range: getDefaultSheetRange(params.sheetTab),
		valueInputOption: "RAW",
		insertDataOption: "INSERT_ROWS",
		requestBody: {
			values,
		},
	});

	return response.data;
}

export default appendWebhookRow;
