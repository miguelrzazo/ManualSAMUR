/** Recover a SectionList jump after virtualization has not yet measured its target. */
export function createSectionJump(
  scrollToSection: (sectionIndex: number) => void,
  scrollToOffset: (offset: number) => void,
  schedule: (retry: () => void) => () => void,
) {
  let pending: { sectionIndex: number; attempts: number } | null = null;
  let cancelRetry: (() => void) | null = null;

  function resetSections() {
    cancelRetry?.();
    cancelRetry = null;
    pending = null;
  }

  function attempt() {
    cancelRetry = null;
    const target = pending;
    if (!target) return;
    target.attempts += 1;
    // RN calls onScrollToIndexFailed synchronously if it cannot reach the cell.
    // No failure means it accepted the exact jump; there is nothing left to retry.
    scrollToSection(target.sectionIndex);
    if (!cancelRetry) pending = null;
  }

  return {
    jumpTo(sectionIndex: number) {
      resetSections();
      if (!Number.isInteger(sectionIndex) || sectionIndex < 0) return;
      pending = { sectionIndex, attempts: 0 };
      attempt();
    },
    onScrollToIndexFailed(info: { index: number; averageItemLength: number }) {
      if (!pending) return;
      // Use RN's flattened index (including section headers/footers), never the
      // section index or a header child's parent-relative onLayout.y.
      scrollToOffset(Math.max(0, info.index * info.averageItemLength));
      cancelRetry?.();
      // Allow native layout and the virtualized render window to catch up. Bound
      // the work if the list cannot make progress; a new tap starts a fresh jump.
      if (pending.attempts < 20) cancelRetry = schedule(attempt);
      else resetSections();
    },
    resetSections,
  };
}
