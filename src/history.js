/**
 * Undo and redo as snapshots of the nodes, flows are small and it can't drift from the model
 */
export class History {

  constructor ({ limit = 100 } = {}) {
    this.limit = limit
    this.clear()
  }

  clear () {
    this.past = []
    this.future = []
    this.lastKey = null
    this.lastTime = 0
  }

  /**
   * Remember the state from before a change
   *
   * @param before string the snapshot from before it
   * @param coalesce string|undefined changes with the same key made close together are one entry, like typing in a field
   * @param now number
   */
  record (before, coalesce, now = Date.now()) {

    const merge = coalesce !== undefined && coalesce === this.lastKey && now - this.lastTime < 1000 && this.past.length

    this.future = []
    this.lastKey = coalesce ?? null
    this.lastTime = now

    if (merge) {
      return
    }

    this.past.push(before)

    if (this.past.length > this.limit) {
      this.past.shift()
    }
  }

  canUndo () {
    return this.past.length > 0
  }

  canRedo () {
    return this.future.length > 0
  }

  /**
   * @param current string the snapshot now
   * @return string|null the snapshot to go back to
   */
  undo (current) {

    if (!this.canUndo()) {
      return null
    }

    this.future.push(current)
    this.lastKey = null

    return this.past.pop()
  }

  redo (current) {

    if (!this.canRedo()) {
      return null
    }

    this.past.push(current)
    this.lastKey = null

    return this.future.pop()
  }
}
