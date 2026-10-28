import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";

export interface Preferences {
  layout: "mobile" | "auto" | "desktop"
  isSavePreferences: boolean
  language: string
  isSuggestionsMobileMode: boolean // TODO: remove me
  useFlags: boolean
  showLockedInventory: boolean
  theme: "light" | "dark" | "system"
}

export function getWindowDimensions() {
  const {innerWidth: width, innerHeight: height } = window
  return {width, height}
}

/** In "auto" layout, windows narrower than this (in px) get the single-panel mobile layout. */
export const AUTO_SWITCH_THRESHOLD = 1024

const defaultPreferences: Preferences = {
  layout: "auto",
  isSavePreferences: true,
  language: import.meta.env.VITE_CLIENT_DEFAULT_LANGUAGE || "en",
  isSuggestionsMobileMode: true,
  useFlags: false,
  showLockedInventory: true,
  theme: "system",
};

const storage = createJSONStorage<Preferences>(() => localStorage)

const conditionalStorage = {
  ...storage,
  setItem: (key: string, value: Preferences) => {
    if (value.isSavePreferences) {
      storage.setItem(key, value)
    } else {
      storage.removeItem(key)
    }
  },
}

/**
 * User preferences synchronised with local storage
 */
export const preferencesAtom = atomWithStorage<Preferences>(
  'preferences',
  defaultPreferences,
  conditionalStorage,
  { getOnInit: true }
)

const widthBelowThresholdAtom = atom(false)
widthBelowThresholdAtom.onMount = set => {
  const mq = window.matchMedia(`(max-width: ${AUTO_SWITCH_THRESHOLD - 1}px)`)
  const update = () => set(mq.matches)

  update()
  mq.addEventListener("change", update)

  return () => mq.removeEventListener("change", update)
}

export const mobileAtom = atom(get => {
  const layout = get(preferencesAtom).layout
  const widthBelowThreshold = get(widthBelowThresholdAtom)
  switch (layout) {
    case "mobile": return true
    case "desktop": return false
    case "auto": return widthBelowThreshold
  }
})

const DARK_QUERY = "(prefers-color-scheme: dark)"

/** Whether the operating system / browser prefers a dark colour scheme */
const systemDarkAtom = atom(window.matchMedia?.(DARK_QUERY).matches ?? false)
systemDarkAtom.onMount = set => {
  const mq = window.matchMedia(DARK_QUERY)
  const update = () => set(mq.matches)

  update()
  mq.addEventListener("change", update)

  return () => mq.removeEventListener("change", update)
}

/** Whether the UI is shown in dark mode: the "theme" preference, resolved against the system setting */
export const darkModeAtom = atom(get => {
  // `theme` is missing from preferences saved by older versions
  switch (get(preferencesAtom).theme ?? "system") {
    case "dark": return true
    case "light": return false
    case "system": return get(systemDarkAtom)
  }
})
