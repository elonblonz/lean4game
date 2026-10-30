import React, { useEffect, useRef } from "react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { gameInfoAtom } from "../../../store/query-atoms";
import { gameIdAtom, worldIdAtom } from "../../../store/location-atoms";
import path from "node:path";
import { needsReconnect, proofQueryAtom } from "../../../store/lean-atoms";
import { proofAtom } from "../../../store/proof-atoms";
import { ExerciseStatement } from "../ExerciseStatement";
import { ProofStep } from "./proof_step/ProofStep";
import { TypewriterCommandLine } from "./TypewriterCommandline";
import { LoadingIcon } from "../../utils";
import { CircularProgress } from "@mui/material";
import { Button } from "../../button";
import { mobileAtom } from "../../../store/preferences-atoms";
import { MobileLevelFooter } from "../../chat/MobileLevelFooter";

/** Shown instead of the proof when the Lean server can't be reached. */
function ProofStateError({ retry }: { retry: () => void }) {
  const { t } = useTranslation()
  return <div className="proof-state-error">
    <p>{t("The connection to the Lean server was lost, or the server didn't respond.")}</p>
    <Button onClick={() => retry()}>{t("Retry")}</Button>
    <Button onClick={() => window.location.reload()}>{t("Reload page")}</Button>
  </div>
}

/**
 * Der Typewriter bestehend aus Eingabezeile, Beweisschritten, Aufgabenstellung und Hintergrundbild
 */
export function Typewriter() {
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)
  const [gameId] = useAtom(gameIdAtom)
  const [worldId] = useAtom(worldIdAtom)
  const [proof] = useAtom(proofAtom)
  const [mobile] = useAtom(mobileAtom)
  const [{ error, isFetching, refetch }] = useAtom(proofQueryAtom)
  // An outdated session is reconnected automatically (see `PlayableLevel`), so keep waiting.
  const failed = error && !isFetching && !needsReconnect(error)

  const proofPanelRef = useRef<HTMLDivElement>(null)

  // Keep the newest step (and its errors) in view, scrolling no further than needed.
  useEffect(() => {
    proofPanelRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" })
  }, [proof])

  let image = gameInfo?.worlds?.nodes[worldId!]?.image

  return <div className="typewriter-canvas">
    <div className="typewriter-info">
      {image && <img className="world-image contain" src={path.join("data", gameId!, image)} alt="" />}
      <div className="pusher" />
      <div className='proof' ref={proofPanelRef}>
        <ExerciseStatement showLeanStatement={true} />
        {/* Keyed by the command too, so a step replaced after an undo starts afresh (e.g. on
            its first goal tab). */}
        {proof?.steps.map((step, i) => <ProofStep key={`${i}:${step.command}`} step={step} idx={i} />)}
        {/* Also when an older proof state is still shown: it's out of date. */}
        {failed ? <ProofStateError retry={refetch} />
          : !proof && <div className="centered-spinner"><CircularProgress /></div>}
        {mobile && proof && <MobileLevelFooter />}
      </div>
    </div>
    <TypewriterCommandLine />
  </div>
}
