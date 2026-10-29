import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useGameTranslation } from '../../utils/translation'
import { useEffect, useRef } from 'react'
import { useAtom } from 'jotai'
import { mobileAtom } from '../../store/preferences-atoms'
import { gameIdAtom, levelIdAtom, worldIdAtom } from '../../store/location-atoms'
import { gameInfoAtom, levelInfoAtom } from '../../store/query-atoms'
import { deletedChatAtom, helpAtom, noHintsAtom, selectedStepAtom } from '../../store/chat-atoms'
import { worldCompletedAtom } from '../../store/world-tree-atoms'
import { popupAtom, PopupType } from '../../store/popup-atoms'
import { lastValidStepAtom, proofAtom } from '../../store/proof-atoms'
import { DeletedHints, Hint, Hints, MoreHelpButton } from '../hints'
import { isLastStepWithErrors, stepHints } from '../../utils/proof'
import Markdown from 'react-markdown'
import { faArrowRight, faHome } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '../button'

/** "Next" button below the hints of a solved level, "Home" on the last level of a world. */
export const NextLevelButton = React.forwardRef<HTMLButtonElement, {lastLevel: boolean}>(({lastLevel}, ref) => {
  const { t } = useTranslation()
  const [gameId, navigateToGame] = useAtom(gameIdAtom)
  const [levelId, navigateToLevel] = useAtom(levelIdAtom)
  return lastLevel ?
    <Button ref={ref} onClick={() => {if (gameId) navigateToGame(gameId)}} >
      <FontAwesomeIcon icon={faHome} />&nbsp;{t("Home")}
    </Button> :
    <Button ref={ref} onClick={() => {if(levelId !== undefined) navigateToLevel(levelId + 1)}}  >
      {t("Next")}&nbsp;<FontAwesomeIcon icon={faArrowRight} />
    </Button>
})

/** "World recap" button, shown once the current world is completed. */
export function WorldRecapButton() {
  const { t } = useTranslation()
  const [worldId] = useAtom(worldIdAtom)
  const [worldCompleted] = useAtom(worldCompletedAtom(worldId ?? ""))
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)
  const [, setPopup] = useAtom(popupAtom)
  if (!worldId || !worldCompleted || !gameInfo?.worldSize?.[worldId]) return null
  return <Button onClick={() => setPopup(PopupType.recap)}>{t("World recap")}</Button>
}

/** Shown instead of the hints while the level is replayed without hints. */
export function NoHintsMessage() {
  const { t } = useTranslation()
  const [noHints, setNoHints] = useAtom(noHintsAtom)
  if (!noHints) return null
  return <div className="message information no-hints">
    {t("You are replaying this level without hints.")}{' '}
    <button className="link-button" onClick={() => setNoHints(false)}>{t("Show hints")}</button>
  </div>
}

/** Appears on the left of playable levels */
export function ChatPanel({lastLevel, visible = true}: {lastLevel: boolean, visible?: boolean}) {
  let { t } = useTranslation()
  const { t : gT } = useGameTranslation()
  const chatRef = useRef<HTMLDivElement>(null)
  const [mobile] = useAtom(mobileAtom)
  const [gameId, navigateToGame] = useAtom(gameIdAtom)
  const [levelId, navigateToLevel] = useAtom(levelIdAtom)
  const [{ data: levelInfo }] = useAtom(levelInfoAtom)
  const [help] = useAtom(helpAtom)
  const [proof] = useAtom(proofAtom)
  const [deletedChat] = useAtom(deletedChatAtom)
  const [selectedStep, setSelectedStep] = useAtom(selectedStepAtom)
  const [noHints] = useAtom(noHintsAtom)

  const [k] = useAtom(lastValidStepAtom)

  function toggleSelection(line: number) {
    return (ev: any) => {
      console.debug('toggled selection')
      if (selectedStep == line) {
        setSelectedStep(undefined)
      } else {
        setSelectedStep(line)
      }
    }
  }

  useEffect(() => {
    // TODO: For some reason this is always called twice
    console.debug('scroll chat')
    if (!mobile) {
      chatRef.current!.lastElementChild?.scrollIntoView() //scrollTo(0,0)
    }
  }, [proof, help])

  // Scroll to element if selection changes
  useEffect(() => {
    if (typeof selectedStep !== 'undefined') {
      Array.from(chatRef.current!.getElementsByClassName(`step-${selectedStep}`)).map((elem) => {
        elem.scrollIntoView({block: "center"})
      })
    }
  }, [selectedStep])

  // useEffect(() => {
  //   // // Scroll to top when loading a new level
  //   // // TODO: Thats the wrong behaviour probably
  //   // chatRef.current!.scrollTo(0,0)
  // }, [gameId, worldId, levelId])

  let introText: Array<string> = gT(levelInfo?.introduction ?? "").split(/\n(\s*\n)+/)

  const focusRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
   if (proof?.completed) {
     focusRef.current?.focus()
   }
  }, [!!proof?.completed])

  return <div className={`chat-panel ${visible ? '' : 'hidden'}`}>
    {/* New hints are read out by screen readers. */}
    <div ref={chatRef} className="chat" role="log" aria-live="polite" aria-label={t("Hints")}>
      {introText?.filter(it => it.trim()).map(((it, i) =>
        // Show the level's intro text as hints, too
        <Hint key={`intro-p-${i}`}
          hint={{text: it, hidden: false, rawText: it, varNames: []}} step={0} selected={selectedStep} toggleSelection={toggleSelection(0)} />
      ))}
      <NoHintsMessage />
      {!noHints && proof?.steps.map((step, i) => {
        let filteredHints = stepHints(proof, i)
        if (step.goals.length > 0 && !isLastStepWithErrors(proof, i)) {
          return <Hints key={`hints-${i}`}
          hints={filteredHints} revealed={help.get(i) ?? 0} step={i}
          selected={selectedStep} toggleSelection={toggleSelection(i)} lastLevel={i == proof?.steps.length - 1}/>
        }
      })}

      {/* {modifiedHints.map((step, i) => {
        // It the last step has errors, it will have the same hints
        // as the second-to-last step. Therefore we should not display them.
        if (!(i == proof?.steps.length - 1 && withErr)) {
          // TODO: Should not use index as key.
          return <Hints key={`hints-${i}`}
            hints={step} showHidden={showHelp?.has(i)} step={i}
            selected={selectedStep} toggleSelection={toggleSelection(i)} lastLevel={i == proof?.steps.length - 1}/>
        }
      })} */}
      {!noHints && <DeletedHints hints={deletedChat}/>}
      {proof?.completed &&
        <>
          <div className={`message information recent step-${k}${selectedStep == k ? ' selected' : ''}`} onClick={toggleSelection(k)}>
            {t("Level completed! 🎉")}
          </div>
          {levelInfo?.conclusion?.trim() &&
            <div className={`message information recent step-${k}${selectedStep == k ? ' selected' : ''}`} onClick={toggleSelection(k)}>
              <Markdown>{gT(levelInfo?.conclusion ?? "")}</Markdown>
            </div>
          }
        </>
      }
    </div>
    <div className="button-row">
      {proof?.completed && <NextLevelButton ref={focusRef} lastLevel={lastLevel} />}
      {proof?.completed && <WorldRecapButton />}
      <MoreHelpButton selected={null} />
    </div>
  </div>
}
