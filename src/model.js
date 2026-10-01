/**
 * The data side of the editor. No DOM access, so it loads and tests in Node.
 *
 * A flow is a flat list of nodes. Each node says where it lives with `parent` (the id of the node whose branch it is
 * in, or null for the main flow) and `branch` (which of the parent's branches). Order within a branch is the order
 * of the list. Nodes can carry any extra fields, they come back untouched.
 *
 *   { id: 'b', type: 'if' }                                    the main flow
 *   { id: 'c', type: 'email', parent: 'b', branch: 'yes' }     in the "yes" branch of b
 */

const clone = value => JSON.parse(JSON.stringify(value))

// ids can be numbers or strings, the DOM only has strings
const sameId = (a, b) => a === null || a === undefined ? b === null || b === undefined : b !== null && b !== undefined && String(a) === String(b)

const RESERVED = ['id', 'parent', 'branch']

const TRIGGER_BRANCH = 'then'

let counter = 0

export const defaultNewId = () => `n_${ Date.now().toString(36) }${ ( counter++ ).toString(36) }${ Math.random().toString(36).slice(2, 5) }`

export class FlowModel {

  /**
   * @param nodes Object[]
   * @param types Object type => { name, branches, ... }, see types/index.d.ts
   * @param newId function() => id for nodes made here
   */
  constructor ({
    nodes = [],
    types = {},
    newId = defaultNewId,
  } = {}) {
    this.types = types
    this.newId = newId
    this.load(nodes)
  }

  /**
   * Replace the nodes, checking they make a tree
   *
   * @param nodes Object[]
   */
  load (nodes) {

    const list = clone(nodes)
    const seen = new Set()

    list.forEach(node => {

      if (node.id === undefined || node.id === null) {
        node.id = this.newId()
      }

      if (seen.has(String(node.id))) {
        throw new Error(`Node id "${ node.id }" is used more than once.`)
      }

      seen.add(String(node.id))

      if (typeof node.type !== 'string' || !node.type) {
        throw new Error(`Node "${ node.id }" doesn't have a type.`)
      }

      node.parent = node.parent ?? null
    })

    const byId = new Map(list.map(node => [String(node.id), node]))

    list.forEach(node => {

      if (node.parent === null) {
        node.branch = null
        return
      }

      const parent = byId.get(String(node.parent))

      if (!parent) {
        throw new Error(`Node "${ node.id }" is in a branch of "${ node.parent }", which isn't in the list.`)
      }

      node.parent = parent.id
      node.branch = node.branch ?? this.branchesOf(parent)[0]?.key ?? 'default'
    })

    // a node can't be inside itself
    list.forEach(node => {
      const path = new Set([String(node.id)])
      for (let parent = byId.get(String(node.parent)); parent; parent = byId.get(String(parent.parent))) {
        if (path.has(String(parent.id))) {
          throw new Error(`Node "${ node.id }" is inside its own branches.`)
        }
        path.add(String(parent.id))
      }
    })

    this.nodes = list
    this.settle()
  }

  // ---- reading

  /**
   * A copy of the nodes, parents before the nodes in their branches
   *
   * @return Object[]
   */
  toJSON () {
    return clone(this.nodes)
  }

  serialize () {
    return JSON.stringify(this.nodes)
  }

  restore (serialized) {
    this.nodes = JSON.parse(serialized)
    this.settle()
  }

  get (id) {
    return this.byId.get(String(id)) ?? null
  }

  has (id) {
    return this.byId.has(String(id))
  }

  /**
   * The nodes in a branch, in order
   *
   * @param parent id|null null for the main flow
   * @param branch string|null
   * @return Object[]
   */
  children (parent = null, branch = null) {
    return this.byBranch.get(branchKey(parent, branch)) ?? []
  }

  /**
   * Every node directly inside a node's branches
   */
  childrenOf (id) {
    return this.byParent.get(String(id)) ?? []
  }

  /**
   * The ids of every node inside a node's branches, at any depth
   */
  descendants (id) {
    return this.childrenOf(id).flatMap(child => [child.id, ...this.descendants(child.id)])
  }

  /**
   * The branches a node's type gives it
   *
   * @param node Object
   * @return {{key: string, name: string, color?: string}[]}
   */
  branchesOf (node) {

    const def = this.types[node.type]
    let branches = typeof def?.branches === 'function' ? def.branches(node) : def?.branches

    // a trigger's own branch is the steps that only run after it, see isTrigger()
    if (!branches && def?.trigger) {
      branches = [{
        key : TRIGGER_BRANCH,
        name: 'Then',
      }]
    }

    return ( branches ?? [] ).map(branch => typeof branch === 'string' ? {
      key : branch,
      name: branch,
    } : {
      name: branch.key,
      ...branch,
    } )
  }

  /**
   * Branches that nodes are in, but the node's type doesn't have (any more)
   */
  unusedBranches (node) {

    const declared = this.branchesOf(node).map(branch => branch.key)

    return [...new Set(this.childrenOf(node.id).map(child => child.branch))].filter(key => !declared.includes(key))
  }

  isTerminal (node) {
    return Boolean(this.types[node.type]?.terminal)
  }

  /**
   * Triggers next to each other in a branch are an OR group, any of them starts or continues the flow.
   * Each can have steps of its own that only run after it, in its first branch ("then" unless the type says otherwise).
   */
  isTrigger (node) {
    return Boolean(this.types[node.type]?.trigger)
  }

  /**
   * The triggers in the same OR group as a trigger, in order
   *
   * @param id
   * @return Object[] empty if the node isn't a trigger
   */
  triggerGroup (id) {

    const node = this.need(id)

    if (!this.isTrigger(node)) {
      return []
    }

    const siblings = this.children(node.parent, node.branch)
    let from = siblings.indexOf(node)
    let to = from

    while (from > 0 && this.isTrigger(siblings[from - 1])) {
      from--
    }

    while (to < siblings.length - 1 && this.isTrigger(siblings[to + 1])) {
      to++
    }

    return siblings.slice(from, to + 1)
  }

  // ---- positions

  /**
   * Where a position in a flow is, as the branch and an index in it
   *
   * @param at Object { after: id } | { before: id } | { parent, branch, position: 'start' | 'end' }
   * @param moving id[] nodes about to be moved, which aren't counted
   * @return {{parent: id|null, branch: string|null, index: number}}
   */
  resolve (at = {}, moving = []) {

    const skip = new Set(moving.map(String))
    const siblings = (parent, branch) => this.children(parent, branch).filter(node => !skip.has(String(node.id)))

    const ref = at.after ?? at.before

    if (ref !== undefined && ref !== null) {

      const node = this.get(ref)

      if (!node) {
        throw new Error(`Node "${ ref }" isn't in the flow.`)
      }

      if (skip.has(String(ref))) {
        throw new Error('A node can\'t be placed relative to itself.')
      }

      return {
        parent: node.parent,
        branch: node.branch,
        index : siblings(node.parent, node.branch).findIndex(sibling => sameId(sibling.id, ref)) + ( at.after !== undefined && at.after !== null ? 1 : 0 ),
      }
    }

    if (at.parent === undefined || at.parent === null) {
      return {
        parent: null,
        branch: null,
        index : at.position === 'start' ? 0 : siblings(null, null).length,
      }
    }

    const parent = this.get(at.parent)

    if (!parent) {
      throw new Error(`Node "${ at.parent }" isn't in the flow.`)
    }

    const branch = at.branch ?? this.branchesOf(parent)[0]?.key ?? 'default'

    return {
      parent: parent.id,
      branch,
      index : at.position === 'start' ? 0 : siblings(parent.id, branch).length,
    }
  }

  /**
   * The position a node is in now, for telling whether dropping it somewhere would change anything
   */
  locationOf (id) {

    const node = this.get(id)

    return {
      parent: node.parent,
      branch: node.branch,
      index : this.children(node.parent, node.branch).findIndex(sibling => sameId(sibling.id, id)),
    }
  }

  // ---- changes, each is checked before anything changes

  /**
   * @param type string
   * @param at Object see resolve()
   * @param init Object fields for the new node, like title
   * @return Object the new node
   */
  add (type, at = {}, init = {}) {

    if (!this.types[type]) {
      throw new Error(`Unknown node type "${ type }".`)
    }

    const loc = this.resolve(at)

    const {
      id = this.newId(),
      ...rest
    } = clone(init)

    if (this.has(id)) {
      throw new Error(`Node id "${ id }" is used more than once.`)
    }

    RESERVED.forEach(key => delete rest[key])
    delete rest.type

    const node = {
      id,
      type,
      parent: null,
      branch: null,
      ...rest,
    }

    this.nodes.push(node)
    this.reindex()
    this.place([node], loc)

    return clone(node)
  }

  /**
   * Move a node, and everything in its branches, somewhere else
   */
  move (id, at) {

    const node = this.need(id)

    const loc = this.resolve(at, [node.id])

    if (loc.parent !== null && ( sameId(loc.parent, node.id) || this.descendants(node.id).some(d => sameId(d, loc.parent)) )) {
      throw new Error('A node can\'t be moved into its own branches.')
    }

    this.place([node], loc)

    return clone(node)
  }

  /**
   * Delete a node and everything in its branches
   *
   * @return Object[] the deleted nodes, the node first
   */
  remove (id) {

    const node = this.need(id)
    const ids = new Set([node.id, ...this.descendants(node.id)].map(String))
    const removed = this.nodes.filter(n => ids.has(String(n.id)))

    this.nodes = this.nodes.filter(n => !ids.has(String(n.id)))
    this.settle()

    return clone(removed)
  }

  /**
   * Copy a node and everything in its branches, with new ids
   *
   * @param id
   * @param at Object where to put the copy, default is right after the original
   * @return Object the copy
   */
  duplicate (id, at) {

    const node = this.need(id)
    const loc = this.resolve(at ?? { after: node.id })

    const ids = [node.id, ...this.descendants(node.id)]
    const renamed = new Map()

    ids.forEach(old => {
      let fresh = this.newId()
      while (this.has(fresh) || [...renamed.values()].includes(fresh)) {
        fresh = this.newId()
      }
      renamed.set(String(old), fresh)
    })

    const copies = ids.map(old => {

      const copy = clone(this.get(old))

      copy.id = renamed.get(String(old))
      delete copy.locked

      if (!sameId(old, node.id)) {
        copy.parent = renamed.get(String(copy.parent))
      }

      return copy
    })

    this.nodes.push(...copies)
    this.reindex()
    this.place([copies[0]], loc)

    return clone(copies[0])
  }

  /**
   * Change a node's fields. Where it is can't change this way, see move()
   *
   * @param id
   * @param patch Object fields to set, undefined removes one
   */
  update (id, patch = {}) {

    const node = this.need(id)

    Object.entries(patch).forEach(([key, value]) => {

      if (RESERVED.includes(key)) {
        return
      }

      if (value === undefined) {
        delete node[key]
        return
      }

      node[key] = clone(value)
    })

    // changing a node's type can change its branches
    this.settle()

    return clone(node)
  }

  // ---- internals

  need (id) {

    const node = this.get(id)

    if (!node) {
      throw new Error(`Node "${ id }" isn't in the flow.`)
    }

    return node
  }

  /**
   * Put nodes in a branch at an index
   */
  place (items, loc) {

    const moving = new Set(items)
    const rest = this.nodes.filter(node => !moving.has(node))
    const siblings = rest.filter(node => sameId(node.parent, loc.parent) && node.branch === loc.branch)

    let at

    if (!siblings.length) {
      at = rest.length
    }
    else if (loc.index >= siblings.length) {
      at = rest.indexOf(siblings[siblings.length - 1]) + 1
    }
    else {
      at = rest.indexOf(siblings[loc.index])
    }

    items.forEach(node => {
      node.parent = loc.parent
      node.branch = loc.branch
    })

    rest.splice(at, 0, ...items)

    this.nodes = rest
    this.settle()
  }

  reindex () {

    this.byId = new Map(this.nodes.map(node => [String(node.id), node]))
    this.byBranch = new Map()
    this.byParent = new Map()

    this.nodes.forEach(node => {

      const key = branchKey(node.parent, node.branch)

      this.byBranch.set(key, [...this.byBranch.get(key) ?? [], node])

      if (node.parent !== null) {
        this.byParent.set(String(node.parent), [...this.byParent.get(String(node.parent)) ?? [], node])
      }
    })
  }

  /**
   * Put the list in its order: the main flow, and under each node the nodes in its branches, in the order the
   * branches are declared
   */
  settle () {

    this.reindex()

    const ordered = []

    const walk = (parent, branch) => {
      this.children(parent, branch).forEach(node => {
        ordered.push(node)
        const keys = [...this.branchesOf(node).map(b => b.key), ...this.unusedBranches(node)]
        new Set(keys).forEach(key => walk(node.id, key))
      })
    }

    walk(null, null)

    this.nodes = ordered
    this.reindex()
  }
}

function branchKey (parent, branch) {
  return parent === null || parent === undefined ? '' : `${ String(parent) }\u0000${ branch }`
}
