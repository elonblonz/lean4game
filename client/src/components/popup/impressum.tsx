import * as React from 'react'
import { LegalPage } from './legal'

/** Pop-up that is displayed when opening the impressum (`client/public/legal/impressum.md`). */
export function ImpressumPopup () {
  return <LegalPage name="impressum" title="Impressum" />
}
