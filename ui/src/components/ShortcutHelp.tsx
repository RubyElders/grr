import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "preact/hooks";
import { SHORTCUT_CATEGORIES, SHORTCUTS, shortcutChords } from "../shortcuts";
import { Icon } from "./Icon";
import logoUrl from "../../../src-tauri/icons/icon.png";
import { version } from "../../../package.json";
import styles from "./ShortcutHelp.module.css";

export function ShortcutHelp({ onClose }: { onClose(): void }) {
  const [tab, setTab] = useState<"shortcuts" | "about">("shortcuts");
  const [linkError, setLinkError] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);

  return (
    <div class={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section class={styles.modal} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <header class={styles.header}>
          <div class={styles.heading}>
            <img src={logoUrl} alt="grr" />
            <h2>grr <span class={styles.version}>v{version}</span></h2><p>Git Robust Review</p>
          </div>
          <button ref={close} type="button" aria-label="Close keyboard shortcuts" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div class={styles.tabs} role="tablist" aria-label="Help">
          {(["shortcuts", "about"] as const).map((item) => <button type="button" role="tab" id={`help-tab-${item}`} aria-controls={`help-panel-${item}`} aria-selected={tab === item} tabIndex={tab === item ? 0 : -1} onClick={() => setTab(item)} onKeyDown={(event) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              const next = event.key === "Home" ? "shortcuts" : event.key === "End" ? "about" : tab === "about" ? "shortcuts" : "about";
              setTab(next);
              document.getElementById(`help-tab-${next}`)?.focus();
            }
          }}>{item === "shortcuts" ? "Keyboard shortcuts" : "About grr"}</button>)}
        </div>
        <div class={styles.groups} role="tabpanel" id="help-panel-shortcuts" aria-labelledby="help-tab-shortcuts" tabIndex={0} hidden={tab !== "shortcuts"}>
          <p class={styles.shortcutHint}>Keys in one badge are pressed together. "or" separates alternative shortcuts.</p>
          {SHORTCUT_CATEGORIES.map((category) => (
            <section class={`${styles.group} ${category === "Navigation" ? styles.navigation : category === "Window" ? styles.window : ""}`} key={category} aria-labelledby={`shortcut-${category}`}>
              <h3 id={`shortcut-${category}`}>{category}</h3>
              <dl>
                {SHORTCUTS.filter((shortcut) => shortcut.category === category).map((shortcut) => (
                  <div class={styles.row} key={shortcut.id}>
                    <dt>{shortcut.description}</dt>
                    <dd>{shortcutChords(shortcut.id).map((item, index) => <span class={styles.alternative} key={item.id}>{index > 0 ? <span class={styles.or}>or</span> : null}<kbd aria-label={item.label}>{item.display}</kbd></span>)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div class={styles.about} role="tabpanel" id="help-panel-about" aria-labelledby="help-tab-about" tabIndex={0} hidden={tab !== "about"}>
          <section class={styles.releaseCard}>
            <div class={styles.cardHeading}><h3>Releases & updates</h3><span class={styles.previewBadge}>Not available yet</span></div>
            <p>Release news and upgrade options will appear here.</p>
            <div class={styles.updateRow}><span>Installed version</span><strong>{version}</strong></div>
            <button type="button" disabled>Check for updates</button>
            <small>Update checking is not available in this version.</small>
          </section>
          <div class={styles.facts}><span>Built with <strong>Rust + Tauri + Preact</strong></span><span>Built by <strong><a href="https://rubyelders.com" target="_blank" rel="noopener noreferrer" onClick={(event) => {
            if (!isTauri()) return;
            event.preventDefault();
            setLinkError(false);
            void invoke("open_author_website").catch(() => setLinkError(true));
          }}>Ruby Elders</a></strong></span></div>
          {linkError ? <p class={styles.linkError} role="alert">Could not open the browser. Visit rubyelders.com.</p> : null}
        </div>
      </section>
    </div>
  );
}
