/** Host-owned notification storage, shared application rules never import Vue. */
export type StateCell<T> = { value: T };
export type StateHost = Readonly<{
  cell<T>(value: T): StateCell<T>;
  derived<T>(read: () => T): Readonly<StateCell<T>>;
  readonly<T>(cell: StateCell<T>): Readonly<StateCell<T>>;
}>;

export function createNativeStateHost(onChange: () => void): StateHost {
  return {
    cell<T>(initial: T): StateCell<T> {
      let value = initial;
      return { get value() { return value; }, set value(next: T) {
        if (Object.is(value, next)) return;
        value = next;
        onChange();
      } };
    },
    derived: read => ({ get value() { return read(); } }),
    readonly: cell => Object.freeze({ get value() { return cell.value; } }),
  };
}
