import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import type { ReviewData } from "../types";
import { listenWindowChromeActions, updateWindowChrome } from "./bridge";
import { windowChromeCapabilities, windowChromeUpdate, type WindowChromeAction, type WindowChromeKind } from "./model";

export function useWindowChrome(
  kind: WindowChromeKind,
  data: ReviewData | null,
  disabled: boolean,
  onAction: (action: WindowChromeAction) => void,
  onError: (error: unknown) => void,
): void {
  const callbacks = useRef({ onAction, onError });
  useLayoutEffect(() => { callbacks.current = { onAction, onError }; });

  useEffect(() => {
    if (!windowChromeCapabilities(kind).nativeHeader) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenWindowChromeActions((action) => {
      if (!disposed) callbacks.current.onAction(action);
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch((error: unknown) => {
      if (!disposed) callbacks.current.onError(error);
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [kind]);

  useEffect(() => {
    if (!windowChromeCapabilities(kind).nativeHeader || !data) return;
    let disposed = false;
    void updateWindowChrome(windowChromeUpdate(data, disabled)).catch((error: unknown) => {
      if (!disposed) callbacks.current.onError(error);
    });
    return () => { disposed = true; };
  }, [kind, data, disabled]);
}
