import type { MergedPullRequest, PullRequest } from "./types";

declare global {
  interface Window {
    __PR_DATA_PROMISE__?: Promise<{
      openPrs: PullRequest[];
      mergedPrs: MergedPullRequest[];
    } | null>;
  }
}

export {};
