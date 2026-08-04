import {
  LAUNCHPAD_ICON_DARK,
  LAUNCHPAD_ICON_LIGHT,
  LAUNCHPAD_ICON_PASTEL_DARK,
  LAUNCHPAD_ICON_PASTEL_LIGHT,
} from "../../domain/launchpadIconVariant.js";
import launchpadIconDarkUrl from "./lumeria-app-icon-dark.svg";
import launchpadIconPastelDarkUrl from "./lumeria-app-icon-dark-pastel-grid.svg";
import launchpadIconPastelLightUrl from "./lumeria-app-icon-pastel-grid.svg";
import launchpadIconLightUrl from "./lumeria-app-icon.svg";

export const launchpadIconUrls = Object.freeze({
  [LAUNCHPAD_ICON_DARK]: launchpadIconDarkUrl,
  [LAUNCHPAD_ICON_LIGHT]: launchpadIconLightUrl,
  [LAUNCHPAD_ICON_PASTEL_DARK]: launchpadIconPastelDarkUrl,
  [LAUNCHPAD_ICON_PASTEL_LIGHT]: launchpadIconPastelLightUrl,
});
