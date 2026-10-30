import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { TheoremUsage } from '../../api/game-data'
import { useAtom } from 'jotai'
import { oneLineEditorAtom, typewriterAtom } from '../../store/typewriter-atoms'

/** A command; in the typewriter, clicking it puts it into the command line, to be edited. */
function Command({ text }: { text: string }) {
  const { t } = useTranslation()
  const [oneLineEditor] = useAtom(oneLineEditorAtom)
  const [, setTypewriter] = useAtom(typewriterAtom)
  if (!oneLineEditor) return <code>{text}</code>
  return <button type="button" className="usage-command" title={t("Put this into the command line")}
      onClick={ev => { ev.stopPropagation(); setTypewriter(text + ' ') }}>
    <code>{text}</code>
  </button>
}

/** How to use a theorem in a proof: what to write, which arguments to give, what it proves. */
export function TheoremUsageCard({ name, usage }: { name: string, usage: TheoremUsage }) {
  const { t } = useTranslation()
  const proofs = usage.args.filter(a => a.proof)
  return <section className="theorem-usage" aria-label={t("How to use")}>
    <h2>{t("How to use")}</h2>
    <p>
      <Command text={`exact ${usage.call}`} /> {t("proves")} <code>{usage.conclusion}</code>
      {usage.args.length ? t(", where:") : '.'}
    </p>
    {usage.args.length > 0 && <ul className="usage-args">
      {usage.args.map(a => <li key={a.name}>
        <code>{a.name}</code>{' '}
        {a.proof ? <>{t("is a proof of")} <code>{a.type}</code></> : <>{t("is an object of type")} <code>{a.type}</code></>}
      </li>)}
    </ul>}
    {usage.inferred.length > 0 && <p className="usage-note">
      {t("You don't write {{names}}: Lean works them out from the other arguments and the goal.",
        { names: usage.inferred.join(', ') })}
    </p>}
    {proofs.length > 0 && <p className="usage-note">
      {t("Or work backwards:")} <Command text={`apply ${name}`} />{' '}
      {t("turns a goal of this form into goals for the missing proofs.")}
    </p>}
    {usage.rel && <p className="usage-note">
      {usage.rel === 'iff' ? t("It is an \"if and only if\" statement, so you can also rewrite with it:")
        : t("It is an equation, so you can also rewrite with it:")}{' '}
      <Command text={`rewrite [${name}]`} />{' '}
      {t("replaces the left side by the right side, and")} <code>{`rewrite [← ${name}]`}</code>{' '}
      {t("the right side by the left side.")}
    </p>}
    <TheoremsExplained />
  </section>
}

/** The general idea of using theorems, for any theorem. */
export function TheoremsExplained({ open = false }: { open?: boolean }) {
  const { t } = useTranslation()
  return <details className="theorems-explained" open={open}>
    <summary>{t("How do theorems work in a proof?")}</summary>
    <p>{t("A theorem is like an assumption you can use in every proof. If it says \"if P, then Q\", it works like a function: give it a proof of P, and you get a proof of Q.")}</p>
    <p>{t("Write the arguments after the theorem's name, in order, separated by spaces. If an argument is itself put together, put it in brackets: in mem_image_of_mem f (h hx), the proof h hx is one argument. Arguments that Lean can work out (shown in curly braces { } in the Lean signature) are left out.")}</p>
    <ul>
      <li><code>exact</code> {t("when the theorem proves the goal as it is.")}</li>
      <li><code>apply</code> {t("when the theorem's conclusion matches the goal: you are left to prove what it needs.")}</li>
      <li><code>rewrite</code> {t("when the theorem is an equation or an \"if and only if\": it replaces one side by the other.")}</li>
    </ul>
  </details>
}
