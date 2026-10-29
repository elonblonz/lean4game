import * as React from 'react'
import { Slider } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark, faCircleQuestion } from '@fortawesome/free-solid-svg-icons'
import { useTranslation } from 'react-i18next'
import { useAtom } from 'jotai'
import { popupAtom, PopupType } from '../../store/popup-atoms'
import { difficultyAtom } from '../../store/progress-atoms'
import { mobileAtom } from '../../store/preferences-atoms'
import { buttonProps } from '../../utils/a11y'

/** The menu that is shown next to the world selection graph */
export function WorldSelectionMenu() {
  const { t } = useTranslation()
  const [difficulty, setDifficulty] = useAtom(difficultyAtom)
  const [mobile] = useAtom(mobileAtom)
  const [popup, setPopup] = useAtom(popupAtom)

  function label(x : number) {
    return x == 0 ? t("none") : x == 1 ? t("relaxed") : t("regular")
  }


  return <nav className={`world-selection-menu${mobile ? '' : ' desktop'}`}>
    <div className="slider-wrap">
      <span className="difficulty-label">
        {t("Rules")}
        <span onClick={() => {setPopup(PopupType.rules)}} title={t("Game Rules")} aria-label={t("Game Rules")}
            {...buttonProps(() => setPopup(PopupType.rules))}>
          <FontAwesomeIcon
            icon={(popup == PopupType.rules) ? faXmark : faCircleQuestion}
            className='helpButton' />
        </span>
      </span>
      <Slider
        orientation={mobile ? "horizontal" : "vertical"}
        title={t("Game Rules")}
        min={0} max={2}
        aria-label={t("Game Rules")}
        value={difficulty}
        marks={[
          {value: 0, label: label(0)},
          {value: 1, label: label(1)},
          {value: 2, label: label(2)}
        ]}
        valueLabelFormat={label}
        getAriaValueText={label}
        valueLabelDisplay="off"
        onChange={(ev, val) => {
          setDifficulty(Array.isArray(val) ? val[0]: val)
        }}
        ></Slider>
    </div>
  </nav>
}

