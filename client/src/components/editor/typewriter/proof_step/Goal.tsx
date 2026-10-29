import { useAtom } from "jotai";
import React from "react";
import { typewriterModeAtom } from "../../../../store/proof-atoms";
import { gameInfoAtom } from "../../../../store/query-atoms";
import { mobileAtom } from "../../../../store/preferences-atoms";
import { useTranslation } from "react-i18next";
import { GameHypothesisBundle, InteractiveGoal } from "../../../../api/rpc_api";
import { Hyp } from "./Hyp";
import { TaggedText_stripTags } from "@leanprover/infoview-api";


export function Goal({goal} : { goal: InteractiveGoal}) {
  const { t} = useTranslation()
  const [mobile] = useAtom(mobileAtom)
  const [typewriterMode] = useAtom(typewriterModeAtom)
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)

  function unbundleHyps (hyps: GameHypothesisBundle[]) : GameHypothesisBundle[] {
    return hyps.flatMap(hyp => (
        gameInfo?.settings?.unbundleHyps ? hyp.names.map(name => {return {...hyp, names: [name]}}) : [hyp]
    ))
  }

  const hyps: GameHypothesisBundle[] = goal.hyps
  const objectHyps = unbundleHyps(hyps.filter(hyp => !hyp.isAssumption))
  const assumptionHyps = unbundleHyps(hyps.filter(hyp => hyp.isAssumption))

  return (
    <>
      <div className="hypotheses">
        {objectHyps.length > 0 &&
            <div className="hyp-group"><div className="hyp-group-title">{t("Objects")}:</div>
            {objectHyps.map((h, i) => <Hyp hyp={h} mvarId={goal.mvarId} key={i} />)}</div> }
        {assumptionHyps.length > 0 &&
            <div className="hyp-group"><div className="hyp-group-title">{t("Assumptions")}:</div>
            {assumptionHyps.map((h, i) => {
                h = {...h, val: undefined} // JE: never show value of assumptions (proof irrelevance)
                return <Hyp hyp={h} mvarId={goal.mvarId} key={i} />})}</div> }

      </div>
      { (!mobile && typewriterMode) &&
          <div className='goal-sign'>
              <svg width="100%" height="100%">
                  <line x1="0%" y1="0%" x2="0%" y2="100%" />
                  <line x1="0%" y1="50%" x2="100%" y2="50%" />
              </svg>
          </div>
      }
      <div key={'goal'} className="goal">
        {(mobile || !typewriterMode) && <div className="goal-title">{t("Goal")}:</div> }
            {TaggedText_stripTags(goal.type)}
      </div>
    </>
  )
}
