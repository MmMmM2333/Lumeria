import { expect, test } from "@playwright/test";
import type { LaunchpadController } from "../../src/composables/useLaunchpadController.js";

type RootState = {
  dialogs: LaunchpadController["dialogs"];
  overlays: LaunchpadController["overlays"];
  settingsPanelModel: LaunchpadController["settingsPanelModel"];
  chrome: LaunchpadController["chrome"];
  openSettingsPanel: () => void;
};
type AppElement = HTMLElement & { __vue_app__: { _instance: { setupState: RootState } } };
test.use({ locale: "en-US", viewport: { width: 1100, height: 850 } });

test("DOM animation curves, interruption, finish and Vue cleanup", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tests/browser/fixtures/dom-motion.html");
  const result = await page.evaluate(async () => {
    const path = "/tests/browser/fixtures/dom-motion.fixture.ts";
    return (await import(path)).runDomMotionRegression();
  });
  expect(result.maxEasingError).toBeLessThan(0.00005);
  expect(result.lifecycle).toBe("passed"); expect(errors).toEqual([]);
  await info.attach("curve-and-lifecycle-result", { body: JSON.stringify(result), contentType: "application/json" });
});

test("reduced motion applies immediately and finishes an existing animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tests/browser/fixtures/dom-motion.html");
  const mount = () => page.evaluate(async () => {
    const path = "/tests/browser/fixtures/dom-motion.fixture.ts";
    await (await import(path)).mountReducedMotionFixture();
  });
  await mount();
  const state = () => page.locator("#reduced-motion").evaluate(node => ({ opacity: getComputedStyle(node).opacity, count: node.getAnimations().length }));
  expect(await state()).toEqual({ opacity: "1", count: 0 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload(); await mount();
  expect((await state()).count).toBe(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(state).toEqual({ opacity: "1", count: 0 });
});

test("real Web settings, warning, launch ghost and chrome keep their transitions", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/?fixture=multi-select");
  await expect(page.getByRole("button", { name: "Open settings" })).toBeVisible();
  await page.getByRole("button", { name: "Open settings" }).click();
  const panel = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(panel).toBeVisible();
  await expect.poll(() => panel.evaluate(node => node.getAnimations().length)).toBe(0);
  expect(await panel.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
  await page.screenshot({ path: info.outputPath("settings-open.png") });
  // Drive existing app commands to make open/close overlap deterministically, without OS launches.
  const continuity = await page.evaluate(async () => {
    const state = document.querySelector<AppElement>("#app")!.__vue_app__._instance.setupState;
    state.settingsPanelModel.shell.actions.close(); await Promise.resolve();
    const node = document.querySelector<HTMLElement>(".settings-panel")!, closing = node.getAnimations()[0]!;
    closing.pause(); closing.currentTime = 90;
    const before = getComputedStyle(node).transform;
    state.openSettingsPanel(); await Promise.resolve();
    const opening = node.getAnimations()[0]!; opening.pause(); opening.currentTime = 0;
    const after = getComputedStyle(node).transform;
    opening.finish(); return { before, after, oldCancelled: closing.playState === "idle" };
  });
  expect(continuity.after).toBe(continuity.before); expect(continuity.oldCancelled).toBe(true);
  await page.getByLabel("Close settings", { exact: true }).click();
  await expect(panel).toHaveCount(0);

  await page.evaluate(() => {
    const state = document.querySelector<AppElement>("#app")!.__vue_app__._instance.setupState;
    state.dialogs.openWarningDialog({ title: "Animation regression", message: "Confirm the transition remains readable.", confirmText: "OK", cancelText: "Cancel" });
  });
  const warning = page.getByRole("alertdialog", { name: "Animation regression" });
  await expect(warning).toBeVisible();
  await expect.poll(() => warning.evaluate(node => node.getAnimations().length)).toBe(0);
  await page.screenshot({ path: info.outputPath("warning-open.png") });
  await page.evaluate(() => (document.querySelector<AppElement>("#app")!.__vue_app__._instance.setupState).dialogs.closeWarningDialog());
  await expect(warning).toHaveCount(0);

  const ghost = await page.evaluate(async () => {
    const state = document.querySelector<AppElement>("#app")!.__vue_app__._instance.setupState;
    state.overlays.launchGhost.value = { app: { id: "motion-fixture", type: "app", name: "Fixture", emoji: "F" }, rect: { left: 100, top: 100, width: 64, height: 64 } } as NonNullable<typeof state.overlays.launchGhost.value>;
    await Promise.resolve();
    const node = document.querySelector<HTMLElement>(".app-launch-ghost")!, animation = node.getAnimations()[0]!;
    animation.pause(); animation.currentTime = Number(animation.effect!.getTiming().duration) / 2;
    const style = getComputedStyle(node), matrix = new DOMMatrixReadOnly(style.transform);
    const result = { opacity: Number(style.opacity), scale: matrix.a };
    state.overlays.launchGhost.value = null; await Promise.resolve();
    return { ...result, removed: !node.isConnected, animations: node.getAnimations().length };
  });
  expect(ghost.opacity).toBeCloseTo(0.125, 3); expect(ghost.scale).toBeCloseTo(1.805, 3);
  expect(ghost.removed).toBe(true); expect(ghost.animations).toBe(0);
  for (const selector of [".launchpad-chrome-motion-header", ".launchpad-chrome-motion-dots"]) {
    await expect.poll(() => page.locator(selector).evaluate(node => getComputedStyle(node).opacity)).toBe("1");
  }
  await page.screenshot({ path: info.outputPath("desktop-restored.png") });
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect.poll(() => panel.evaluate(node => node.getAnimations().length)).toBe(0);
  const desktopClose = await page.evaluate(async () => {
    const state = document.querySelector<AppElement>("#app")!.__vue_app__._instance.setupState;
    state.chrome.closeNativeWindow(); await Promise.resolve();
    const panel = document.querySelector<HTMLElement>(".settings-panel")!;
    const effect = panel.getAnimations()[0]!;
    const duration = Number(effect.effect!.getTiming().duration);
    effect.pause(); effect.currentTime = duration / 2;
    const opacity = Number(getComputedStyle(panel).opacity);
    const chrome = [".launchpad-chrome-motion-header", ".launchpad-chrome-motion-dots"].map(selector => {
      const node = document.querySelector<HTMLElement>(selector)!, animation = node.getAnimations()[0]!;
      animation.pause(); animation.currentTime = Number(animation.effect!.getTiming().duration) / 2;
      const midpoint = Number(getComputedStyle(node).opacity);
      animation.currentTime = Number(animation.effect!.getTiming().duration);
      const target = { opacity: getComputedStyle(node).opacity, filter: getComputedStyle(node).filter };
      animation.finish(); return { midpoint, ...target };
    });
    effect.finish(); return { opacity, duration, expectedDuration: state.settingsPanelModel.shell.motion.closeDurationSeconds.value * 1000, chrome };
  });
  expect(desktopClose.duration).toBe(desktopClose.expectedDuration);
  expect(desktopClose.opacity).toBeCloseTo(0.5, 3);
  for (const item of desktopClose.chrome) {
    expect(item.midpoint).toBeCloseTo(0.125, 3);
    expect(item.opacity).toBe("0"); expect(item.filter).toBe("blur(8px)");
  }
  await expect(panel).toHaveCount(0);
  expect(errors).toEqual([]);
});
