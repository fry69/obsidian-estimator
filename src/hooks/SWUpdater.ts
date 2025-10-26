// src/hooks/SWUpdater.ts
import { useEffect, useRef } from "react";
import { registerSW } from "virtual:pwa-register";

export default function SWUpdater() {
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    // Start the SW registration and polling on mount
    const stop = () => {
      stopped.current = true;
      if (timeoutId.current) {
        clearTimeout(timeoutId.current);
        timeoutId.current = null;
      }
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };

    const regRef: { current: ServiceWorkerRegistration | null } = {
      current: null,
    };

    const initialDelay = 60 * 60_000; // 1 min for testing; use 60 * 60_000 in prod
    const maxDelay = 30 * 60_000; // cap backoff at 30 min
    const jitterMs = 500;

    let delay = initialDelay;
    let failures = 0;
    let inFlight = false;

    const schedule = () => {
      if (stopped.current) return;
      const jitter = Math.floor((Math.random() - 0.5) * 2 * jitterMs);
      timeoutId.current = setTimeout(
        () => {
          const ric = window.requestIdleCallback as
            | ((cb: () => void, opts?: { timeout?: number }) => number)
            | undefined;
          if (ric) {
            ric(() => tick(), { timeout: 3000 });
          } else {
            // fallback if RIC not available
            setTimeout(() => tick(), 0);
          }
        },
        Math.max(0, delay + jitter),
      );
    };

    const tick = () => {
      if (stopped.current) return;
      if (inFlight) return schedule();
      if (document.visibilityState !== "visible") return schedule();
      if (!regRef.current) return schedule();

      inFlight = true;

      (async () => {
        try {
          if (!navigator.onLine) {
            console.info("[SW] update skipped (offline)");
            return;
          }

          if (!regRef.current) return;

          console.log("[SW] checking for update (timer)");
          await regRef.current.update();

          failures = 0;
          delay = initialDelay;
        } catch (err) {
          failures++;
          delay = Math.min(maxDelay, initialDelay * 2 ** failures);
          console.info(
            "[SW] update failed; backing off to",
            Math.round(delay / 1000),
            "s",
            "-",
            err instanceof Error ? err.message : String(err),
          );
        } finally {
          inFlight = false;
          schedule();
        }
      })();
    };

    // also poke on visibility/online (fast-path, no backoff change)
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (!regRef.current || inFlight) return;
      console.log("[SW] checking for update (visibility/online)");
      void regRef.current.update().catch(() => {});
    };

    // Register the SW (once) and start the loop
    const unregister = registerSW({
      immediate: true,
      onRegisteredSW(_url, reg) {
        console.debug("[SW] registered");
        if (!reg) return;
        regRef.current = reg;
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("online", onVisible);
        schedule();
      },
      onRegisterError(err) {
        console.error("[SW] register error:", err);
      },
    });

    return () => {
      // Cleanup on unmount / HMR
      stop();
      // If you want to completely unregister on hot reloads in dev:
      unregister?.(); // optional
    };
  }, []);

  return null; // no UI
}
