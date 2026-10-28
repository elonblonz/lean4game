/**
 * Keep the CSS variable `--app-height` on `<html>` equal to the visible height of the
 * window. On phones, `100vh` includes the area behind the browser's URL bar and ignores
 * the on-screen keyboard, which would hide the command line at the bottom of the page.
 */
export function trackAppHeight() {
  const vv = window.visualViewport
  const update = () => {
    // Multiply by `scale` so that pinch-zooming doesn't shrink the layout.
    const height = vv ? vv.height * vv.scale : window.innerHeight
    document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`)
    // iOS scrolls the page up when the keyboard opens; the layout already fits, so undo that.
    if (vv && vv.scale === 1 && window.scrollY !== 0) {
      window.scrollTo(0, 0)
    }
  }
  update()
  vv?.addEventListener('resize', update)
  window.addEventListener('resize', update)
}
