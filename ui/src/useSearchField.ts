import { useLayoutEffect, useRef } from "preact/hooks";
import { focusPane, type PaneName } from "./panes";
import { matchesShortcut } from "./shortcuts";

interface SearchFieldOptions {
  value: string;
  onChange(value: string): void;
  resultsPane?: PaneName;
  autoFocus?: boolean;
  onDismiss?(): void;
}

export function useSearchField({ value, onChange, resultsPane, autoFocus = false, onDismiss }: SearchFieldOptions) {
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (!autoFocus) return;
    input.current?.focus();
    input.current?.select();
  }, [autoFocus]);

  const focusResults = () => {
    const element = input.current;
    if (resultsPane) focusPane(element?.closest("[data-view]") ?? null, resultsPane);
    else element?.closest<HTMLElement>("[data-pane]")?.focus({ preventScroll: true });
  };
  const cancel = () => {
    if (value !== "") onChange("");
    focusResults();
    onDismiss?.();
  };
  const update = (event: Event) => onChange((event.currentTarget as HTMLInputElement).value);

  return {
    cancel,
    inputProps: {
      ref: input,
      type: "search" as const,
      value,
      onInput: update,
      onsearch: update,
      onKeyDown: (event: KeyboardEvent) => {
        if (event.isComposing) return;
        const accept = matchesShortcut(event, "searchResults");
        const dismiss = matchesShortcut(event, "dismiss");
        if (!accept && !dismiss) return;
        event.preventDefault();
        event.stopPropagation();
        if (dismiss) cancel();
        else focusResults();
      },
    },
  };
}
