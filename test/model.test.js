import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FlowModel } from '../src/model.js'
import { History } from '../src/history.js'

const types = {
  trigger: { name: 'Trigger', trigger: true },
  hook   : { name: 'Webhook', trigger: true },
  email  : { name: 'Email' },
  stop   : { name: 'Stop', terminal: true },
  if     : { name: 'If', branches: [{ key: 'yes', name: 'Yes' }, { key: 'no', name: 'No' }] },
  split  : { name: 'Split', branches: node => Array.from({ length: node.ways ?? 2 }, (_, i) => `way${ i + 1 }`) },
}

const sample = () => [
  { id: 'a', type: 'trigger' },
  { id: 'b', type: 'if' },
  { id: 'c', type: 'email', parent: 'b', branch: 'yes' },
  { id: 'd', type: 'email', parent: 'b', branch: 'no' },
  { id: 'e', type: 'email' },
]

const model = (nodes = sample(), options = {}) => new FlowModel({
  nodes,
  types,
  ...options,
})

const ids = (model, parent = null, branch = null) => model.children(parent, branch).map(node => node.id)

test('puts nodes in order: the main flow, with each node\'s branches under it', () => {

  // order in a branch is the order in the list, branches come in the order the type declares them
  const shuffled = [sample()[4], sample()[3], sample()[2], sample()[0], sample()[1]]

  assert.deepEqual(model(shuffled).toJSON().map(node => node.id), ['e', 'a', 'b', 'c', 'd'])
})

test('fills in parent and branch', () => {

  const m = model([
    { id: 'b', type: 'if' },
    { id: 'c', type: 'email', parent: 'b' },
  ])

  assert.deepEqual(m.get('b').parent, null)
  assert.equal(m.get('b').branch, null)
  assert.equal(m.get('c').branch, 'yes')
})

test('makes ids for nodes without one', () => {

  const m = model([{ type: 'email' }, { type: 'email' }])
  const [one, two] = m.toJSON()

  assert.ok(one.id)
  assert.notEqual(one.id, two.id)
})

test('keeps fields it doesn\'t know about', () => {

  const m = model([{ id: 'a', type: 'email', title: 'Hello', data: { list: [1, 2] } }])

  assert.deepEqual(m.toJSON()[0].data, { list: [1, 2] })
})

test('does not touch the list it was given', () => {

  const input = sample()
  const m = model(input)

  m.remove('c')
  m.update('a', { title: 'x' })

  assert.deepEqual(input, sample())
})

test('refuses lists that aren\'t trees', () => {

  assert.throws(() => model([{ id: 'a', type: 'email' }, { id: 'a', type: 'email' }]), /more than once/)
  assert.throws(() => model([{ id: 'a', type: 'email', parent: 'zzz' }]), /isn't in the list/)
  assert.throws(() => model([{ id: 'a', type: 'if', parent: 'b', branch: 'yes' }, { id: 'b', type: 'if', parent: 'a', branch: 'yes' }]), /own branches/)
  assert.throws(() => model([{ id: 'a' }]), /type/)
})

test('numeric ids work', () => {

  const m = model([
    { id: 1, type: 'if' },
    { id: 2, type: 'email', parent: 1, branch: 'no' },
  ])

  assert.deepEqual(ids(m, 1, 'no'), [2])
  assert.deepEqual(m.descendants(1), [2])
  assert.equal(m.get('2').id, 2)
})

test('resolves positions', () => {

  const m = model()

  assert.deepEqual(m.resolve({ after: 'a' }), { parent: null, branch: null, index: 1 })
  assert.deepEqual(m.resolve({ before: 'a' }), { parent: null, branch: null, index: 0 })
  assert.deepEqual(m.resolve({ after: 'c' }), { parent: 'b', branch: 'yes', index: 1 })
  assert.deepEqual(m.resolve({ parent: 'b', branch: 'no', position: 'start' }), { parent: 'b', branch: 'no', index: 0 })
  assert.deepEqual(m.resolve({ parent: 'b', branch: 'no' }), { parent: 'b', branch: 'no', index: 1 })
  assert.deepEqual(m.resolve({ position: 'end' }), { parent: null, branch: null, index: 3 })
  // nodes being moved aren't counted
  assert.deepEqual(m.resolve({ after: 'e' }, ['b']), { parent: null, branch: null, index: 2 })
  assert.deepEqual(m.resolve({ position: 'end' }, ['b']), { parent: null, branch: null, index: 2 })
  assert.throws(() => m.resolve({ after: 'nope' }), /isn't in the flow/)
  assert.throws(() => m.resolve({ after: 'a' }, ['a']), /relative to itself/)
})

test('adds nodes', () => {

  const m = model()

  const first = m.add('email', { before: 'a' })
  const end = m.add('stop', { position: 'end' })
  const inNo = m.add('email', { parent: 'b', branch: 'no', position: 'start' }, { title: 'Hi' })

  assert.deepEqual(ids(m), [first.id, 'a', 'b', 'e', end.id])
  assert.deepEqual(ids(m, 'b', 'no'), [inNo.id, 'd'])
  assert.equal(m.get(inNo.id).title, 'Hi')
  assert.throws(() => m.add('nonsense', {}), /Unknown node type/)
  assert.throws(() => m.add('email', {}, { id: 'a' }), /more than once/)
})

test('add ignores init fields that would put the node somewhere else', () => {

  const m = model()
  const node = m.add('email', { after: 'a' }, { parent: 'b', branch: 'yes', type: 'stop' })

  assert.equal(node.type, 'email')
  assert.equal(node.parent, null)
})

test('moves nodes between branches', () => {

  const m = model()

  m.move('e', { parent: 'b', branch: 'yes', position: 'start' })
  assert.deepEqual(ids(m, 'b', 'yes'), ['e', 'c'])
  assert.deepEqual(ids(m), ['a', 'b'])

  m.move('c', { after: 'a' })
  assert.deepEqual(ids(m), ['a', 'c', 'b'])
  assert.deepEqual(m.toJSON().map(node => node.id), ['a', 'c', 'b', 'e', 'd'])
})

test('moves a node within its branch', () => {

  const m = model()

  m.move('a', { after: 'e' })
  assert.deepEqual(ids(m), ['b', 'e', 'a'])

  m.move('a', { before: 'b' })
  assert.deepEqual(ids(m), ['a', 'b', 'e'])
})

test('moving a node takes what is in its branches with it', () => {

  const m = model()

  m.move('b', { after: 'e' })

  assert.deepEqual(m.toJSON().map(node => node.id), ['a', 'e', 'b', 'c', 'd'])
  assert.deepEqual(ids(m, 'b', 'yes'), ['c'])
})

test('won\'t move a node into its own branches', () => {

  const m = model([...sample(), { id: 'f', type: 'if', parent: 'b', branch: 'yes' }])

  assert.throws(() => m.move('b', { parent: 'b', branch: 'yes' }), /own branches/)
  assert.throws(() => m.move('b', { parent: 'f', branch: 'no' }), /own branches/)
  assert.throws(() => m.move('b', { after: 'c' }), /own branches/)
  assert.deepEqual(m.toJSON().map(node => node.id), ['a', 'b', 'c', 'f', 'd', 'e'])
})

test('removes a node and what is in its branches', () => {

  const m = model()
  const removed = m.remove('b')

  assert.deepEqual(removed.map(node => node.id), ['b', 'c', 'd'])
  assert.deepEqual(m.toJSON().map(node => node.id), ['a', 'e'])
  assert.throws(() => m.remove('b'), /isn't in the flow/)
})

test('duplicates a node and what is in its branches', () => {

  let next = 0
  const m = model([...sample(), { id: 'z', type: 'email', locked: true }], { newId: () => `copy${ next++ }` })

  const copy = m.duplicate('b')

  assert.equal(m.children(null, null).findIndex(node => node.id === copy.id), 2)
  assert.equal(m.toJSON().length, 9)

  const inside = m.childrenOf(copy.id)

  assert.deepEqual(inside.map(node => node.branch), ['yes', 'no'])
  assert.ok(inside.every(node => !['c', 'd'].includes(node.id)))

  // originals are untouched
  assert.deepEqual(ids(m, 'b', 'yes'), ['c'])

  const locked = m.duplicate('z')
  assert.equal(locked.locked, undefined)
  assert.equal(m.get('z').locked, true)
})

test('duplicates somewhere else', () => {

  const m = model()
  const copy = m.duplicate('e', { parent: 'b', branch: 'no', position: 'start' })

  assert.deepEqual(ids(m, 'b', 'no'), [copy.id, 'd'])
})

test('updates fields, but not where a node is', () => {

  const m = model()

  m.update('c', { title: 'Welcome', parent: 'a', branch: 'zzz', id: 'q', data: { x: 1 } })

  assert.equal(m.get('c').title, 'Welcome')
  assert.equal(m.get('c').parent, 'b')
  assert.equal(m.get('c').branch, 'yes')
  assert.equal(m.get('c').id, 'c')

  m.update('c', { title: undefined })
  assert.equal('title' in m.get('c'), false)
})

test('keeps nodes in branches a node no longer has', () => {

  const m = model([
    { id: 's', type: 'split', ways: 3 },
    { id: 'x', type: 'email', parent: 's', branch: 'way3' },
  ])

  assert.deepEqual(m.unusedBranches(m.get('s')), [])

  m.update('s', { ways: 2 })

  assert.deepEqual(m.unusedBranches(m.get('s')), ['way3'])
  assert.deepEqual(ids(m, 's', 'way3'), ['x'])
  assert.deepEqual(m.toJSON().map(node => node.id), ['s', 'x'])
})

test('snapshots restore', () => {

  const m = model()
  const before = m.serialize()

  m.remove('b')
  m.restore(before)

  assert.deepEqual(m.toJSON().map(node => node.id), ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(ids(m, 'b', 'yes'), ['c'])
})

test('history undoes and redoes', () => {

  const h = new History()

  h.record('s0')
  h.record('s1')

  assert.equal(h.undo('s2'), 's1')
  assert.equal(h.undo('s1'), 's0')
  assert.equal(h.undo('s0'), null)
  assert.equal(h.redo('s0'), 's1')
  assert.equal(h.redo('s1'), 's2')
  assert.equal(h.redo('s2'), null)
})

test('a new change drops what was undone', () => {

  const h = new History()

  h.record('s0')
  h.undo('s1')
  h.record('s0')

  assert.equal(h.canRedo(), false)
})

test('history merges changes with the same key made close together', () => {

  const h = new History()

  h.record('s0', 'title', 1000)
  h.record('s1', 'title', 1300)
  h.record('s2', 'title', 1600)

  assert.equal(h.past.length, 1)
  assert.equal(h.undo('s3'), 's0')

  h.record('s0', 'title', 5000)
  h.record('s1', 'title', 7000)

  assert.equal(h.past.length, 2)
})

test('history has a limit', () => {

  const h = new History({ limit: 3 })

  for (let i = 0; i < 10; i++) {
    h.record(`s${ i }`)
  }

  assert.deepEqual(h.past, ['s7', 's8', 's9'])
})

test('triggers next to each other are an OR group', () => {

  const m = model([
    { id: 't1', type: 'trigger' },
    { id: 't2', type: 'hook' },
    { id: 'e1', type: 'email' },
    { id: 't3', type: 'trigger' },
  ])

  assert.deepEqual(m.triggerGroup('t2').map(node => node.id), ['t1', 't2'])
  assert.deepEqual(m.triggerGroup('t1').map(node => node.id), ['t1', 't2'])
  assert.deepEqual(m.triggerGroup('t3').map(node => node.id), ['t3'])
  assert.deepEqual(m.triggerGroup('e1'), [])
})

test('a trigger has a branch of its own for the steps that only run after it', () => {

  const m = model([
    { id: 't1', type: 'trigger' },
    { id: 't2', type: 'hook' },
    { id: 'x', type: 'email', parent: 't2' },
    { id: 'e', type: 'email' },
  ])

  assert.equal(m.get('x').branch, 'then')
  assert.deepEqual(m.toJSON().map(node => node.id), ['t1', 't2', 'x', 'e'])
  assert.deepEqual(m.branchesOf(m.get('t1')).map(branch => branch.key), ['then'])

  // dragging the trigger takes its steps with it
  m.move('t2', { after: 'e' })

  assert.deepEqual(m.toJSON().map(node => node.id), ['t1', 'e', 't2', 'x'])
  assert.deepEqual(m.triggerGroup('t1').map(node => node.id), ['t1'])
})

test('adding a trigger next to one joins its group, moving it away leaves', () => {

  const m = model([{ id: 't1', type: 'trigger' }, { id: 'e', type: 'email' }])

  const added = m.add('hook', { after: 't1' })

  assert.deepEqual(m.triggerGroup('t1').map(node => node.id), ['t1', added.id])

  m.move(added.id, { after: 'e' })

  assert.deepEqual(m.triggerGroup('t1').map(node => node.id), ['t1'])
})
