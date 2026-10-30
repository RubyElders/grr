export type PaneName = "commits" | "files" | "diff";

export function paneOf(target: EventTarget | null): PaneName | null {
  if (!(target instanceof Element)) return null;
  const name = target.closest<HTMLElement>("[data-pane]")?.dataset.pane;
  return name === "commits" || name === "files" || name === "diff" ? name : null;
}

export function focusPane(scope: ParentNode | null, name: PaneName): boolean {
  const pane = scope?.querySelector<HTMLElement>(`[data-pane="${name}"]`);
  pane?.focus({ preventScroll: true });
  return pane != null;
}

export function focusFirstPane(scope: ParentNode | null): void {
  scope?.querySelector<HTMLElement>("[data-pane]")?.focus({ preventScroll: true });
}

export function cyclePane(scope: ParentNode | null, current: PaneName | null, step: 1 | -1): void {
  const panes = [...scope?.querySelectorAll<HTMLElement>("[data-pane]") ?? []];
  if (panes.length === 0) return;
  const index = panes.findIndex((pane) => pane.dataset.pane === current);
  const next = index < 0 ? (step > 0 ? 0 : panes.length - 1) : (index + step + panes.length) % panes.length;
  panes[next]!.focus({ preventScroll: true });
}

export function focusPaneFilter(scope: ParentNode | null, name: PaneName): boolean {
  const input = scope?.querySelector<HTMLInputElement>(`[data-pane="${name}"] input[type="search"]`);
  input?.focus();
  input?.select();
  return input != null;
}
