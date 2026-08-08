import { render } from "preact";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ReviewApp } from "./App";
import { runAfterRender } from "./startup";
import "./global.css";

render(<ReviewApp />, document.getElementById("app")!);

if (isTauri()) {
  runAfterRender(() => getCurrentWindow().show());
}
