export type IconFocus = {
  area: string;
  id: string;
  pageIndex: number;
  folderId?: string | null;
};

export function matchesIconFocus(
  focus: IconFocus | null | undefined,
  area: string,
  itemId: string,
  pageIndex: number,
  folderId: string | null = null,
): boolean {
  return Boolean(
    focus &&
      focus.area === area &&
      focus.id === itemId &&
      focus.pageIndex === pageIndex &&
      (area !== "folder" || focus.folderId === folderId)
  );
}
