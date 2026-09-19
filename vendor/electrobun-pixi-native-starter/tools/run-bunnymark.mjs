import { spawnSync } from "node:child_process";

const count = Number(process.argv[2] ?? 100000);
if (!Number.isInteger(count) || count <= 0) {
	throw new Error("Usage: npm run bunnymark -- [positive bunny count]");
}
if (!process.env.npm_execpath) throw new Error("Run BunnyMark through npm run bunnymark");
const result = spawnSync(process.execPath, [process.env.npm_execpath, "start"], {
	stdio: "inherit",
	env: { ...process.env, PIXI_BUNNYMARK_COUNT: String(count) },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
