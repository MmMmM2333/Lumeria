import { onScopeDispose, ref, watch, type WatchSource } from "vue";

export type BackgroundImagePixelSize = Readonly<{
  height: number;
  width: number;
}>;

export function loadBackgroundImagePixelSize(
  url: string | null | undefined,
): Promise<BackgroundImagePixelSize | null> {
  if (!url || typeof Image !== "function") return Promise.resolve(null);
  return new Promise<BackgroundImagePixelSize | null>((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const resolveLoadedImage = async (): Promise<void> => {
      if (settled) return;
      settled = true;
      try {
        await image.decode?.();
      } catch {
        // onload already guarantees natural dimensions for this use case.
      }
      const width = Number(image.naturalWidth);
      const height = Number(image.naturalHeight);
      if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
        resolve({ height, width });
      } else {
        reject(new Error(`Failed to read background image size: ${url}`));
      }
    };
    image.decoding = "async";
    image.onload = resolveLoadedImage;
    image.onerror = () => reject(new Error(`Failed to load background image: ${url}`));
    image.src = url;
    if (image.complete && image.naturalWidth > 0) {
      void resolveLoadedImage();
    }
  });
}

export function useBackgroundImagePixelSize(
  urlSource: WatchSource<string | null | undefined>,
) {
  const pixelSize = ref<BackgroundImagePixelSize | null>(null);
  let generation = 0;

  watch(
    urlSource,
    async (url) => {
      const currentGeneration = ++generation;
      if (!url) {
        pixelSize.value = null;
        return;
      }
      try {
        const nextSize = await loadBackgroundImagePixelSize(url);
        if (currentGeneration === generation) pixelSize.value = nextSize;
      } catch (error) {
        if (currentGeneration === generation) {
          pixelSize.value = null;
          console.warn("Failed to load background image pixel size", error);
        }
      }
    },
    { immediate: true }
  );

  onScopeDispose(() => {
    generation += 1;
  });

  return pixelSize;
}
