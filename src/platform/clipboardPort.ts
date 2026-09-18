export type ClipboardOutcome<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: unknown }>;

export type NativeClipboardPort = Readonly<{
  readText(): Promise<ClipboardOutcome<string | null>>;
  writeText(text: string): Promise<ClipboardOutcome<void>>;
}>;
