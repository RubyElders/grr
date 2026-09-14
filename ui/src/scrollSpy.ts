export interface FilePosition {
  id: string;
  top: number;
}

export function fileAtViewportTop(
  positions: readonly FilePosition[],
  viewportTop: number,
  atScrollEnd: boolean,
): string | null {
  if (positions.length === 0) return null;
  const index = fileIndexAtViewportTop(positions.length, (candidate) => positions[candidate]!.top, viewportTop, atScrollEnd);
  return index === null ? null : positions[index]?.id ?? null;
}

export function fileIndexAtViewportTop(
  fileCount: number,
  topAt: (index: number) => number,
  viewportTop: number,
  atScrollEnd: boolean,
): number | null {
  if (fileCount === 0) return null;
  if (atScrollEnd) return fileCount - 1;
  const activationLine = viewportTop + 16;
  let lower = 0;
  let upper = fileCount;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (topAt(middle) <= activationLine) lower = middle + 1;
    else upper = middle;
  }
  return Math.max(0, lower - 1);
}
