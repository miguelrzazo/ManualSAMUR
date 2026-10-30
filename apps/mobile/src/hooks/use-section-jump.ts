import { useCallback, useEffect, useMemo, useRef } from "react";
import type { SectionList } from "react-native";
import { createSectionJump } from "../section-jump-logic.ts";

/** Shared by Codes and Vademécum, including jumps to unrendered sections. */
export function useSectionJump<ItemT, SectionT>(
  listRef: React.RefObject<SectionList<ItemT, SectionT> | null>,
  options: { animated?: boolean } = {},
) {
  const animated = options.animated ?? true;
  const controller = useRef<ReturnType<typeof createSectionJump> | null>(null);
  useEffect(() => {
    const jump = createSectionJump(
      (sectionIndex) => listRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, viewPosition: 0, animated }),
      (y) => listRef.current?.getScrollResponder()?.scrollTo({ y, animated: false }),
      (retry) => {
        const timer = setTimeout(retry, 100);
        return () => clearTimeout(timer);
      },
    );
    controller.current = jump;
    // A retry must not outlive its list (tab changes, searches, navigation).
    return () => {
      jump.resetSections();
      controller.current = null;
    };
  }, [animated, listRef]);

  const jumpTo = useCallback((sectionIndex: number) => controller.current?.jumpTo(sectionIndex), []);
  const onScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    controller.current?.onScrollToIndexFailed(info);
  }, []);
  const resetSections = useCallback(() => controller.current?.resetSections(), []);
  return useMemo(() => ({ jumpTo, onScrollToIndexFailed, resetSections }), [jumpTo, onScrollToIndexFailed, resetSections]);
}
