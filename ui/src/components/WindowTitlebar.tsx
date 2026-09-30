import type { ComponentChildren } from "preact";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { shortcutTitle } from "../shortcuts";
import { Icon } from "./Icon";
import styles from "./WindowTitlebar.module.css";

interface WindowTitlebarProps {
  children?: ComponentChildren;
  sidebarOpen?: boolean;
  onToggleSidebar?(): void;
  onHelp?(): void;
  onClose(): void;
}

export function WindowTitlebar({ children, sidebarOpen, onToggleSidebar, onHelp, onClose }: WindowTitlebarProps) {
  const drag = (event: MouseEvent) => {
    if (event.button !== 0 || (event.target as Element).closest("button, input, label, a")) return;
    const window = getCurrentWindow();
    void (event.detail === 2 ? window.toggleMaximize() : window.startDragging());
  };
  return (
    <header class={styles.titlebar} onMouseDown={drag}>
      <div class={styles.side}>
        {sidebarOpen === undefined ? null : (
          <button
            type="button"
            class={styles.tool}
            aria-label={sidebarOpen ? "Hide file sidebar" : "Show file sidebar"}
            aria-pressed={sidebarOpen}
            title={`Toggle file sidebar (${shortcutTitle("toggleSidebar")})`}
            onClick={onToggleSidebar}
          ><Icon name="sidebar" /></button>
        )}
      </div>
      <div class={styles.center}>{children}</div>
      <div class={`${styles.side} ${styles.right}`}>
        {onHelp ? <button type="button" class={styles.tool} aria-label="Show keyboard shortcuts" title={`Keyboard shortcuts (${shortcutTitle("help")})`} onClick={onHelp}>?</button> : null}
        <button type="button" class={styles.windowButton} aria-label="Minimize window" onClick={() => void getCurrentWindow().minimize()}><Icon name="minimize" /></button>
        <button type="button" class={styles.windowButton} aria-label="Maximize window" onClick={() => void getCurrentWindow().toggleMaximize()}><Icon name="maximize" /></button>
        <button type="button" class={`${styles.windowButton} ${styles.close}`} aria-label="Close window" onClick={onClose}><Icon name="close" /></button>
      </div>
    </header>
  );
}
