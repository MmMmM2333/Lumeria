import {
  getLocaleMetadata,
  translateMessage,
  validateBundledCatalogs,
} from "./catalogs.js";

function assert(condition, message) {
  if (!condition) throw new Error(`[I18n catalog test failed] ${message}`);
}

export function runCatalogTests() {
  const issues = validateBundledCatalogs();
  assert(issues.length === 0, `bundled catalogs should have matching keys and placeholders: ${issues.join("; ")}`);

  const english = getLocaleMetadata("en-US");
  assert(english.displayName === "English", "locale metadata should expose an autonym for the settings selector");
  assert(english.direction === "ltr", "locale metadata should expose document direction");

  assert(translateMessage("zh-CN", "common.actions.cancel") === "取消", "the Chinese catalog should translate semantic keys");
  assert(translateMessage("en-US", "common.actions.cancel") === "Cancel", "the English catalog should translate semantic keys");
  assert(
    translateMessage("zh-CN", "launchpad.batch.reasons.invalid-target") === "此处不能放置所选应用。",
    "an invalid move target should describe placement rather than folder creation"
  );
  assert(
    translateMessage("zh-CN", "launchpad.batch.createInvalidSelection") === "当前选择无法创建文件夹。",
    "toolbar folder creation should keep its dedicated invalid-selection message"
  );
  assert(
    translateMessage("en-US", "errors.launch.title", { appName: "Calculator" }) === "Could not open Calculator",
    "catalog translation should interpolate named values"
  );

  let missingKeyError = null;
  try {
    translateMessage("en-US", "missing.catalog.key");
  } catch (error) {
    missingKeyError = error;
  }
  assert(missingKeyError?.code === "i18nMessageMissing", "a missing key should fail explicitly instead of falling back to Chinese");
}
