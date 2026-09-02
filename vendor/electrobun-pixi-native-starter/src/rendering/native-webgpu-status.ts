export type NativePresentStatus =
	| "success"
	| "suboptimal"
	| "outdated"
	| "timeout"
	| "surface-lost"
	| "device-lost"
	| "out-of-memory"
	| "fatal";

const numericStatuses: Readonly<Record<number, NativePresentStatus>> = {
	1: "success",
	2: "suboptimal",
	3: "timeout",
	4: "outdated",
	5: "surface-lost",
	6: "out-of-memory",
	[-2]: "timeout",
	[-3]: "outdated",
	[-4]: "surface-lost",
	[-6]: "out-of-memory",
};

const statuses = new Set<NativePresentStatus>([
	"success",
	"suboptimal",
	"outdated",
	"timeout",
	"surface-lost",
	"device-lost",
	"out-of-memory",
	"fatal",
]);

export function normalizePresentStatus(value: unknown): NativePresentStatus | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "number") return numericStatuses[value] ?? "fatal";
	if (typeof value === "string") {
		const status = value.toLowerCase().replaceAll("_", "-") as NativePresentStatus;
		return statuses.has(status) ? status : "fatal";
	}
	if (typeof value === "object") {
		const error = value as { surfaceStatus?: unknown; name?: unknown; message?: unknown };
		if (error.surfaceStatus !== undefined) return normalizePresentStatus(error.surfaceStatus);
		const detail = `${String(error.name ?? "")} ${String(error.message ?? "")}`.toLowerCase();
		if (detail.includes("device") && detail.includes("lost")) return "device-lost";
		if (detail.includes("out of memory") || detail.includes("out-of-memory")) return "out-of-memory";
		if (detail.includes("surface") && detail.includes("lost")) return "surface-lost";
		if (detail.includes("outdated")) return "outdated";
		if (detail.includes("timeout")) return "timeout";
	}
	return "fatal";
}
