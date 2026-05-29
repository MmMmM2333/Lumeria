import { ref, shallowRef } from "vue";
import { useLaunchpadControllerHelpers } from "./useLaunchpadControllerHelpers.js";

export function runLaunchpadControllerHelpersTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad controller helpers test failed] ${message}`);
  };

  const pages = shallowRef([]);
  const helpers = useLaunchpadControllerHelpers({
    folderPageSize: ref(2),
    pageSize: ref(2),
    pages,
    seeds: [
      { name: "Alpha", emoji: "A" },
      { name: "Beta", emoji: "B" },
      { name: "Gamma", emoji: "G" },
    ],
  });

  assert(pages.value.length === 2, "seed apps should be chunked into default pages");
  assert(pages.value[0].length === 2 && pages.value[1].length === 1, "seed pages should follow the current page size");
  assert(pages.value[0][0].type === "app", "seed items should be normalized into app records");
  assert(pages.value[0][0].name === "Alpha", "seed app names should be preserved");
  assert(typeof helpers.chunkIntoPages === "function", "page chunking helper should be returned");
  assert(typeof helpers.cloneItem === "function", "layout helpers should be returned");
  assert(typeof helpers.withFolderPages === "function", "folder page helper should be returned");
  assert(typeof helpers.createLayoutSnapshot === "function", "data helpers should be returned");

  const nativePages = shallowRef([]);
  useLaunchpadControllerHelpers({
    folderPageSize: ref(2),
    pageSize: ref(2),
    pages: nativePages,
    seedEnabled: false,
    seeds: [
      { name: "Hidden Seed", emoji: "H" },
    ],
  });
  assert(nativePages.value.length === 1 && nativePages.value[0].length === 0, "disabled seeds should initialize an empty page");

  const folder = {
    id: "folder",
    type: "folder",
    name: "Folder",
    childPages: [[pages.value[0][0]]],
  };
  const snapshot = helpers.createLayoutSnapshot({
    pages: [[folder]],
    textless: true,
  });
  assert(snapshot.pages[0][0].children.length === 1, "data helpers should use the shared folder child helpers");
}
