import { useAtom } from "jotai"
import { oneLineEditorAtom, typewriterAtom, typewriterContentAtom } from "../../../store/typewriter-atoms"
import { preferencesAtom } from "../../../store/preferences-atoms"

/** What clicking a tactic inserts into an empty command line. */
const PREFIX_OVERRIDES: Record<string, string> = {
  "by_cases": "by_cases this :",
  "contrapose": "contrapose!",
  "have": "have :",
  "obtain": "obtain ⟨⟩ :=",
  "rewrite": "rw []",
  "rw": "rw []",
  "simp": "simp only []",
}

/** What clicking a tactic appends to a command that was already started. */
const SUFFIX_OVERRIDES: Record<string, string> = {
  "induction": "generalizing",
  "left": ".left",
  "rewrite": "←",
  "right": ".right",
  "rw": "←",
}

const has = (record: Record<string, string>, key: string) =>
  Object.prototype.hasOwnProperty.call(record, key)

/**
 * The command line's text after clicking `suffix` (the name of an inventory item or of a
 * hypothesis), so that the command can be put together without a keyboard: guesses the
 * punctuation, e.g. `rw [h]` and then `g` gives `rw [h, g]`, and `h` gives `rw [h] at h`.
 *
 * `isTheorem`: the item is used like a theorem (e.g. inserted as `rw [..]` into an empty line);
 * `isAssumption`: it is a hypothesis (e.g. appended as `at ..`).
 */
export function appendToCommand(typewriter: string, suffix: string, isTheorem: boolean, isAssumption: boolean): string {
  let _typewriter = typewriter.trim()

  if (!typewriter.length) {
    _typewriter = has(PREFIX_OVERRIDES, suffix) ? PREFIX_OVERRIDES[suffix] : isTheorem ? `rw [${suffix}]` : suffix
    return _typewriter + " "
  }

  suffix = !isAssumption && has(SUFFIX_OVERRIDES, suffix) ? SUFFIX_OVERRIDES[suffix] : suffix

  if (suffix === "ℕ") {
    if (/ \d$/.test(_typewriter)) {
      suffix = ((+_typewriter.slice(-2) + 1) % 10).toString()
      _typewriter = _typewriter.slice(0, -2)
    } else {
      suffix = "0"
    }
    suffix = " " + suffix
  } else if (suffix === "∈" && _typewriter.endsWith("∈")) {
    suffix = " {} "
  } else if (isAssumption && /^apply |^symm|^push_neg/.test(_typewriter)) {
    suffix = " at " + suffix
  } else if (suffix === "have") {
    suffix = _typewriter === "have :" ? "=" : " :="
  } else if (/[\]}]$/.test(_typewriter)) {
    if (isAssumption) {
      suffix = " at " + suffix
    } else {
      const closing = _typewriter.slice(-1)
      _typewriter = _typewriter.slice(0, -1)
      if (suffix === "←") {
        suffix = /[[,({]$/.test(_typewriter) ? "←" : /\([^)]*$/.test(_typewriter) ? ")" : " ("
      } else {
        if (!/[[,({]$/.test(_typewriter)) {
          suffix = (isTheorem && !_typewriter.endsWith("←") && closing === "]" ? ", " : /^[ᶜ.]/.test(suffix) ? "" : " ") + suffix
        }
      }
      suffix = suffix + closing
    }
  } else if (!/^[ᶜ.]/.test(suffix)) {
    suffix = " " + suffix
  }
  return `${_typewriter}${suffix} `.trimStart()
}

/**
 * Returns a function inserting a name into the typewriter's command line (see
 * `appendToCommand`). It does so only with the "suggestions" preference or when Shift is held,
 * and returns whether it inserted anything (it can't in editor mode).
 */
export function useAppendTypewriterInput() {
  const [typewriterContent] = useAtom(typewriterContentAtom)
  const [oneLineEditor] = useAtom(oneLineEditorAtom)
  const [, setTypewriter] = useAtom(typewriterAtom)
  const [{ isSuggestionsMobileMode }] = useAtom(preferencesAtom)

  return (shiftKey: boolean, suffix: string, isTheorem: boolean, isAssumption: boolean): boolean => {
    if (!oneLineEditor || (!isSuggestionsMobileMode && !shiftKey)) {
      return false
    }
    setTypewriter(appendToCommand(typewriterContent, suffix, isTheorem, isAssumption))
    return true
  }
}
