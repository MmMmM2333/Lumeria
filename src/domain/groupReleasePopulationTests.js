import {
  GROUP_RELEASE_ROLE,
  GROUP_RELEASE_START_KIND,
  makeGroupReleasePopulation,
  resolveGroupReleaseVisualLimit,
} from "./groupReleasePopulation.js";

function app(id) {
  return { id, name: id, type: "app" };
}

function entry(id, order = 0, overrides = {}) {
  return {
    bundleCount: 1,
    delayMs: order * 10,
    item: app(id),
    memberIds: [id],
    order,
    origin: { x: order * 20, y: 120 },
    originKind: order === 0 ? "lead" : "visible-desktop",
    originScale: 1,
    source: { index: order, kind: "desktop", pageIndex: 0 },
    ...overrides,
  };
}

export function runGroupReleasePopulationTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Group release population test failed] ${message}`);
  };

  assert(
    resolveGroupReleaseVisualLimit({ folderPageSize: 35, gridCols: 7, gridRows: 5 }) === 35,
    "the release budget should cover one complete configured page"
  );
  assert(
    resolveGroupReleaseVisualLimit({ folderPageSize: 48, gridCols: 10, gridRows: 8 }) === 80,
    "the larger desktop or folder capacity should define the one-page release budget"
  );

  const allEntries = Array.from({ length: 13 }, (_, index) => entry(`app-${index}`, index));
  const dragEntries = allEntries.slice(0, 12);
  const population = makeGroupReleasePopulation({
    allEntries,
    dragEntries,
    leadId: "app-0",
    spawnPoint: { x: 440, y: 320 },
    visualLimit: 35,
  });
  assert(population.length === 13, "thirteen selected applications should all receive a release visual");
  assert(
    population.slice(0, 12).every((candidate, index) =>
      candidate.item.id === dragEntries[index].item.id &&
      candidate.releaseStart.kind === GROUP_RELEASE_START_KIND.CURRENT_POSE
    ),
    "the twelve drag representatives should keep their current pooled-node poses and ordering"
  );
  assert(
    population[12].item.id === "app-12" &&
      population[12].releaseStart.kind === GROUP_RELEASE_START_KIND.STACK_TAIL &&
      population[12].releaseStart.alpha === 0 &&
      population[12].releaseStart.point.x === 440 &&
      population[12].releaseStart.point.y === 320,
    "a release-only member should enter invisibly from the stack tail instead of flashing at its source"
  );

  const fullPageEntries = Array.from({ length: 35 }, (_, index) => entry(`page-${index}`, index));
  const fullPagePopulation = makeGroupReleasePopulation({
    allEntries: fullPageEntries,
    dragEntries: fullPageEntries.slice(0, 12),
    leadId: "page-0",
    spawnPoint: { x: 300, y: 240 },
    visualLimit: resolveGroupReleaseVisualLimit({ folderPageSize: 35, gridCols: 7, gridRows: 5 }),
  });
  assert(fullPagePopulation.length === 35, "selecting a full 5x7 page should animate every member on release");

  const targetEntry = entry("target-b", 13, {
    origin: { x: 720, y: 180 },
    originKind: "folder-create-target",
  });
  const folderPopulation = makeGroupReleasePopulation({
    allEntries,
    dragEntries,
    leadId: "app-0",
    spawnPoint: { x: 440, y: 320 },
    targetEntry,
    visualLimit: 14,
  });
  assert(folderPopulation.length === 14, "the folder target should be added without evicting a dragged member");
  assert(
    folderPopulation.slice(0, 13).map((candidate) => candidate.item.id).join(",") ===
      allEntries.map((candidate) => candidate.item.id).join(","),
    "adding target B must not replace the twelfth or any later selected application"
  );
  assert(
    folderPopulation[0].releaseRole === GROUP_RELEASE_ROLE.LEAD &&
      folderPopulation.at(-1).releaseRole === GROUP_RELEASE_ROLE.FOLDER_CREATE_TARGET &&
      folderPopulation.at(-1).releaseStart.kind === GROUP_RELEASE_START_KIND.SOURCE_ORIGIN,
    "the lead and folder-create target should carry explicit render-order roles"
  );

  const bounded = makeGroupReleasePopulation({
    allEntries: Array.from({ length: 90 }, (_, index) => entry(`large-${index}`, index)),
    dragEntries: Array.from({ length: 12 }, (_, index) => entry(`large-${index}`, index)),
    leadId: "large-0",
    spawnPoint: { x: 0, y: 0 },
    visualLimit: 35,
  });
  assert(bounded.length === 35, "multi-page selections should respect the configured one-page release budget");

  const visibleLead = entry("visible-0", 35, { originKind: "lead" });
  const offPageEntries = Array.from({ length: 35 }, (_, index) => entry(`off-page-${index}`, index, {
    originKind: "desktop-page",
    source: { index, kind: "desktop", pageIndex: 0 },
  }));
  const visibleEntries = [
    visibleLead,
    ...Array.from({ length: 34 }, (_, index) => entry(`visible-${index + 1}`, index + 36)),
  ];
  const visibleDragEntries = visibleEntries.slice(0, 12);
  const crossPagePopulation = makeGroupReleasePopulation({
    allEntries: [visibleLead, ...offPageEntries, ...visibleEntries.slice(1)],
    dragEntries: visibleDragEntries,
    leadId: visibleLead.item.id,
    spawnPoint: { x: 300, y: 240 },
    visualLimit: 35,
  });
  assert(
    crossPagePopulation.map((candidate) => candidate.item.id).sort().join(",") ===
      visibleEntries.map((candidate) => candidate.item.id).sort().join(","),
    "a one-page release budget should cover the complete visible page before off-page selections"
  );
}
