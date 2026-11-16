export function visualViewportBounds(viewport: { height: number; offsetTop: number } | null, fallbackHeight: number): { height: number; top: number } {
  const fallback = Number.isFinite(fallbackHeight) && fallbackHeight > 0 ? fallbackHeight : 768;
  if (!viewport || !Number.isFinite(viewport.height) || viewport.height <= 0 || !Number.isFinite(viewport.offsetTop) || viewport.offsetTop < 0) return { height: fallback, top: 0 };
  const height = Math.min(fallback,viewport.height);
  return { height, top: Math.min(fallback-height,viewport.offsetTop) };
}
export function watchVisualViewport(): () => void {
  const viewport = window.visualViewport;
  const update = () => {
    const bounds=visualViewportBounds(viewport,window.innerHeight);
    document.documentElement.style.setProperty('--visible-height',`${bounds.height}px`);
    document.documentElement.style.setProperty('--visible-top',`${bounds.top}px`);
  };
  update();viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);window.addEventListener('resize',update);
  return ()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
}
