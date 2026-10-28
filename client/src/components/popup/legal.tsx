import * as React from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Markdown } from '../markdown'

/**
 * A legal page (impressum, privacy policy) provided by whoever runs the site, as Markdown in
 * `client/public/legal/<name>.md`. If there is none, say so rather than showing someone else's.
 */
export function LegalPage({ name, title }: { name: string, title: string }) {
  const { t } = useTranslation()
  const [text, setText] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    fetch(`${window.location.origin}${import.meta.env.BASE_URL ?? '/'}legal/${name}.md`)
      .then(async res => {
        const body = res.ok ? await res.text() : ''
        // A dev server answers unknown paths with the app's `index.html`.
        if (!cancelled) setText(body.trim() && !body.trimStart().startsWith('<') ? body : null)
      })
      .catch(() => { if (!cancelled) setText(null) })
    return () => { cancelled = true }
  }, [name])

  if (text === undefined) return null
  if (text === null) return <>
    <h2>{title}</h2>
    <p>{t("The operator of this site has not provided this information yet.")}</p>
  </>
  return <Markdown>{text}</Markdown>
}
