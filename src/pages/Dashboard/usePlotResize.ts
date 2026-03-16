import { useRef, useEffect } from 'react';

/**
 * Returns a ref to attach to a wrapper div.
 * Whenever that div's size changes (e.g. card maximise / restore) we wait for
 * the browser to commit the new layout (two rAF ticks) then dispatch a
 * synthetic 'resize' on window so every react-plotly.js instance with
 * `useResizeHandler` redraws itself at the correct dimensions.
 */
export function usePlotResize() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let rafId: number;

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      // Two rAF ticks: first lets the browser commit the CSS grid reflow,
      // second ensures paint has happened before Plotly measures the container.
      rafId = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event('resize'));
        });
      });
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);

  return ref;
}
