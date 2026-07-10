import { matchesIconSelection } from "./iconSelection.js";

export function runIconSelectionTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Icon selection test failed] ${message}`);
  };

  const desktop = { area: "desktop", folderId: null, id: "app-a", pageIndex: 1 };
  assert(matchesIconSelection(desktop, "desktop", "app-a", 1), "desktop selections should match all render identity fields");
  assert(!matchesIconSelection(desktop, "desktop", "app-a", 0), "desktop selections should not leak across pages");
  assert(!matchesIconSelection(desktop, "search", "app-a", 1), "desktop selections should not leak into search results");

  const folder = { area: "folder", folderId: "folder-a", id: "app-b", pageIndex: 2 };
  assert(matchesIconSelection(folder, "folder", "app-b", 2, "folder-a"), "folder selections should match their folder scope");
  assert(!matchesIconSelection(folder, "folder", "app-b", 2, "folder-b"), "folder selections should not leak across folders");
}
