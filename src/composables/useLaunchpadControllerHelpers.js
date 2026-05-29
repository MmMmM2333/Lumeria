import { appSeeds } from "../mocks/appSeeds.js";
import {
  chunkIntoPages,
  createLaunchpadLayoutHelpers,
} from "../domain/launchpadLayout.js";
import { createLaunchpadDataHelpers } from "../domain/launchpadData.js";

export function useLaunchpadControllerHelpers(options) {
  const {
    folderPageSize,
    pageSize,
    pages,
    seedEnabled = true,
    seeds = appSeeds,
  } = options;

  const layoutHelpers = createLaunchpadLayoutHelpers({
    getPageSize: () => pageSize.value,
    getFolderPageSize: () => folderPageSize.value,
  });
  const dataHelpers = createLaunchpadDataHelpers({
    cloneItem: layoutHelpers.cloneItem,
    clonePages: layoutHelpers.clonePages,
    compactPages: layoutHelpers.compactPages,
    ensurePage: layoutHelpers.ensurePage,
    getFolderChildPages: layoutHelpers.getFolderChildPages,
    getFolderPageSize: () => folderPageSize.value,
    getPageSize: () => pageSize.value,
    makeId: layoutHelpers.makeId,
    withFolderPages: layoutHelpers.withFolderPages,
  });

  pages.value = seedEnabled ? chunkIntoPages(seeds.map(layoutHelpers.makeApp), pageSize.value) : [[]];

  return {
    chunkIntoPages,
    ...layoutHelpers,
    ...dataHelpers,
  };
}
