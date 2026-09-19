import { findFocusedIcon, firstIconFocus, focusMatchesScope, matchesIconFocus, moveIconFocus, type LaunchpadIconScope } from "./iconFocus.js";

export function runIconFocusTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Icon focus test failed] ${message}`);
  };

  const desktop = { area: "desktop", folderId: null, id: "app-a", pageIndex: 1 };
  assert(matchesIconFocus(desktop, "desktop", "app-a", 1), "desktop focus should match all render identity fields");
  assert(!matchesIconFocus(desktop, "desktop", "app-a", 0), "desktop focus should not leak across pages");
  assert(!matchesIconFocus(desktop, "search", "app-a", 1), "desktop focus should not leak into search results");

  const folder = { area: "folder", folderId: "folder-a", id: "app-b", pageIndex: 2 };
  assert(matchesIconFocus(folder, "folder", "app-b", 2, "folder-a"), "folder focus should match its folder scope");
  assert(!matchesIconFocus(folder, "folder", "app-b", 2, "folder-b"), "folder focus should not leak across folders");

  const scope: LaunchpadIconScope = { area: "desktop", columns: 2, folderId: null, pageIndex: 0,
    items: ["a", "b", "c", "d"].map((id) => ({ id })) };
  const first = firstIconFocus(scope);
  assert(first?.id === "a", "first keyboard input should focus the first item");
  assert(moveIconFocus(null, scope, "ArrowDown")?.id === "a", "first arrow should establish focus before moving");
  assert(moveIconFocus(first, scope, "ArrowRight")?.id === "b", "horizontal navigation should advance one item");
  assert(moveIconFocus(first, scope, "ArrowDown")?.id === "c", "vertical navigation should use the column count");
  assert(moveIconFocus(first, scope, "ArrowLeft")?.id === "a", "navigation should clamp at the first item");
  assert(moveIconFocus(desktop, scope, "ArrowRight")?.id === "a", "stale page focus should restart at the first item");
  assert(firstIconFocus({ ...scope, items: [] }) === null, "empty scopes should have no focus");
  assert(findFocusedIcon(first, scope)?.id === "a", "activation should resolve within the current scope");
  assert(findFocusedIcon(first, { ...scope, pageIndex: 1 }) === null, "activation must not reuse another page's focus");
  assert(!focusMatchesScope(folder, { ...scope, area: "folder", folderId: "different" }), "folder identity belongs to focus scope");
}
