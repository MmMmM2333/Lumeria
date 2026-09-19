// The reference host entry (`main.ts`) is type-checked by plain `tsc` through
// tsconfig.tools.json, which has no Vue SFC loader (only `vue-tsc` understands
// `.vue` files). This ambient declaration keeps the SFC import resolvable for
// that program. It is scoped to the reference test host and is not part of the
// Native product bundle; vue-tsc still checks the actual component.
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
