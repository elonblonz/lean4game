import * as React from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useAtom } from 'jotai';
import { createTheme, ThemeProvider } from '@mui/material/styles';

import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

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

import i18n from './i18n';
import { Popup } from './components/popup/popup';
import { leanMonacoAtom, leanMonacoOptionsAtom } from './store/editor-atoms';
import { LeanMonaco } from 'lean4monaco';
import * as monaco from 'monaco-editor';
import { darkModeAtom, preferencesAtom } from './store/preferences-atoms';

/** Colours that MUI and Monaco need as literals. Keep in sync with the dark palette in `app.css`. */
const DARK_BACKGROUND = '#1e2127'
const DARK_SURFACE = '#252830'
const DARK_TEXT = '#e6e8ec'
const PRIMARY = '#1976d2'

function App({ children }: { children?: React.ReactNode }) {

  const [leanMonaco, setLeanMonaco] = useAtom(leanMonacoAtom)
  const [leanMonacoOptions] = useAtom(leanMonacoOptionsAtom)
  const [preferences] = useAtom(preferencesAtom)
  const [darkMode] = useAtom(darkModeAtom)

  useEffect(() => {
    i18n.changeLanguage(preferences.language)
  }, [preferences.language])

  // You need to start one `LeanMonaco` instance once in your application using a `useEffect`
  useEffect(() => {
    const _leanMonaco = new LeanMonaco()
    setLeanMonaco(_leanMonaco)

    ;(async () => {
      await _leanMonaco.start(leanMonacoOptions)
      console.debug('[lean4game]: leanMonaco started')
    })()

    return () => {
      // Dispose the instance this effect started (`leanMonaco` is the previous render's value).
      _leanMonaco.dispose()
      setLeanMonaco(null)
    }
  }, [leanMonacoOptions, setLeanMonaco])

  // Switch the CSS colour tokens (see `app.css`) before the browser paints.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light"
  }, [darkMode])

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
        // Give the editors the same background as the panels around them.
        "workbench.colorCustomizations": {
          "[Visual Studio Dark]": {
            "editor.background": DARK_SURFACE,
          },
        },
      })
    })
    return () => { cancelled = true }
  }, [leanMonaco, darkMode])

  const muiTheme = useMemo(() => createTheme({
    palette: darkMode ? {
      mode: 'dark',
      primary: { main: PRIMARY },
      background: { default: DARK_BACKGROUND, paper: DARK_SURFACE },
      text: { primary: DARK_TEXT },
    } : {
      mode: 'light',
      primary: { main: PRIMARY },
    },
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
