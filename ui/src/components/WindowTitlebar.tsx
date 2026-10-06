import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { shortcutTitle } from "../shortcuts";
import { showWindowMenu } from "../windowChrome/bridge";
import { Icon } from "./Icon";
import styles from "./WindowTitlebar.module.css";

interface WindowTitlebarProps {
  children?: ComponentChildren;
  variant?: "html" | "windows";
  sidebarOpen?: boolean;
  onToggleSidebar?(): void;
  onHelp?(): void;
  onClose(): void;
}

export function WindowTitlebar({ children, variant = "html", sidebarOpen, onToggleSidebar, onHelp, onClose }: WindowTitlebarProps) {
  const windows = variant === "windows";
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!windows) return;
    const activate = () => setActive(true);
    const deactivate = () => setActive(false);
    window.addEventListener("focus", activate);
    window.addEventListener("blur", deactivate);
    return () => {
      window.removeEventListener("focus", activate);
      window.removeEventListener("blur", deactivate);
    };
  }, [windows]);
  const drag = (event: MouseEvent) => {
    if (event.button !== 0 || (event.target as Element).closest("button, input, label, a")) return;
    const window = getCurrentWindow();
    void (event.detail === 2 ? window.toggleMaximize() : window.startDragging());
  };
  const openWindowMenu = (event: MouseEvent) => {
    if ((event.target as Element).closest("button, input, label, a")) return;
    event.preventDefault();
    void showWindowMenu();
  };
  return (
    <header
      class={`${styles.titlebar} ${windows ? styles.windows : ""}`}
      data-inactive={windows && !active ? "true" : undefined}
      onMouseDown={drag}
      onContextMenu={windows ? openWindowMenu : undefined}
    >
      <div class={styles.side}>
        {sidebarOpen === undefined ? null : (
          <button
            type="button"
            class={styles.tool}
            aria-label={sidebarOpen ? "Hide file sidebar" : "Show file sidebar"}
            aria-pressed={sidebarOpen}
            title={`Toggle file sidebar (${shortcutTitle("toggleSidebar")})`}
            onClick={onToggleSidebar}
          >{windows ? <span class={styles.glyph} aria-hidden="true">{"\uE90C"}</span> : <Icon name="sidebar" />}</button>
        )}
      </div>
      <div class={styles.center}>{children}</div>
      <div class={`${styles.side} ${styles.right}`}>
        {onHelp ? <button type="button" class={styles.tool} aria-label="Show keyboard shortcuts" title={`Keyboard shortcuts (${shortcutTitle("help")})`} onClick={onHelp}>{windows ? <span class={styles.glyph} aria-hidden="true">{"\uE897"}</span> : "?"}</button> : null}
        {windows ? <CaptionButtons onClose={onClose} /> : <>
          <button type="button" class={styles.windowButton} aria-label="Minimize window" onClick={() => void getCurrentWindow().minimize()}><Icon name="minimize" /></button>
          <button type="button" class={styles.windowButton} aria-label="Maximize window" onClick={() => void getCurrentWindow().toggleMaximize()}><Icon name="maximize" /></button>
          <button type="button" class={`${styles.windowButton} ${styles.close}`} aria-label="Close window" onClick={onClose}><Icon name="close" /></button>
        </>}
      </div>
    </header>
  );
}

function CaptionButtons({ onClose }: { onClose(): void }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const window = getCurrentWindow();
    let disposed = false;
    const sync = () => window.isMaximized().then(
      (value) => { if (!disposed) setMaximized(value); },
      () => undefined,
    );
    void sync();
    const unlisten = window.onResized(() => void sync());
    return () => {
      disposed = true;
      void unlisten.then((stop) => stop(), () => undefined);
    };
  }, []);
  return (
    <div class={styles.captions}>
      <button type="button" class={styles.caption} aria-label="Minimize window" onClick={() => void getCurrentWindow().minimize()}>
        <span aria-hidden="true">{"\uE921"}</span>
      </button>
      <button type="button" class={styles.caption} aria-label={maximized ? "Restore window" : "Maximize window"} onClick={() => void getCurrentWindow().toggleMaximize()}>
        <span aria-hidden="true">{maximized ? "\uE923" : "\uE922"}</span>
      </button>
      <button type="button" class={`${styles.caption} ${styles.captionClose}`} aria-label="Close window" onClick={onClose}>
        <span aria-hidden="true">{"\uE8BB"}</span>
      </button>
    </div>
  );
}
