type Disposable = Readonly<{ dispose(): void | Promise<void> }>;

/** Owns the two outer resources even if application assembly fails before its UI cleanup is installed. */
export async function runWithNativeResources<Data extends Disposable, App extends Disposable>(
  createData: () => Data,
  createApp: (data: Data) => Promise<App>,
  run: (data: Data, app: App) => Promise<void>,
): Promise<void> {
  const data = createData();
  let app: App | undefined;
  const failures: unknown[] = [];
  try {
    app = await createApp(data);
    await run(data, app);
  } catch (error) {
    failures.push(error);
  } finally {
    try { await app?.dispose(); } catch (error) { failures.push(error); }
    try { await data.dispose(); } catch (error) { failures.push(error); }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Native application and cleanup failed");
}
