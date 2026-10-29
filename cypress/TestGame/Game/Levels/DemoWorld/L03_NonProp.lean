import Game.Metadata

World "TestWorld"
Level 3

Title "Non-Prop-Valued"

Introduction "This is a test level."

-- TODO: name me
Statement : Nat → Nat := by
  Hint "intro first!"
  intro x
  Hint "now apply!"
  apply x

Conclusion "Done!"

/-- Introduces a variable. -/
TacticDoc intro reads "Let {1} : {1:type} be arbitrary."

NewTactic intro apply
