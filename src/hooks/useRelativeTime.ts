import { useEffect, useMemo, useState } from "react";

function formatRelativeTime(targetDate: Date, referenceDate: Date): string {
  const diffMs = referenceDate.getTime() - targetDate.getTime();

  if (diffMs < 0) {
    return "just now";
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function nextRefreshInterval(target: Date, reference: Date): number {
  const diffMs = reference.getTime() - target.getTime();

  if (diffMs < 0) {
    return 30_000;
  }

  const diffMinutes = diffMs / 1000 / 60;
  if (diffMinutes < 10) {
    return 30_000;
  }

  return 5 * 60_000;
}

export function useRelativeTime(isoDate?: string | null): string {
  const targetDate = useMemo(() => {
    if (!isoDate) {
      return null;
    }

    const date = new Date(isoDate);
    return Number.isNaN(date.getTime()) ? null : date;
  }, [isoDate]);

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!targetDate || typeof window === "undefined") {
      return undefined;
    }

    let timeoutId: number | undefined;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());

    const schedule = () => {
      const interval = nextRefreshInterval(targetDate, new Date());
      timeoutId = window.setTimeout(() => {
        setNow(new Date());
        schedule();
      }, interval);
    };

    schedule();

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [targetDate]);

  if (!targetDate) {
    return "–";
  }

  return formatRelativeTime(targetDate, now);
}

export function formatAbsoluteDate(isoDate?: string | null): string {
  if (!isoDate) {
    return "–";
  }
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "–";
  }
  return date.toLocaleString();
}
