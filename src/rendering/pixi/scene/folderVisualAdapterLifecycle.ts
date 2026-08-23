export function throwAfterVisualAdapterRollback(
  error: unknown,
  rollback: () => void,
  message: string,
): never {
  try {
    rollback();
  } catch (rollbackError) {
    throw new AggregateError([error, rollbackError], message);
  }
  throw error;
}
