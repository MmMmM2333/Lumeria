import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createConnection, createServer, type Socket } from "node:net";
import { join } from "node:path";
import { PRODUCT } from "../platform/product.js";

type Command = "activate" | "shutdown" | "status";
type SessionLocation = Readonly<{ data: string; installationRoot: string }>;
type SessionRecord = Readonly<{ version: 1; token: string; pid: number; launcherPid: number | null; installationRoot: string }>;
export type SessionStatus = Omit<SessionRecord, "token"> & Readonly<{ ready: boolean; closing: boolean }>;
type Reply = { ok: true; status: SessionStatus } | { ok: false; error: string };
export type SessionHandlers = Readonly<{ activate(): void | Promise<void>; shutdown(): Promise<void> }>;
export type NativeSession = Readonly<{ setHandlers(handlers: SessionHandlers): void; dispose(): Promise<void> }>;

function sessionFiles(data: string) {
  const root = realpathSync(data);
  const identity = process.platform === "win32" ? root.toLowerCase() : root;
  const hash = createHash("sha256").update(PRODUCT.identifier).update("\0").update(identity).digest("hex").slice(0, 32);
  return {
    record: join(root, ".native-session.json"),
    endpoint: process.platform === "win32" ? `\\\\.\\pipe\\lumeria-${hash}` : join(root, ".native-session.sock"),
  };
}

function readSessionRecord(path: string): SessionRecord | null {
  try {
    const source = readFileSync(path, "utf8");
    if (source.length > 4096) throw new Error("Invalid native session record");
    const value = JSON.parse(source) as Partial<SessionRecord>;
    if (value.version !== 1 || typeof value.token !== "string" || !/^[a-f0-9]{64}$/.test(value.token)
      || !Number.isSafeInteger(value.pid) || Number(value.pid) <= 0 || typeof value.installationRoot !== "string"
      || (value.launcherPid !== null && (!Number.isSafeInteger(value.launcherPid) || Number(value.launcherPid) <= 0))) {
      throw new Error("Invalid native session record");
    }
    return value as SessionRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function sameRoot(left: string, right: string): boolean {
  const a = realpathSync(left), b = realpathSync(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** The endpoint is per user data directory; callers never select an executable to stop. */
export async function requestNativeSession(location: SessionLocation, command: Command, timeoutMs = 30_000): Promise<SessionStatus | null> {
  if (!existsSync(location.data)) return null;
  const files = sessionFiles(location.data);
  const record = readSessionRecord(files.record);
  if (!record) return null;
  return new Promise((resolve, reject) => {
    let source = "", settled = false;
    const socket = createConnection(files.endpoint);
    socket.setEncoding("utf8");
    const finish = (error: Error | null, value: SessionStatus | null = null) => {
      if (settled) return;
      settled = true; socket.destroy();
      if (error) reject(error); else resolve(value);
    };
    socket.setTimeout(timeoutMs, () => finish(new Error(`Lumeria ${command} request timed out`)));
    socket.once("connect", () => socket.write(JSON.stringify({ version: 1, token: record.token, command, installationRoot: location.installationRoot }) + "\n"));
    socket.on("data", chunk => {
      source += chunk.toString("utf8");
      if (source.length > 8192) { finish(new Error("Native session response is too large")); return; }
      if (!source.includes("\n")) return;
      try {
        const reply: unknown = JSON.parse(source.slice(0, source.indexOf("\n")));
        if (!reply || typeof reply !== "object" || !("ok" in reply)) throw new Error("Invalid native session response");
        const result = reply as Reply;
        if (!result.ok) throw new Error(typeof result.error === "string" ? result.error : "Native session rejected the request");
        if (result.status.version !== 1 || result.status.pid !== record.pid || result.status.launcherPid !== record.launcherPid || result.status.installationRoot !== record.installationRoot
          || typeof result.status.ready !== "boolean" || typeof result.status.closing !== "boolean") throw new Error("Native session identity changed");
        finish(null, result.status);
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    });
    socket.once("error", error => {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ECONNREFUSED") finish(null);
      else finish(error);
    });
    socket.once("end", () => { if (!settled) finish(new Error("Native session closed without acknowledging the request")); });
  });
}

export async function acquireNativeSession(location: SessionLocation, origin: "manual" | "login" = "manual"): Promise<NativeSession | null> {
  mkdirSync(location.data, { recursive: true, mode: 0o700 });
  const files = sessionFiles(location.data);
  const launcherPid = Number(process.env.LUMERIA_LAUNCHER_PID);
  const record: SessionRecord = {
    version: 1, token: randomBytes(32).toString("hex"), pid: process.pid,
    launcherPid: Number.isSafeInteger(launcherPid) && launcherPid > 0 ? launcherPid : null,
    installationRoot: realpathSync(location.installationRoot),
  };
  let handlers: SessionHandlers | null = null, closing = false, disposed = false;
  let signalReady!: () => void, failReady!: (reason: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { signalReady = resolve; failReady = reject; });
  void ready.catch(() => {});
  const sockets = new Set<Socket>();
  const status = (): SessionStatus => ({ version: 1, pid: record.pid, launcherPid: record.launcherPid, installationRoot: record.installationRoot, ready: handlers !== null, closing });
  const server = createServer(socket => {
    socket.setEncoding("utf8");
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    socket.setTimeout(30_000, () => socket.destroy());
    let source = "", received = false;
    socket.on("data", chunk => {
      if (received) { socket.destroy(); return; }
      source += chunk.toString("utf8");
      if (source.length > 4096) { socket.destroy(); return; }
      if (!source.includes("\n")) return;
      received = true;
      void (async () => {
        const request = JSON.parse(source.slice(0, source.indexOf("\n"))) as Record<string, unknown>;
        if (request.version !== 1 || typeof request.token !== "string" || request.token.length !== record.token.length
          || !timingSafeEqual(Buffer.from(request.token), Buffer.from(record.token))) throw new Error("Invalid native session credentials");
        if (!["activate", "shutdown", "status"].includes(String(request.command))) throw new Error("Unsupported native session command");
        if (request.command !== "status") {
          if (closing) throw new Error("Lumeria is already closing");
          if (request.command === "shutdown" && (typeof request.installationRoot !== "string" || !sameRoot(record.installationRoot, request.installationRoot))) {
            throw new Error("A different Lumeria installation is running; close it before installing");
          }
          await ready;
          if (disposed || !handlers) throw new Error("Lumeria is no longer running");
          if (request.command === "activate") await handlers.activate();
          else {
            closing = true;
            try { await handlers.shutdown(); } catch (error) { closing = false; throw error; }
          }
        }
        socket.end(JSON.stringify({ ok: true, status: status() } satisfies Reply) + "\n");
      })().catch(error => socket.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies Reply) + "\n"));
    });
  });
  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(files.endpoint, () => { server.removeListener("error", reject); resolve(); });
      });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
      const existing = await requestNativeSession(location, origin === "login" ? "status" : "activate");
      if (existing) return null;
      if (attempt >= 50) throw new Error("Could not acquire the Lumeria session; another process is still starting");
      // A bound endpoint precedes its credential file. Retry that short race.
      await new Promise(resolve => setTimeout(resolve, 100));
      if (process.platform !== "win32" && readSessionRecord(files.record)) rmSync(files.endpoint, { force: true });
    }
  }
  const temporary = files.record + `.${process.pid}.tmp`;
  try {
    if (process.platform !== "win32") chmodSync(files.endpoint, 0o600);
    writeFileSync(temporary, JSON.stringify(record), { mode: 0o600 });
    renameSync(temporary, files.record);
  } catch (error) {
    server.close(); rmSync(temporary, { force: true }); throw error;
  }
  return {
    setHandlers(value) { if (handlers || disposed) throw new Error("Native session handlers cannot be replaced"); handlers = value; signalReady(); },
    async dispose() {
      if (disposed) return;
      disposed = true; failReady(new Error("Lumeria stopped before startup completed"));
      if (readSessionRecord(files.record)?.token === record.token) rmSync(files.record, { force: true });
      const deadline = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 1000);
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      clearTimeout(deadline);
    },
  };
}

export async function waitForNativeExit(status: SessionStatus, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (const pid of [status.pid, status.launcherPid]) {
    if (pid === null) continue;
    if (pid === process.pid) throw new Error("Cannot wait for this control process to exit");
    for (;;) {
      try { process.kill(pid, 0); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") break;
        throw error;
      }
      if (Date.now() >= deadline) throw new Error("Lumeria did not exit; installation was stopped to preserve data");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}
