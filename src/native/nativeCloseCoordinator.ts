type ClosePorts = Readonly<{
  requestWindowClose(): void;
  canAnimate(): boolean;
  hideWindow(): void;
  dismissLaunchpad(): void;
  setInteractive(enabled: boolean): void;
  waitForSettingsApply(): Promise<unknown> | undefined;
  flushSaves(): Promise<void>;
  finishCloseAnimation(): Promise<void>;
  prepareRestart(): Promise<void>;
  hasSaveFailure(): boolean;
  reportError(error: unknown): void;
  log(event: string): void;
}>;

/** Owns the product close intent; the existing session and save queue remain their own owners. */
export function createNativeCloseCoordinator(ports: ClosePorts) {
  let quitRequested = false;
  let restartRequested = false;
  let closing = false;
  let externalClose: { resolve(): void; reject(error: unknown): void } | null = null;

  return Object.freeze({
    get closing() { return closing; },
    requestQuit(restart = false): void {
      if (closing) return;
      restartRequested = restart;
      quitRequested = !restart;
      ports.log(restart ? "restart-request" : "quit-request");
      ports.requestWindowClose();
    },
    requestExternalShutdown(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        if (closing || restartRequested || externalClose) {
          reject(new Error("Lumeria is already closing or restarting"));
          return;
        }
        externalClose = { resolve, reject };
        quitRequested = true;
        ports.requestWindowClose();
      });
    },
    async beforeClose(): Promise<false | void> {
      if (!quitRequested && !restartRequested) {
        ports.log("window-close-hide");
        if (!ports.canAnimate()) {
          await ports.flushSaves();
          ports.hideWindow();
          return false;
        }
        ports.dismissLaunchpad();
        return false;
      }
      closing = true;
      ports.setInteractive(false);
      try {
        await ports.waitForSettingsApply();
        await ports.flushSaves();
        await ports.finishCloseAnimation();
        if (restartRequested) {
          await ports.prepareRestart();
          ports.log("restart-ready");
        }
        externalClose?.resolve();
        externalClose = null;
      } catch (error) {
        externalClose?.reject(error);
        externalClose = null;
        restartRequested = quitRequested = closing = false;
        ports.setInteractive(true);
        if (!ports.hasSaveFailure()) ports.reportError(error);
        throw error;
      }
    },
  });
}
