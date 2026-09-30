import { useEffect, useRef } from "preact/hooks";
import { SHORTCUT_CATEGORIES, SHORTCUTS } from "../shortcuts";
import { Icon } from "./Icon";
import logoUrl from "../../../icons/icon.png";
import styles from "./ShortcutHelp.module.css";

export function ShortcutHelp({ onClose }: { onClose(): void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);

  return (
    <div class={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section class={styles.modal} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <header class={styles.header}>
          <div class={styles.heading}>
            <img src={logoUrl} alt="grr" />
            <div><h2>Keyboard shortcuts</h2><p>grr - local Git review</p></div>
          </div>
          <button ref={close} type="button" aria-label="Close keyboard shortcuts" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div class={styles.groups}>
          {SHORTCUT_CATEGORIES.map((category) => (
            <section class={styles.group} key={category} aria-labelledby={`shortcut-${category}`}>
              <h3 id={`shortcut-${category}`}>{category}</h3>
              <dl>
                {SHORTCUTS.filter((shortcut) => shortcut.category === category).map((shortcut) => (
                  <div class={styles.row} key={shortcut.id}>
                    <dt>{shortcut.description}</dt>
                    <dd>{shortcut.chords.map((item) => <kbd key={item.id}>{item.display}</kbd>)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
