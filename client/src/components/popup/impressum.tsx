import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LegalPage } from './legal'

/** Pop-up that is displayed when opening the impressum (`client/public/legal/impressum.md`). */
export function ImpressumPopup () {
  const { t } = useTranslation()
  return <LegalPage name="impressum" title={t("Impressum")} />
}
