import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyContentChanges } from '../dist/src/textChanges.js'

const range = (l1, c1, l2, c2) => ({ start: { line: l1, character: c1 }, end: { line: l2, character: c2 } })

test('a change without a range replaces the text', () => {
  assert.equal(applyContentChanges('intro x\n', [{ text: 'exact h\n' }]), 'exact h\n')
})

test('appending a line, as the typewriter does', () => {
  const text = 'intro x\n'
  assert.equal(applyContentChanges(text, [{ range: range(1, 0, 1, 0), text: 'intro h\n' }]), 'intro x\nintro h\n')
})

test('replacing the last line (a failed command)', () => {
  const text = 'intro x\nexact y\n'
  assert.equal(applyContentChanges(text, [{ range: range(1, 0, 2, 0), text: 'intro h\n' }]), 'intro x\nintro h\n')
})

test('deleting from a line on (Undo)', () => {
  const text = 'intro x\nintro h\nexact h\n'
  assert.equal(applyContentChanges(text, [{ range: range(1, 0, 3, 0), text: '' }]), 'intro x\n')
})

test('several changes are applied in order', () => {
  const changes = [{ range: range(0, 6, 0, 7), text: 'y' }, { range: range(0, 0, 0, 0), text: '  ' }]
  assert.equal(applyContentChanges('intro x', changes), '  intro y')
})

test('positions are UTF-16 code units', () => {
  // `𝒫` is two UTF-16 code units, `∈` one: `F` is at 16.
  const text = 'have h : 𝒫 A ∈ F := h1\n'
  assert.equal(applyContentChanges(text, [{ range: range(0, 16, 0, 17), text: 'G' }]), 'have h : 𝒫 A ∈ G := h1\n')
})

test('\\r\\n and \\r line breaks', () => {
  assert.equal(applyContentChanges('a\r\nb\r\nc', [{ range: range(1, 0, 1, 1), text: 'B' }]), 'a\r\nB\r\nc')
  assert.equal(applyContentChanges('a\rb', [{ range: range(1, 0, 1, 1), text: 'B' }]), 'a\rB')
})

test('a character past the end of its line stays on that line', () => {
  assert.equal(applyContentChanges('ab\ncd', [{ range: range(0, 10, 0, 10), text: '!' }]), 'ab!\ncd')
})

test('a line past the end appends', () => {
  assert.equal(applyContentChanges('ab', [{ range: range(5, 0, 5, 0), text: '\ncd' }]), 'ab\ncd')
})
