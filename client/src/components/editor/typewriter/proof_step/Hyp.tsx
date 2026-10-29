import { InteractiveHypothesisBundle_nonAnonymousNames, MVarId, TaggedText_stripTags } from "@leanprover/infoview-api"
import { GameHypothesisBundle } from "../../../../api/rpc_api"
import React from "react"
import {useAppendTypewriterInput} from "../useAppendTypewriterInput"

interface HypProps {
    hyp: GameHypothesisBundle
    mvarId?: MVarId
}

function isInaccessibleName(h: string): boolean {
    return h.indexOf('✝') >= 0;
}

export function Hyp({ hyp: h, mvarId }: HypProps) {
    const namecls: string = 'mr1 hyp-name ' +
        (h.isInserted ? 'inserted-text ' : '') +
        (h.isRemoved ? 'removed-text ' : '')

    const appendTypewriterInput = useAppendTypewriterInput()

    const names = InteractiveHypothesisBundle_nonAnonymousNames(h).map((n, i) =>
        <span
            className={namecls + (isInaccessibleName(n) ? 'goal-inaccessible ' : '')}
            key={i}
            // An assumption is passed as `isTheorem` too: on an empty command line it is
            // used like a theorem (`rw [h]`), afterwards it is appended as `at h`.
            onClick={ev => {
                const isAssumption = h.isAssumption ?? false
                appendTypewriterInput(ev.shiftKey, n, isAssumption, isAssumption)
                ev.stopPropagation()
            } }
        >{n}
        </span>)
    return <div>
        <strong className="goal-hyp">{names}</strong>
        :&nbsp;
        {TaggedText_stripTags(h.type)}
        {h.val && <>&nbsp;:=&nbsp;{TaggedText_stripTags(h.val)}</>}
    </div>
}
