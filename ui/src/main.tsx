import { render } from "preact";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ReviewApp } from "./App";
import { startReviewWindow } from "./startup";
import { resolveWindowChrome } from "./windowChrome/bridge";
import "./global.css";

const root = document.getElementById("app")!;
void startReviewWindow({
  resolveChrome: resolveWindowChrome,
  renderReview: (chromeMode) => render(<ReviewApp chromeMode={chromeMode} />, root),
  renderError: (error) => render(<main><div role="alert"><h1>Could not start review</h1><p>{String(error)}</p></div></main>, root),
  reveal: () => { if (isTauri()) return getCurrentWindow().show(); },
});
