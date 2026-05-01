type ViewportLike = {
  innerHeight: number;
  visualViewport?: {
    height: number;
  } | null;
};

type DocumentLike = {
  documentElement: {
    style: {
      setProperty: (name: string, value: string) => void;
    };
  };
};

export function getPreferredViewportHeight(viewport: ViewportLike): number {
  const visualViewportHeight = viewport.visualViewport?.height;

  if (Number.isFinite(visualViewportHeight) && visualViewportHeight && visualViewportHeight > 0) {
    return visualViewportHeight;
  }

  return viewport.innerHeight;
}

export function syncViewportHeightVar(documentLike: DocumentLike, viewport: ViewportLike): string {
  const value = `${Math.round(getPreferredViewportHeight(viewport))}px`;
  documentLike.documentElement.style.setProperty("--app-viewport-height", value);
  return value;
}
