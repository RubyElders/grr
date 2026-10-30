import { useSearchField } from "../useSearchField";
import { shortcutTitle } from "../shortcuts";
import { Icon } from "./Icon";
import styles from "./FindPopover.module.css";

interface FindPopoverProps {
  query: string;
  activeIndex: number;
  matchCount: number;
  onQuery(query: string): void;
  onPrevious(): void;
  onNext(): void;
  onClose(): void;
}

export function FindPopover(props: FindPopoverProps) {
  const search = useSearchField({
    value: props.query, onChange: props.onQuery, resultsPane: "diff", autoFocus: true, onDismiss: props.onClose,
  });

  const result = props.query.length === 0
    ? "Type to search"
    : props.matchCount === 0
      ? "No results"
      : `${props.activeIndex + 1} of ${props.matchCount}`;

  return (
    <section class={styles.popover} role="search" aria-label="Find in diff">
      <span class={styles.searchIcon}><Icon name="search" /></span>
      <input
        {...search.inputProps}
        data-find-input
        aria-label="Find in code"
        placeholder="Find in code"
      />
      <span class={styles.result} role="status">{result}</span>
      <button type="button" disabled={props.matchCount === 0} aria-label="Previous match" title={shortcutTitle("previousMatch")} onClick={props.onPrevious}>Prev</button>
      <button type="button" disabled={props.matchCount === 0} aria-label="Next match" title={shortcutTitle("nextMatch")} onClick={props.onNext}>Next</button>
      <button type="button" class={styles.close} aria-label="Close find" title={shortcutTitle("dismiss")} onClick={search.cancel}><Icon name="close" /></button>
    </section>
  );
}
