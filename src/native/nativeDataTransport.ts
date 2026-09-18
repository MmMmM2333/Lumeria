import { spawn, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import { createInterface, type Interface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { NATIVE_DATA_PROTOCOL_VERSION as PROTOCOL_VERSION, readNativeResponse } from "./nativeDataProtocol.js";

type UnknownRecord = Record<string, unknown>;
type NativeDataProcess = ChildProcessByStdio<Writable, Readable, null>;

/** Owns the serial process channel and its shutdown; domain result validation stays with the client. */
export class NativeDataTransport {
  readonly #process: NativeDataProcess;
  readonly #lines: AsyncIterator<string>;
  readonly #lineReader: Interface;
  #closed = false;
  #nextId = 1;
  #processError: Error | null = null;
  #tail: Promise<void> = Promise.resolve();

  constructor(executable: string, args: readonly string[] = []) {
    this.#process = spawn(executable, [...args], {
      env: process.env,
      stdio: ["pipe", "pipe", "inherit"],
      windowsHide: true,
    });
    this.#process.on("error", (error) => {
      this.#processError = error;
    });
    // write() rejects its callback and also emits on the stream. Observe both:
    // a dead sidecar must reject callers, not escape as an unhandled EPIPE.
    this.#process.stdin.on("error", error => { this.#processError = error; });
    this.#lineReader = createInterface({ input: this.#process.stdout, crlfDelay: Infinity });
    this.#lines = this.#lineReader[Symbol.asyncIterator]();
  }

  async dispose(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#tail;
    this.#lineReader.close();
    this.#process.stdin.end();
    if (this.#process.exitCode === null && this.#process.signalCode === null && this.#processError === null) await once(this.#process, "close");
  }

  request(operation: string, fields: UnknownRecord = {}): Promise<unknown> {
    if (this.#closed) return Promise.reject(new Error("Native data host has been disposed"));
    const id = this.#nextId++;
    // ponytail: requests stay serial while the Rust host is serial; add id-based dispatch only if parallel host work is introduced.
    const task = this.#tail.then(async () => {
      if (this.#processError) throw this.#processError;
      if (this.#process.exitCode !== null || this.#process.signalCode !== null) {
        throw new Error(`Native data host exited before responding to ${operation}`);
      }
      await new Promise<void>((resolve, reject) => {
        this.#process.stdin.write(
          `${JSON.stringify({ version: PROTOCOL_VERSION, id, operation, ...fields })}\n`,
          (error) => error ? reject(error) : resolve(),
        );
      });
      const line = await this.#lines.next();
      if (line.done) {
        throw this.#processError
          ?? new Error(`Native data host exited before responding to ${operation}`);
      }
      return readNativeResponse(line.value, operation, id);
    });
    this.#tail = task.then(() => undefined, () => undefined);
    return task;
  }
}
