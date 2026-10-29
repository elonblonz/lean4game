/**
 * @fileOverview Helpers for keyboard access and screen readers.
 */
import * as React from 'react'

/** Props for an element that is not a `<button>` but acts as one: focusable, activated with
 * Enter or Space. (Prefer a real `<button>` where it doesn't change the layout.) */
export function buttonProps(onActivate: (ev: React.SyntheticEvent) => void, disabled = false) {
  return {
    role: "button",
    tabIndex: disabled ? -1 : 0,
    "aria-disabled": disabled || undefined,
    onKeyDown: (ev: React.KeyboardEvent) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault()
        if (!disabled) onActivate(ev)
      }
    },
  }
}

/** Move the focus among `items` with the arrow keys (and Home / End), as in a tab list or a
 * toolbar. Returns whether the key was handled. */
export function moveFocusWithArrows(ev: React.KeyboardEvent, items: HTMLElement[]): boolean {
  const current = items.indexOf(document.activeElement as HTMLElement)
  let next: number
  switch (ev.key) {
    case "ArrowRight": case "ArrowDown": next = current + 1; break
    case "ArrowLeft": case "ArrowUp": next = current - 1; break
    case "Home": next = 0; break
    case "End": next = items.length - 1; break
    default: return false
  }
  if (!items.length) return false
  ev.preventDefault()
  items[(next + items.length) % items.length].focus()
  return true
}

/** The elements inside `container` that can get the focus with Tab. */
export function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => el.offsetParent !== null || el === document.activeElement)
}
