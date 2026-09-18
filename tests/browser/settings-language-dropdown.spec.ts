import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

test.use({ locale: "en-US" });

async function openGeneralSettings(page: Page) {
  await page.getByRole("button", { name: "Open settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  return {
    control: dialog.getByRole("combobox", { name: "Choose interface language" }),
    dialog,
    dropdown: dialog.locator("fluent-dropdown.settings-language-dropdown"),
  };
}

async function expectVisibleBrandIndicator(indicator: Locator) {
  await expect(indicator).toBeVisible();
  const metrics = await indicator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      height: rect.height,
      opacity: Number.parseFloat(style.opacity),
      width: rect.width,
    };
  });

  expect(metrics.width).toBeGreaterThanOrEqual(3);
  expect(metrics.height).toBeGreaterThanOrEqual(16);
  expect(metrics.opacity).toBeGreaterThan(0);
  expect(metrics.backgroundColor).toBe("rgb(75, 163, 246)");
}

async function getDropdownFocusVisual(dropdown: Locator) {
  return dropdown.evaluate((element) => {
    const control = element.shadowRoot?.querySelector(".control");
    if (!control) throw new Error("Fluent dropdown control is missing");

    const controlStyle = getComputedStyle(control);
    const underlineStyle = getComputedStyle(control, "::after");
    return {
      boxShadow: controlStyle.boxShadow,
      outlineColor: controlStyle.outlineColor,
      underlineBackgroundColor: underlineStyle.backgroundColor,
      underlineHeight: Number.parseFloat(underlineStyle.height),
      underlineScale: underlineStyle.scale,
    };
  });
}

function readDropdownValue(element: SVGElement | HTMLElement): string {
  if (!("value" in element) || typeof element.value !== "string") {
    throw new Error("Fluent language dropdown has no string value");
  }
  return element.value;
}

test("the language selector uses a Fluent dropdown with WinUI-style selection", async ({ page }) => {
  await page.goto("/tests/browser/reference/index.html");
  const { control, dialog, dropdown } = await openGeneralSettings(page);
  const listbox = dropdown.getByRole("listbox");
  const options = dropdown.locator("fluent-option");

  await expect(dropdown).toBeVisible();
  await expect(options).toHaveCount(3);
  await expect(control).toHaveText("Use system language");

  await control.click();
  await expect(listbox).toBeVisible();

  const focusVisual = await getDropdownFocusVisual(dropdown);
  expect(focusVisual.outlineColor).toBe("rgba(0, 0, 0, 0)");
  expect(focusVisual.boxShadow).not.toBe("none");
  expect(focusVisual.boxShadow).not.toContain("rgba(0, 0, 0, 0)");
  expect(focusVisual.underlineBackgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(focusVisual.underlineHeight).toBeGreaterThanOrEqual(2);
  expect(focusVisual.underlineScale).not.toMatch(/^0(?: 1)?$/);

  const popupMetrics = await listbox.evaluate((element) => {
    const style = getComputedStyle(element);
    const popupRect = element.getBoundingClientRect();
    const dropdownRect = element.closest("fluent-dropdown")?.getBoundingClientRect();
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: Number.parseFloat(style.borderRadius),
      boxShadow: style.boxShadow,
      coversControlWidth: dropdownRect ? popupRect.width + 0.5 >= dropdownRect.width : false,
    };
  });

  expect(popupMetrics.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(popupMetrics.borderRadius).toBeGreaterThanOrEqual(6);
  expect(popupMetrics.boxShadow).not.toBe("none");
  expect(popupMetrics.coversControlWidth).toBe(true);

  const systemOption = dropdown.getByRole("option", { name: "Use system language" });
  const englishOption = dropdown.getByRole("option", { name: "English" });
  const systemIndicator = systemOption.locator("[slot='start']");
  await expect(systemOption.locator("[slot='checked-indicator']")).toBeHidden();
  await expectVisibleBrandIndicator(systemIndicator);

  await englishOption.click();
  await expect(listbox).toBeHidden();
  await expect.poll(() => dropdown.evaluate(readDropdownValue)).toBe("en-US");

  await control.click();
  const englishIndicator = englishOption.locator("[slot='start']");
  await expectVisibleBrandIndicator(englishIndicator);
  await expect(systemIndicator).toBeHidden();

  const chineseOption = dropdown.locator("fluent-option[value='zh-CN']");
  await chineseOption.click();
  await expect.poll(() => dropdown.evaluate(readDropdownValue)).toBe("zh-CN");
  await dropdown.locator("[slot='control']").click();
  await expectVisibleBrandIndicator(chineseOption.locator("[slot='start']"));
  await expect(englishIndicator).toBeHidden();
  await systemOption.click();

  await control.press("ArrowDown");
  await control.press("Enter");
  await expect.poll(() => dropdown.evaluate(readDropdownValue)).toBe("system");

  await control.click();
  await expect(listbox).toBeVisible();
  await control.press("Escape");
  await expect(listbox).toBeHidden();
  await expect(dialog).toBeVisible();

  await control.press("Escape");
  await expect(dialog).toBeHidden();
});

test("cancel restores the language draft and apply persists it", async ({ page }) => {
  test.setTimeout(40_000);
  await page.goto("/tests/browser/reference/index.html");

  let settings = await openGeneralSettings(page);
  await settings.control.click();
  await settings.dropdown.getByRole("option", { name: "English" }).click();
  await expect.poll(() => settings.dropdown.evaluate(readDropdownValue)).toBe("en-US");
  await settings.dialog.locator(".settings-actions fluent-button").filter({ hasText: "Cancel" }).click();
  await expect(settings.dialog).toBeHidden();

  settings = await openGeneralSettings(page);
  await expect.poll(() => settings.dropdown.evaluate(readDropdownValue)).toBe("system");
  await settings.control.click();
  await settings.dropdown.getByRole("option", { name: "English" }).click();
  await settings.dialog.locator(".settings-actions fluent-button").filter({ hasText: "Apply" }).click();
  await expect(settings.dialog).toBeHidden();

  settings = await openGeneralSettings(page);
  await expect.poll(() => settings.dropdown.evaluate(readDropdownValue)).toBe("en-US");
  await settings.control.click();
  await settings.dropdown.getByRole("option", { name: "Use system language" }).click();
  await settings.dialog.locator(".settings-actions fluent-button").filter({ hasText: "Apply" }).click();
  await expect(settings.dialog).toBeHidden();

  settings = await openGeneralSettings(page);
  await expect.poll(() => settings.dropdown.evaluate(readDropdownValue)).toBe("system");
  await settings.control.press("Escape");
  await expect(settings.dialog).toBeHidden();
});
