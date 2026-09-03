import { useEffect, useRef } from "preact/hooks";
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
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const result = props.query.length === 0
    ? "Type to search"
    : props.matchCount === 0
      ? "No results"
      : `${props.activeIndex + 1} of ${props.matchCount}`;

  return (
    <section class={styles.popover} role="search" aria-label="Find in diff">
      <span class={styles.searchIcon}><Icon name="search" /></span>
      <input
        ref={input}
        data-find-input
        type="search"
        aria-label="Find in code"
        placeholder="Find in code"
        value={props.query}
        onInput={(event) => props.onQuery(event.currentTarget.value)}
      />
      <span class={styles.result} role="status">{result}</span>
      <button type="button" disabled={props.matchCount === 0} aria-label="Previous match" title={shortcutTitle("previousMatch")} onClick={props.onPrevious}>Prev</button>
      <button type="button" disabled={props.matchCount === 0} aria-label="Next match" title={shortcutTitle("nextMatch")} onClick={props.onNext}>Next</button>
      <button type="button" class={styles.close} aria-label="Close find" title={shortcutTitle("dismiss")} onClick={props.onClose}><Icon name="close" /></button>
    </section>
  );
}
