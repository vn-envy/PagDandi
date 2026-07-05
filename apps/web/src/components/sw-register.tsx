"use client";

import { useEffect } from "react";

/** Registers the offline service worker — app shell + Trek Pack in airplane mode. */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline caching is progressive enhancement */
      });
    }
  }, []);
  return null;
}
