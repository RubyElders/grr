import { useLayoutEffect, useRef } from "preact/hooks";
import { focusPane, paneOf, type PaneName } from "./panes";
import type { ReviewView } from "./windowChrome/model";

export type FocusOwner = "panes" | "comment" | "find" | "picker" | "help";

const owners: Record<Exclude<FocusOwner, "panes">, string> = {
  comment: "[role='group'][aria-label^='Comment on ']",
  find: "[role='search']",
  picker: "[role='dialog'][aria-label='Choose commits']",
  help: "[role='dialog'][aria-label='Keyboard shortcuts']",
};

export function usePaneFocus(view: ReviewView, owner: FocusOwner, enabled: boolean): void {
  const remembered = useRef<Partial<Record<ReviewView, PaneName>>>({});
  const lastView = useRef(view);
  const context = useRef({ view, owner, enabled });
  context.current = { view, owner, enabled };

  const reconcile = () => {
    const current = context.current;
    if (!current.enabled) return;
    const scope = document.querySelector(`[data-view='${current.view}']`);
    if (lastView.current !== current.view) {
      const name = paneOf(document.activeElement);
      if (name) remembered.current[lastView.current] = name;
      lastView.current = current.view;
      if (current.owner === "panes") {
        const previous = remembered.current[current.view];
        if (previous && focusPane(scope ?? null, previous)) return;
        scope?.querySelector<HTMLElement>("[data-pane]")?.focus({ preventScroll: true });
      }
    }
    const overlay = current.owner === "panes" ? scope?.querySelector<HTMLElement>("[role='search']")
      : document.querySelector<HTMLElement>(owners[current.owner]);
    if (overlay) {
      const name = paneOf(overlay);
      if (name) remembered.current[current.view] = name;
      if (current.owner === "find") remembered.current[current.view] = "diff";
      if (overlay.contains(document.activeElement)) return;
      const target = overlay.hasAttribute("tabindex") ? overlay
        : overlay.querySelector<HTMLElement>("textarea, input, button:not(:disabled)");
      target?.focus({ preventScroll: true });
      return;
    }
    const active = document.activeElement;
    const name = scope?.contains(active) ? paneOf(active) : null;
    const pane = name ? active?.closest<HTMLElement>("[data-pane]") : null;
    if (name) remembered.current[current.view] = name;
    if (pane && (active === pane || active?.matches("input[type='search']"))) return;
    if (name && focusPane(scope ?? null, name)) return;
    const previous = remembered.current[current.view];
    if (previous && focusPane(scope ?? null, previous)) return;
    scope?.querySelector<HTMLElement>("[data-pane]")?.focus({ preventScroll: true });
  };

  useLayoutEffect(reconcile);
  useLayoutEffect(() => {
    let mounted = true;
    const onPointer = (event: MouseEvent) => {
      if (context.current.owner !== "panes" || !context.current.enabled || !(event.target instanceof Element)) return;
      const scope = document.querySelector(`[data-view='${context.current.view}']`);
      if (!scope?.contains(event.target) || scope.querySelector("[role='search']") || event.target.closest("input[type='search']")) return;
      const name = paneOf(event.target);
      if (!name) return;
      if (event.target.closest("button, a, [tabindex]:not([data-pane])")) event.preventDefault();
      focusPane(scope, name);
    };
    const onBlur = () => queueMicrotask(() => { if (mounted) reconcile(); });
    document.addEventListener("focusin", reconcile);
    document.addEventListener("focusout", onBlur);
    document.addEventListener("mousedown", onPointer, true);
    return () => {
      mounted = false;
      document.removeEventListener("focusin", reconcile);
      document.removeEventListener("focusout", onBlur);
      document.removeEventListener("mousedown", onPointer, true);
    };
  }, []);
}
