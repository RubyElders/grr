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
  if (atScrollEnd) return positions.at(-1)?.id ?? null;

  const activationLine = viewportTop + 16;
  let active = positions[0]?.id ?? null;
  for (const position of positions) {
    if (position.top > activationLine) break;
    active = position.id;
  }
  return active;
}
