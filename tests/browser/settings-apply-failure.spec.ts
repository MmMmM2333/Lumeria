import { expect, test } from "@playwright/test";

test.use({ locale: "en-US" });

test("settings failures stay visible and retain the draft for retry", async ({ page }) => {
  await page.goto("/tests/browser/reference/index.html");
  await page.getByRole("button", { name: "Open settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = "/src/api/launchpadApi.ts";
    const { setLaunchpadApiBridgeForTests } = await import(modulePath);
    let modeCalls = 0;
    setLaunchpadApiBridgeForTests({
      invoke: async (command: string, args: Record<string, unknown>) => {
        if (command === "set_main_window_mode") {
          if (++modeCalls === 2) throw new Error("Window rollback denied");
          return args.mode;
        }
        if (command === "set_main_window_effects_enabled") throw new Error("Window effects denied");
        throw new Error(`Unexpected settings command: ${command}`);
      },
    });
  });
  const apply = dialog.locator(".settings-actions fluent-button").filter({ hasText: "Apply" });
  await apply.click();
  await expect(dialog.getByRole("alert")).toContainText("Window effects denied");
  await expect(dialog.getByRole("alert")).toContainText("Window rollback denied");
  await expect(dialog).toBeVisible();
  await expect(apply).toBeEnabled();
  await page.screenshot({ path: ".codex-dev/settings-apply-failure.png" });
  await page.evaluate(async () => {
    const modulePath = "/src/api/launchpadApi.ts";
    const { setLaunchpadApiBridgeForTests } = await import(modulePath);
    setLaunchpadApiBridgeForTests(null);
  });
  await apply.click();
  await expect(dialog).toBeHidden();
});
