import * as React from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useAtom } from 'jotai';
import { createTheme, ThemeProvider } from '@mui/material/styles';

import '@fontsource-variable/inter';

// The global stylesheets, in this order (later ones win). Components import theirs too, which
// doesn't change the order: a stylesheet goes where it is first imported.
import './css/tokens.css';
import './css/reset.css';
import './css/app.css';
import './css/error_page.css';
import "./css/infoview.css"
import "./css/landing_page.css"
import './css/layout.css';
import './css/level.css';
import "./css/popup.css"
import "./css/tab_bar.css"
import "./css/typewriter.css"
import "./css/welcome.css"
import "./css/world_tree.css"
import "./css/markdown.css"
import "./css/inventory.css"
import "./css/learning.css"
import "./css/written_proof.css"
// The look (colours, shapes, motion) over the layout above: last, so it wins.
import "./css/look.css"

import i18n from './i18n';
import { Popup } from './components/popup/popup';
import { leanMonacoAtom, leanMonacoOptionsAtom } from './store/lean-atoms';
import { LeanMonaco } from 'lean4monaco';
import * as monaco from 'monaco-editor';
import { darkModeAtom, preferencesAtom, reducedMotionAtom } from './store/preferences-atoms';
import { gameInfoAtom } from './store/query-atoms';
import { hashSegmentsAtom } from './store/location-atoms';
import { langNavOpenAtom, navOpenAtom } from './store/navigation-atoms';
import { popupAtom } from './store/popup-atoms';

/** Colours that MUI and Monaco need as literals. Keep in sync with the palettes in `css/tokens.css`. */
const DARK_BACKGROUND = '#0f1115'
const DARK_SURFACE = '#16181d'
const DARK_TEXT = '#ececf1'
const PRIMARY = '#5b5bd6'
const DARK_PRIMARY = '#6363e0'
const FONT = '"Inter Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

function App({ children }: { children?: React.ReactNode }) {

  const [leanMonaco, setLeanMonaco] = useAtom(leanMonacoAtom)
  const [leanMonacoOptions] = useAtom(leanMonacoOptionsAtom)
  const [preferences] = useAtom(preferencesAtom)
  const [darkMode] = useAtom(darkModeAtom)

  useEffect(() => {
    i18n.changeLanguage(preferences.language)
  }, [preferences.language])

  // Close the menus after navigating (they are global atoms and would stay open).
  const [hashSegments] = useAtom(hashSegmentsAtom)
  const [, setNavOpen] = useAtom(navOpenAtom)
  const [, setLangNavOpen] = useAtom(langNavOpenAtom)
  useEffect(() => {
    setNavOpen(false)
    setLangNavOpen(false)
  }, [hashSegments.join('/')])

  // Escape closes an open menu (when no popup is open: that closes first).
  const [navOpen] = useAtom(navOpenAtom)
  const [langNavOpen] = useAtom(langNavOpenAtom)
  const [popup] = useAtom(popupAtom)
  useEffect(() => {
    if (!(navOpen || langNavOpen) || popup) return
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return
      setNavOpen(false)
      setLangNavOpen(false)
      document.getElementById('menu-btn')?.focus()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [navOpen, langNavOpen, popup])

  // Name the browser tab after the game being played.
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)
  useEffect(() => {
    if (gameInfo?.title) document.title = gameInfo.title
  }, [gameInfo?.title])

  // You need to start one `LeanMonaco` instance once in your application using a `useEffect`
  useEffect(() => {
    const _leanMonaco = new LeanMonaco()
    setLeanMonaco(_leanMonaco)

    ;(async () => {
      await _leanMonaco.start(leanMonacoOptions)
      console.debug('[lean4game]: leanMonaco started')
    })()

    // No cleanup: disposing an instance while it is still starting (React's strict mode runs
    // this effect twice) leaves Monaco's services half-initialized, and the next `start` then
    // fails with "Services are already initialized". A new instance replaces the old one.
  }, [leanMonacoOptions, setLeanMonaco])

  // Switch the CSS colour tokens (see `css/tokens.css`) before the browser paints.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light"
  }, [darkMode])

  // Turn off the CSS animations (see `css/reset.css`) if the player prefers reduced motion.
  const [reducedMotion] = useAtom(reducedMotionAtom)
  useLayoutEffect(() => {
    document.documentElement.dataset.reducedMotion = reducedMotion ? "true" : "false"
  }, [reducedMotion])

  // Monaco's theme is global. `LeanMonaco.start` sets it from the browser setting, so this
  // overrides it once LeanMonaco is ready. The theme is deliberately not part of
  // `leanMonacoOptionsAtom`: changing those options restarts the Lean connection.
  // The standalone editors (e.g. the typewriter command line) only follow `setTheme`;
  // the workbench setting is kept in step for everything else that reads it.
  useEffect(() => {
    if (!leanMonaco) return
    let cancelled = false
    leanMonaco.whenReady.then(() => {
      if (cancelled || leanMonaco.disposed) return
      monaco.editor.setTheme(darkMode ? "Visual Studio Dark" : "Visual Studio Light")
      leanMonaco.updateVSCodeOptions({
        "workbench.colorTheme": darkMode ? "Visual Studio Dark" : "Visual Studio Light",
        "editor.cursorBlinking": reducedMotion ? "solid" : "blink",
        // Give the editors the same background as the panels around them.
        "workbench.colorCustomizations": {
          "[Visual Studio Dark]": {
            "editor.background": DARK_SURFACE,
          },
        },
      })
    })
    return () => { cancelled = true }
  }, [leanMonaco, darkMode, reducedMotion])

  const muiTheme = useMemo(() => createTheme({
    palette: darkMode ? {
      mode: 'dark',
      primary: { main: DARK_PRIMARY },
      background: { default: DARK_BACKGROUND, paper: DARK_SURFACE },
      text: { primary: DARK_TEXT },
    } : {
      mode: 'light',
      primary: { main: PRIMARY },
    },
    typography: { fontFamily: FONT, button: { textTransform: 'none', fontWeight: 550 } },
    shape: { borderRadius: 8 },
  }), [darkMode])

  return (
    <ThemeProvider theme={muiTheme}>
      <React.Suspense>
        {children}
      </React.Suspense>
      <Popup />
    </ThemeProvider>
  )
}

export default App
