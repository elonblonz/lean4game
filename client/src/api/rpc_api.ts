import { InteractiveDiagnostic, InteractiveGoalCore, InteractiveHypothesisBundle, MVarId, TermInfo } from '@leanprover/infoview-api'



export interface InteractiveGoal extends InteractiveGoalCore {
  userName?: string;
  goalPrefix?: string;
  mvarId?: MVarId;
  isInserted?: boolean;
  isRemoved?: boolean;
}

/** A hypothesis as the game server sends it: it also tells whether the hypothesis is an
 * assumption (a proof of a proposition, like `h : x = 2`) or an object (like `x : ℕ`). */
export interface GameHypothesisBundle extends InteractiveHypothesisBundle {
  isAssumption?: boolean;
}

export interface InteractiveGoals extends InteractiveGoalCore {
  goals: InteractiveGoals[];
}

export interface InteractiveTermGoal extends InteractiveGoalCore {
  range?: Range;
  term?: TermInfo;
}

export interface GameHint {
  text: string;
  hidden: boolean;
  rawText: string;
  varNames: string[][]; // in Lean: `Array (Name × Name)`
}

export interface InteractiveGoalWithHints {
  goal: InteractiveGoal;
  hints: GameHint[];
}

export interface InteractiveGoalsWithHints {
  goals: InteractiveGoalWithHints[];
  command: string;
  diags: InteractiveDiagnostic[];
  /** The (0-based) document line after this step's command. */
  line?: number;
  column?: number;
}

/**
 * The proof state as it is received from the server.
 * Per proof step of the tactic proof, there is one `InteractiveGoalWithHints[]`.
 */
export interface ProofState {
  /** The proof steps. step 0 is the state at the beginning of the proof. step one
   * contains the goal after the first line has been evaluated.
   *
   * In particular `step[i]` is the proof step at the beginning of line `i` in vscode.
   */
  steps: InteractiveGoalsWithHints[];
  /** The remaining diagnostics that are not in the steps. Usually this should only
   * be the "unsolved goals" message, I believe.
   */
  diagnostics : InteractiveDiagnostic[];
  completed : boolean;
  completedWithWarnings : boolean;
}
