import { FlowModel, defaultNewId } from './model.js'
import { History } from './history.js'
import { renderFlow } from './render.js'
import { attachDrag } from './drag.js'
import { pickType as defaultPicker } from './picker.js'

const isTyping = el => el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')

export class FlowTree {

  /**
   * @param target string|HTMLElement where to draw the flow
   * @param options Object see types/index.d.ts
   */
  constructor (target, options = {}) {

    const root = typeof target === 'string' ? document.querySelector(target) : target

    if (!root) {
      throw new Error(`FlowTree: can't find ${ target }.`)
    }

    this.root = root
    this.options = options
    this.readOnly = Boolean(options.readOnly)
    this.selected = null
    this.gaps = []
    this.cards = new Map()
    this.aborts = new AbortController()

    this.model = new FlowModel({
      nodes: options.nodes ?? [],
      types: options.types ?? {},
      newId: options.newId ?? defaultNewId,
    })

    this.history = new History({ limit: options.historyLimit ?? 100 })

    root.classList.add('ft-root')
    root.setAttribute('tabindex', '-1')
    root.setAttribute('data-theme', options.theme ?? 'auto')
    root.classList.toggle('ft-readonly', this.readOnly)

    this.listeners = [
      [root, 'click', e => this.onClick(e)],
      [root, 'keydown', e => this.onKeydown(e)],
    ]

    this.listeners.forEach(([el, type, fn]) => el.addEventListener(type, fn))
    this.stopDrag = attachDrag(this)

    this.render()
  }

  // ---- reading

  /**
   * @return Object[] a copy of the nodes, in order, parents before what's in their branches
   */
  getNodes () {
    return this.model.toJSON()
  }

  getNode (id) {
    const node = this.model.get(id)
    return node ? JSON.parse(JSON.stringify(node)) : null
  }

  getSelected () {
    return this.selected === null ? null : this.getNode(this.selected)
  }

  // ---- changing

  /**
   * Replace the nodes, like when they're loaded. Doesn't call onChange, and undo history starts again.
   *
   * @param nodes Object[]
   */
  setNodes (nodes) {

    this.model.load(nodes)
    this.history.clear()

    if (this.selected !== null && !this.model.has(this.selected)) {
      this.select(null)
    }

    this.render()
  }

  /**
   * @param type string
   * @param at Object { after: id } | { before: id } | { parent, branch, position: 'start' | 'end' }, default is the end of the main flow
   * @param init Object fields for the new node, like title
   * @return Object the new node
   */
  add (type, at = { position: 'end' }, init = {}) {
    return this.change({
      type: 'add',
      run : () => this.model.add(type, at, init),
      ids : node => [node.id],
    })
  }

  /**
   * Move a node, and what's in its branches
   */
  move (id, at) {
    return this.change({
      type: 'move',
      run : () => this.model.move(id, at),
      ids : () => [id],
    })
  }

  /**
   * Delete a node, and what's in its branches
   *
   * @return Object[] the deleted nodes
   */
  remove (id) {
    return this.change({
      type: 'remove',
      run : () => this.model.remove(id),
      ids : removed => removed.map(node => node.id),
    })
  }

  /**
   * @return Object the copy
   */
  duplicate (id, at) {
    return this.change({
      type: 'duplicate',
      run : () => this.model.duplicate(id, at),
      ids : copy => [copy.id],
    })
  }

  /**
   * Change a node's fields. Where it is can't change this way, see move()
   *
   * @param id
   * @param patch Object fields to set, undefined removes one
   * @param opts {{ coalesce?: string }} changes with the same key made close together are one undo step, for typing
   */
  update (id, patch, { coalesce } = {}) {
    return this.change({
      type: 'update',
      run : () => this.model.update(id, patch),
      ids : () => [id],
      coalesce,
    })
  }

  lock (id) {
    return this.update(id, { locked: true })
  }

  unlock (id) {
    return this.update(id, { locked: undefined })
  }

  /**
   * Run a change, then redraw and tell the host. Nothing happens if it didn't change anything.
   */
  change ({ type, run, ids, coalesce }) {

    const before = this.model.serialize()
    let result

    try {
      result = run()
    }
    catch (err) {
      this.model.restore(before)
      throw err
    }

    if (this.model.serialize() === before) {
      return result
    }

    this.history.record(before, coalesce)
    this.changed({
      type,
      ids: ids(result),
    })

    return result
  }

  undo () {
    return this.travel('undo')
  }

  redo () {
    return this.travel('redo')
  }

  canUndo () {
    return this.history.canUndo()
  }

  canRedo () {
    return this.history.canRedo()
  }

  travel (direction) {

    const snapshot = this.history[direction](this.model.serialize())

    if (snapshot === null) {
      return false
    }

    this.model.restore(snapshot)
    this.changed({
      type: direction,
      ids : [],
    })

    return true
  }

  changed (change) {

    if (this.selected !== null && !this.model.has(this.selected)) {
      this.select(null)
    }

    this.render()
    this.options.onChange?.(this.getNodes(), change)
  }

  // ---- selecting

  /**
   * @param id id|null
   * @param opts {{ scroll?: boolean, silent?: boolean }}
   */
  select (id, { scroll = false, silent = false } = {}) {

    const next = id === null || id === undefined || !this.model.has(id) ? null : this.model.get(id).id

    if (next === this.selected) {
      return
    }

    this.cards.get(String(this.selected))?.classList.remove('ft-selected')
    this.selected = next

    const card = this.cards.get(String(next))

    card?.classList.add('ft-selected')

    if (scroll) {
      card?.scrollIntoView({
        block : 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      })
    }

    if (!silent) {
      this.options.onSelect?.(this.getSelected())
    }
  }

  // ---- options

  setReadOnly (readOnly) {
    this.readOnly = Boolean(readOnly)
    this.root.classList.toggle('ft-readonly', this.readOnly)
    this.render()
  }

  /**
   * Change the node types, like when more become available
   */
  setTypes (types) {
    this.model.types = types
    this.model.settle()
    this.render()
  }

  setTheme (theme) {
    this.root.setAttribute('data-theme', theme)
  }

  // ---- drawing

  /**
   * Draw again, for when what renderNode shows has changed
   */
  render () {

    const active = document.activeElement
    const focused = active?.closest?.('.ft-node') && this.root.contains(active) ? active.dataset.id : null

    const { el, cards, gaps } = renderFlow(this.model, {
      readOnly   : this.readOnly,
      emptyLabel : this.options.emptyLabel,
      renderNode : this.options.renderNode,
      selected   : this.selected,
    })

    this.cards = cards
    this.gaps = gaps

    this.root.querySelector(':scope > .ft-flow')?.remove()
    this.root.prepend(el)

    if (focused !== null) {
      ( this.cards.get(focused) ?? this.root ).focus({ preventScroll: true })
    }
  }

  destroy () {
    this.aborts.abort()
    this.stopDrag()
    this.listeners.forEach(([el, type, fn]) => el.removeEventListener(type, fn))
    this.root.querySelector(':scope > .ft-flow')?.remove()
    this.root.querySelector(':scope > .ft-popover')?.remove()
    this.root.classList.remove('ft-root', 'ft-readonly', 'ft-dragging')
    this.root.removeAttribute('data-theme')
  }

  // ---- events

  /**
   * The click after a drag is dropped shouldn't select the node it ended on
   */
  ignoreClick () {
    this.ignoring = true
    setTimeout(() => this.ignoring = false, 0)
  }

  onClick (e) {

    if (this.ignoring) {
      return
    }

    const add = e.target.closest('.ft-add')

    if (add) {
      this.openPicker(add)
      return
    }

    const card = e.target.closest('.ft-node')

    if (!card) {
      if (e.target === this.root || e.target.closest('.ft-flow')) {
        this.select(null)
      }
      return
    }

    const action = e.target.closest('[data-action]')

    if (action && !action.disabled && !this.readOnly) {
      this.act(action.dataset.action, card.dataset.id)
      return
    }

    this.select(card.dataset.id)
  }

  act (action, id) {

    if (action === 'delete') {
      this.remove(id)
    }
    else if (action === 'duplicate') {
      this.select(this.duplicate(id).id)
    }
    else if (action === 'lock') {
      this.lock(id)
    }
    else if (action === 'unlock') {
      this.unlock(id)
    }
  }

  async openPicker (button) {

    if (this.readOnly) {
      return
    }

    const gap = this.gaps.find(gap => gap.el.contains(button))

    if (!gap) {
      return
    }

    const choose = this.options.pickType ?? defaultPicker

    let choice

    try {
      choice = await choose({
        root  : this.root,
        anchor: button,
        at    : gap.at,
        types : this.model.types,
        signal: this.aborts.signal,
      })
    }
    catch (err) {
      console.error(err)
      return
    }

    if (!choice) {
      return
    }

    const { type, init } = typeof choice === 'string' ? { type: choice } : choice

    try {
      const node = this.add(type, gap.at, init)

      this.select(node.id)
      this.cards.get(String(node.id))?.focus({ preventScroll: true })
    }
    catch (err) {
      console.error(err)
    }
  }

  onKeydown (e) {

    if (isTyping(e.target) || e.target.closest?.('.ft-popover')) {
      return
    }

    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()

    if (mod && key === 'z' && !this.readOnly) {
      e.preventDefault()
      e.shiftKey ? this.redo() : this.undo()
      return
    }

    if (mod && key === 'y' && !this.readOnly) {
      e.preventDefault()
      this.redo()
      return
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected !== null && !this.readOnly) {

      const node = this.model.get(this.selected)

      if (node && !node.locked) {
        e.preventDefault()
        this.remove(node.id)
      }

      return
    }

    if (e.key === 'Enter' || e.key === ' ') {

      const card = e.target.closest?.('.ft-node')

      if (card && e.target === card) {
        e.preventDefault()
        this.select(card.dataset.id)
      }
    }
  }
}

/**
 * @param target string|HTMLElement
 * @param options Object
 * @return FlowTree
 */
export const mount = (target, options) => new FlowTree(target, options)
