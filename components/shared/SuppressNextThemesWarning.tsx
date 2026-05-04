"use client";

import { useEffect } from "react";

// next-themes 0.4.6 renders a <script> tag inside a React component for
// theme detection (FOUC prevention). React 19 added a warning for this
// pattern, but the script does execute correctly via dangerouslySetInnerHTML.
// This component silences that specific spurious warning until next-themes
// ships a React 19–compatible fix.
export function SuppressNextThemesWarning() {
  useEffect(() => {
    const original = console.error;
    console.error = (...args: unknown[]) => {
      if (
        typeof args[0] === "string" &&
        args[0].includes("Encountered a script tag while rendering")
      ) {
        return;
      }
      original(...args);
    };
    return () => {
      console.error = original;
    };
  }, []);

  return null;
}
