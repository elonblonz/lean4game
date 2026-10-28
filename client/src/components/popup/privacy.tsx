import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LegalPage } from './legal'

/** Pop-up that is displayed when opening the privacy policy (`client/public/legal/privacy.md`). */
export function PrivacyPolicyPopup () {
  const { t } = useTranslation()
  return <LegalPage name="privacy" title={t("Privacy Policy")} />
}
