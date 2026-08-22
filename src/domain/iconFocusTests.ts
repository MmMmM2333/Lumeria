import { matchesIconFocus } from "./iconFocus.js";

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
}
