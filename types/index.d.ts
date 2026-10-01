export type Id = string | number

/**
 * One node of a flow. Order within a branch is the order of the list.
 * Any other fields you add are kept and returned untouched.
 */
export interface FlowNode {
  /** Made for you if you leave it out */
  id?: Id
  /** A key of `types` */
  type: string
  /** The node whose branch this one is in, null or missing for the main flow */
  parent?: Id | null
  /** Which of the parent's branches, defaults to the parent's first */
  branch?: string | null
  /** Shown instead of the type's name */
  title?: string
  /** Locked nodes can't be dragged or deleted from the UI */
  locked?: boolean
  [field: string]: unknown
}

export interface BranchDef {
  key: string
  name?: string
  /** Any CSS color, for the label */
  color?: string
}

export interface NodeType {
  name: string
  /** Types are grouped by this in the picker */
  group?: string
  /** An image URL, or text like an emoji */
  icon?: string
  /** Any CSS color */
  color?: string
  description?: string
  /** Makes this a node with branches. A function gets the node, so the branches can depend on it. */
  branches?: Array<string | BranchDef> | ((node: FlowNode) => Array<string | BranchDef>)
  /**
   * Makes this a trigger. Triggers next to each other in a branch are an OR group: any one of them starts or
   * continues the flow. Each has steps of its own that only run after it, in its first branch ("then" unless
   * `branches` says otherwise). The group at the very start of the flow has nothing above it.
   */
  trigger?: boolean
  /** Nothing can run after it, so no add button follows it and its branch doesn't join the others */
  terminal?: boolean
  /** Set false to leave it out of the picker, default true */
  addable?: boolean
}

/** Where to put something */
export type At =
  | { after: Id }
  | { before: Id }
  | { parent?: Id | null; branch?: string; position?: 'start' | 'end' }

export interface Change {
  type: 'add' | 'move' | 'remove' | 'duplicate' | 'update' | 'undo' | 'redo'
  /** The nodes it was about, none for undo and redo */
  ids: Id[]
}

export interface PickTypeArgs {
  root: HTMLElement
  anchor: HTMLElement
  at: At
  /** The types that can go here, only triggers for the add button of an OR group */
  types: Record<string, NodeType>
  signal: AbortSignal
}

export interface FlowTreeOptions {
  nodes?: FlowNode[]
  types?: Record<string, NodeType>

  /** Called with the edited list after every change made in the UI, or by add(), move(), and so on. Not called by setNodes(). */
  onChange?: (nodes: FlowNode[], change: Change) => void
  /** Called with the node that was selected, or null */
  onSelect?: (node: FlowNode | null) => void

  /**
   * Draw what's inside a node's card, next to its icon. Return an element or text, never HTML.
   * Return nothing for the default (title and type name).
   */
  renderNode?: (node: FlowNode, type: NodeType | undefined) => Node | string | Array<Node | string> | null | undefined

  /** Use your own picker. Resolve with a type key, `{ type, init }` to start the node with fields, or null to cancel. */
  pickType?: (args: PickTypeArgs) => Promise<string | { type: string; init?: Partial<FlowNode> } | null>

  /** Make ids for new nodes, default is random */
  newId?: () => Id
  readOnly?: boolean
  /** How branches fork and join, default is 'straight' (right angles) */
  connectors?: 'straight' | 'curved'
  theme?: 'auto' | 'light' | 'dark'
  /** Label of the button in an empty flow, default "Add step" */
  emptyLabel?: string
  /** Undo steps to keep, default 100 */
  historyLimit?: number
}

export class FlowTree {
  constructor(target: string | HTMLElement, options?: FlowTreeOptions)

  readonly root: HTMLElement

  /** A copy of the nodes, parents before what's in their branches */
  getNodes(): FlowNode[]
  getNode(id: Id): FlowNode | null
  getSelected(): FlowNode | null

  /** Replace the nodes, like when they're loaded. Doesn't call onChange, and clears undo history. Throws if they aren't a tree. */
  setNodes(nodes: FlowNode[]): void

  /** Default position is the end of the main flow. Returns the new node. */
  add(type: string, at?: At, init?: Partial<FlowNode>): FlowNode
  /** Moves a node and what's in its branches. Throws if that would put it inside itself. */
  move(id: Id, at: At): FlowNode
  /** Deletes a node and what's in its branches, returns everything deleted */
  remove(id: Id): FlowNode[]
  /** Copies a node and what's in its branches, by default right after it. Returns the copy. */
  duplicate(id: Id, at?: At): FlowNode
  /**
   * Set fields, undefined removes one. Where a node is can't change this way, use move().
   * Updates with the same `coalesce` key made within a second are one undo step, for typing.
   */
  update(id: Id, patch: Partial<FlowNode>, options?: { coalesce?: string }): FlowNode
  lock(id: Id): FlowNode
  unlock(id: Id): FlowNode

  undo(): boolean
  redo(): boolean
  canUndo(): boolean
  canRedo(): boolean

  select(id: Id | null, options?: { scroll?: boolean; silent?: boolean }): void

  setReadOnly(readOnly: boolean): void
  setTypes(types: Record<string, NodeType>): void
  setTheme(theme: 'auto' | 'light' | 'dark'): void
  setConnectors(connectors: 'straight' | 'curved'): void
  /** Draw again, for when what renderNode shows has changed */
  render(): void
  destroy(): void
}

export function mount(target: string | HTMLElement, options?: FlowTreeOptions): FlowTree

/** The data model on its own, with no DOM. Useful for validating or editing flows on a server. */
export class FlowModel {
  constructor(options?: { nodes?: FlowNode[]; types?: Record<string, NodeType>; newId?: () => Id })
  toJSON(): FlowNode[]
  add(type: string, at?: At, init?: Partial<FlowNode>): FlowNode
  move(id: Id, at: At): FlowNode
  remove(id: Id): FlowNode[]
  duplicate(id: Id, at?: At): FlowNode
  update(id: Id, patch: Partial<FlowNode>): FlowNode
  get(id: Id): FlowNode | null
  children(parent?: Id | null, branch?: string | null): FlowNode[]
  descendants(id: Id): Id[]
  isTrigger(node: FlowNode): boolean
  /** The triggers in the same OR group, in order, empty if the node isn't a trigger */
  triggerGroup(id: Id): FlowNode[]
}
