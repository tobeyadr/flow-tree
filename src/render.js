/**
 * Draws a model as elements. It's a pure function of the model and the options, the controller redraws after each change.
 *
 * Every branch is a column of nodes with a gap before each one and a gap after the last. The gaps are the
 * lines between nodes, they hold the add buttons, and they're where dragged nodes can be dropped.
 */
import { h, icon } from './dom.js'

const IMAGE = /^(https?:|data:image\/|blob:|\.{0,2}\/)/

/**
 * A type's icon: an image URL, or anything else is shown as text, like an emoji
 */
const Icon = def => {

  if (!def.icon) {
    return h('span', { class: 'ft-icon' }, ( def.name ?? '?' ).slice(0, 1).toUpperCase())
  }

  return h('span', { class: 'ft-icon' }, IMAGE.test(def.icon) ? h('img', {
    src: def.icon,
    alt: '',
  }) : def.icon)
}

/**
 * @param model FlowModel
 * @param options {{ readOnly: boolean, emptyLabel: string, renderNode: Function|undefined, selected: any }}
 * @return {{ el: HTMLElement, cards: Map<string, HTMLElement>, gaps: { el: HTMLElement, at: Object }[] }}
 */
export const renderFlow = (model, {
  readOnly = false,
  emptyLabel = 'Add step',
  renderNode,
  selected = null,
}) => {

  const cards = new Map()
  const gaps = []

  /**
   * @param at Object where adding or dropping here puts a node
   * @param only string|undefined a type flag, only types with it can be added or dropped here
   */
  const Gap = (at, { label = null, hidden = false, only } = {}) => {

    if (hidden) {
      return null
    }

    const el = h('div', { class: `ft-gap${ label ? ' ft-gap-empty' : '' }` }, readOnly ? null : h('button', {
      type        : 'button',
      class       : `ft-add${ label ? ' ft-add-label' : '' }`,
      'aria-label': label ?? 'Add step',
    }, [icon('plus', 12), label]))

    gaps.push({
      el,
      at,
      only,
    })

    return el
  }

  /**
   * The "OR" between two triggers, which a trigger can be dropped on to go between them
   */
  const OrSlot = at => {

    const label = h('span', { class: 'ft-or-label' }, 'OR')
    const el = h('div', { class: 'ft-or' }, label)

    if (!readOnly) {
      gaps.push({
        el,
        hit : label,
        at,
        only: 'trigger',
      })
    }

    return el
  }

  /**
   * The add button after a group's last trigger, for another trigger
   */
  const AddTrigger = at => {

    if (readOnly) {
      return null
    }

    const el = h('div', { class: 'ft-or-add' }, h('button', {
      type        : 'button',
      class       : 'ft-add',
      'aria-label': 'Add trigger',
      title       : 'Add trigger',
    }, icon('plus', 12)))

    gaps.push({
      el,
      at,
      only: 'trigger',
    })

    return el
  }

  const Actions = node => readOnly ? null : h('div', { class: 'ft-actions' }, [
    h('button', {
      type         : 'button',
      class        : 'ft-action',
      'data-action': node.locked ? 'unlock' : 'lock',
      title        : node.locked ? 'Unlock' : 'Lock',
      'aria-label' : node.locked ? 'Unlock' : 'Lock',
    }, icon(node.locked ? 'unlock' : 'lock')),
    h('button', {
      type         : 'button',
      class        : 'ft-action',
      'data-action': 'duplicate',
      title        : 'Duplicate',
      'aria-label' : 'Duplicate',
    }, icon('duplicate')),
    h('button', {
      type         : 'button',
      class        : 'ft-action ft-danger',
      'data-action': 'delete',
      title        : 'Delete',
      'aria-label' : 'Delete',
      disabled     : Boolean(node.locked),
    }, icon('trash')),
  ])

  const Card = node => {

    const def = model.types[node.type]
    const known = Boolean(def)
    const title = model.titleOf(node)

    const body = renderNode?.(node, def, title) ?? [
      h('div', { class: 'ft-title' }, title),
      def?.name && def.name !== title ? h('div', { class: 'ft-sub' }, def.name) : null,
    ]

    const el = h('div', {
      class     : ['ft-node', node.locked ? 'ft-locked' : '', known ? '' : 'ft-unknown', model.isTerminal(node) ? 'ft-terminal' : '', String(node.id) === String(selected) ? 'ft-selected' : ''].filter(Boolean).join(' '),
      dataset   : { id: node.id, type: node.type },
      style     : def?.color ? { '--ft-node-color': def.color } : null,
      tabindex  : 0,
      role      : 'button',
      'aria-label': title,
    }, [
      Icon(def ?? {}),
      h('div', { class: 'ft-text' }, body),
      node.locked ? h('span', { class: 'ft-lock' }, icon('lock', 12)) : null,
      Actions(node),
    ])

    cards.set(String(node.id), el)

    return el
  }

  const Column = (node, branch, { unused = false } = {}) => {

    const nodes = model.children(node.id, branch.key)
    const ended = nodes.length > 0 && model.isTerminal(nodes[nodes.length - 1])

    return h('div', {
      class: ['ft-col', ended ? 'ft-ended' : '', unused ? 'ft-unused' : ''].filter(Boolean).join(' '),
      style: branch.color ? { '--ft-branch-color': branch.color } : null,
    }, [
      h('div', { class: 'ft-col-head' }, h('span', { class: 'ft-label' }, unused ? 'Unused branch' : branch.name)),
      Branch(node.id, branch.key),
      h('div', { class: 'ft-col-foot' }),
    ])
  }

  const Split = node => {

    const branches = model.branchesOf(node)
    const unused = model.unusedBranches(node)

    const columns = [
      ...branches.map(branch => Column(node, branch)),
      ...unused.map(key => Column(node, {
        key,
        name: key,
      }, { unused: true })),
    ]

    if (!columns.length) {
      return null
    }

    const allEnded = [...branches.map(b => b.key), ...unused].every(key => {
      const nodes = model.children(node.id, key)
      return nodes.length && model.isTerminal(nodes[nodes.length - 1])
    })

    return [
      h('div', { class: 'ft-link' }),
      h('div', { class: `ft-split${ allEnded ? ' ft-all-ended' : '' }` }, columns),
    ]
  }

  const Item = node => h('div', { class: 'ft-item' }, [Card(node), Split(node)])

  /**
   * Triggers next to each other: any of them starts or continues the flow, and each has its own steps that only run
   * after it. Below them the flow carries on as one.
   */
  const TriggerGroup = group => {

    const several = group.length > 1

    const columns = group.flatMap((node, i) => {

      const branch = model.branchesOf(node)[0]?.key
      const own = branch === undefined ? [] : model.children(node.id, branch)
      const showBranch = branch !== undefined && ( several || own.length > 0 )

      return [
        i > 0 ? OrSlot({ after: group[i - 1].id }) : null,
        h('div', { class: `ft-col ft-tcol${ own.length && model.isTerminal(own[own.length - 1]) ? ' ft-ended' : '' }` }, [
          Card(node),
          showBranch ? Branch(node.id, branch) : null,
          showBranch ? h('div', { class: 'ft-col-foot' }) : null,
        ]),
      ]
    })

    return h('div', { class: 'ft-group' }, [
      h('div', { class: `ft-tcols${ several ? ' ft-several' : '' }` }, columns),
      AddTrigger({ after: group[group.length - 1].id }),
    ])
  }

  /**
   * The nodes in a branch, with a gap before each and after the last
   */
  const Branch = (parent, branch) => {

    const nodes = model.children(parent, branch)
    const where = parent === null ? {} : {
      parent,
      branch,
    }

    const empty = nodes.length === 0 && parent === null

    const items = []

    for (let i = 0; i < nodes.length; i++) {

      const node = nodes[i]

      items.push(Gap(i === 0 ? {
        ...where,
        position: 'start',
      } : { after: nodes[i - 1].id }, {
        // nothing runs after a node that ends the flow, so nothing goes right after it,
        // and nothing goes before the triggers the flow starts with
        hidden: ( i > 0 && model.isTerminal(nodes[i - 1]) ) || ( parent === null && i === 0 && model.isTrigger(node) ),
      }))

      if (!model.isTrigger(node)) {
        items.push(Item(node))
        continue
      }

      // triggers next to each other are one OR group
      const group = [node]

      while (i + 1 < nodes.length && model.isTrigger(nodes[i + 1])) {
        group.push(nodes[++i])
      }

      items.push(TriggerGroup(group))
    }

    return h('div', {
      class  : 'ft-branch',
      dataset: {
        parent: parent ?? '',
        branch: branch ?? '',
      },
    }, [
      ...items,
      Gap(nodes.length ? { after: nodes[nodes.length - 1].id } : {
        ...where,
        position: 'end',
      }, {
        label : empty ? emptyLabel : null,
        hidden: nodes.length > 0 && model.isTerminal(nodes[nodes.length - 1]),
      }),
    ])
  }

  const el = h('div', { class: 'ft-flow' }, [
    h('div', { class: 'ft-start' }),
    Branch(null, null),
    h('div', { class: 'ft-finish' }),
  ])

  return {
    el,
    cards,
    gaps,
  }
}
