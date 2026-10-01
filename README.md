# flow-tree

A zero-dependency editor for flow-tree data: triggers, actions, and branching logic in one vertical flow. Give it a mount point and a list of nodes, and it hands the edited list back whenever something changes.

```js
import { mount } from 'flow-tree'
import 'flow-tree/style.css'

const flow = mount('#editor', {
  nodes: [
    { id: 'a', type: 'form',  title: 'Signup' },
    { id: 'b', type: 'if',    title: 'Opened?' },
    { id: 'c', type: 'email', parent: 'b', branch: 'yes' },
  ],
  types: {
    form:  { name: 'Form submitted', group: 'Triggers', icon: '📝', color: '#8b5cf6' },
    email: { name: 'Send email',     group: 'Actions',  icon: '✉️', color: '#2563eb' },
    if:    { name: 'If / else',      group: 'Logic',    icon: '🔀', color: '#16a34a',
             branches: [{ key: 'yes', name: 'Yes' }, { key: 'no', name: 'No' }] },
  },
  onChange: (nodes, change) => save(nodes),
  onSelect: node => showSettingsFor(node),
})
```

For a `<script>` tag use `dist/flow-tree.min.js`, which gives you `FlowTree.mount(...)`.

## The data

A flat list. Each node says where it is with `parent` (the node whose branch it's in, or nothing for the main flow) and `branch` (which of that node's branches). Order within a branch is the order in the list. `onChange` always gives back the list in a stable order: the main flow, with each node's branches directly after it.

```js
{ id: 'c', type: 'email', parent: 'b', branch: 'yes', title: 'Welcome', anything: 'else you like' }
```

Extra fields are kept untouched, so this is where your own settings go. The list you pass in is never mutated, `onChange` gets a fresh copy each time.

A type with `branches` is a branching node. `branches` can be a function of the node, so a split test can have as many ways as its `ways` field says. Nodes sitting in a branch their type no longer has aren't lost, they're drawn in an "Unused branch" column so they can be moved.

## Trigger groups (OR)

Mark a type with `trigger: true` and triggers that sit next to each other in a branch become an **OR group**: any one of them starts the flow, or lets it continue past a "wait for" point. They're drawn side by side with `OR` between them, and the flow rejoins as one below.

```js
types: { form: { name: 'Form submitted', trigger: true }, hook: { name: 'Webhook', trigger: true }, ... }
nodes: [
  { id: 't1', type: 'form' },
  { id: 't2', type: 'hook' },                                 // next to t1, so t1 OR t2
  { id: 'x',  type: 'tag', parent: 't2', branch: 'then' },    // only runs after the webhook
  { id: 'e',  type: 'email' },                                // runs after either
]
```

- Groups aren't stored anywhere, they're just triggers that are adjacent. Add one next to another to join, move it away to leave.
- Every trigger has a branch of its own (`then` by default) for the steps that should only run after that trigger. Dragging a trigger takes them along.
- The `+` beside a group only offers triggers, and only triggers can be dropped between them.
- Nothing can be put above the triggers a flow starts with.
- `model.triggerGroup(id)` gives you the members of a group.

## What it does

- Add from the `+` on any line, drag nodes anywhere (into branches too, and a node takes what's in its branches with it), duplicate, delete, lock.
- Undo and redo, <kbd>Ctrl/⌘ Z</kbd>, <kbd>Ctrl/⌘ Shift Z</kbd>. <kbd>Delete</kbd> removes the selected node.
- `connectors: 'curved'` draws smooth curves where branches fork and join, instead of right angles. It's an SVG layer measured from the rendered flow, so it redraws on every change and when the editor is resized. Switch at any time with `setConnectors()`.
- Light, dark, or follow the system. Colors and sizes are CSS variables, see the top of `flow-tree.css`.
- Read-only mode for showing a flow.

## A settings panel

The library doesn't draw settings panels, your app knows what a step's settings are. The pattern is: `onSelect` tells you which node to show, your form calls `flow.update()` as people edit, and `onChange` tells you what to save.

```html
<div id="editor"></div>
<form id="panel" hidden>
  <label>Subject <input name="subject"></label>
  <label>Wait (days) <input name="days" type="number" min="1"></label>
</form>
```

```js
const panel = document.getElementById('panel')

// which fields each type has
const fieldsFor = { email: ['subject'], wait: ['days'] }

const flow = mount('#editor', {
  nodes,
  types: {
    email: { name: 'Send email', title: node => node.data?.subject || null },
    wait:  { name: 'Wait',       title: node => node.data?.days && `Wait ${ node.data.days } days` },
  },

  // show the form for the node that was clicked, hide it when nothing is selected
  onSelect: node => fill(node),

  // save, and keep the form in step, because undo and redo change settings too
  onChange: (nodes, change) => {
    save(nodes)
    fill(flow.getSelected(), change.type !== 'update')
  },
})

// put the node's settings in the form, but leave the field being typed in alone
// unless the change didn't come from typing (undo, redo)
function fill (node, force = false) {

  panel.hidden = !node

  if (!node) return

  panel.dataset.id = node.id

  for (const input of panel.elements) {
    // only the fields this type has
    input.closest('label').hidden = !fieldsFor[node.type]?.includes(input.name)

    if (force || document.activeElement !== input) {
      input.value = node.data?.[input.name] ?? ''
    }
  }
}

// edit
panel.addEventListener('input', e => {

  const node = flow.getNode(panel.dataset.id)
  const value = e.target.type === 'number' ? e.target.valueAsNumber : e.target.value

  if (!node || Number.isNaN(value)) return

  flow.update(node.id, {
    // update() replaces each field you give it, so spread what's there to keep the rest
    data: { ...node.data, [e.target.name]: value },
  }, {
    // a burst of typing in one field is one undo step
    coalesce: `${ node.id }:${ e.target.name }`,
  })
})
```

Things worth knowing about `update(id, patch, options?)`:

- It sets the fields in `patch` and leaves the others. It's **shallow**: `{ data: { days: 3 } }` replaces the whole `data` object, so spread the old one like above, or keep settings as top-level fields.
- `undefined` removes a field: `flow.update(id, { title: undefined })`.
- It can't move a node. `id`, `parent` and `branch` in the patch are ignored, use `move()` for that.
- It redraws the card and calls `onChange` with `{ type: 'update', ids: [id] }`.
- Changes with the same `coalesce` key made within a second of each other are one undo step. Without it, every keystroke is its own step.
- It works while the node is locked. Locking only stops dragging and deleting from the UI.
- Changing a setting can change a node's branches when its type works them out from the node, like a split test with a number of ways. Nodes in a branch that's gone aren't deleted, they show in an "Unused branch" column.

`demo/index.html` has a complete version of this, with a panel built from a list of fields for each type.

## Titles

A card is titled with the node's own `title` if it has one. Otherwise the type's `title` is used: a string, or a function of the node, so the title can come from the settings and follow them as they change. If there's none, or the function returns nothing, it's the type's `name`.

```js
types: {
  wait: { name: 'Wait', title: node => node.data?.days && `Wait ${ node.data.days } days` },
}

flow.getTitle('w1')   // 'Wait 3 days', whichever of the three it came from
```

The type's name is shown under a title that's different from it. `renderNode(node, type, title)` is given the title if you draw the card yourself.

## API

| | |
|---|---|
| `getNodes()` `getNode(id)` `getSelected()` `getTitle(id)` | read, always copies |
| `setNodes(nodes)` | replace, like on load. Doesn't call `onChange`, clears undo |
| `add(type, at?, init?)` `move(id, at)` `remove(id)` `duplicate(id, at?)` `update(id, patch, opts?)` `lock(id)` `unlock(id)` | change, each calls `onChange` |
| `undo()` `redo()` `canUndo()` `canRedo()` | history |
| `select(id \| null)` | selection |
| `setReadOnly()` `setTypes()` `setTheme()` `setConnectors()` `render()` `destroy()` | housekeeping |

Positions (`at`) are `{ after: id }`, `{ before: id }`, or `{ parent, branch, position: 'start' | 'end' }`. Leave out `parent` for the main flow.

Options and types are in [`types/index.d.ts`](types/index.d.ts). Notable ones: `renderNode` (draw your own card contents), `pickType` (bring your own add menu), `newId`, `readOnly`, `theme`, `connectors`.

`FlowModel` is exported too, it has no DOM so you can validate and edit flows on a server.

## Developing

```sh
npm install
npm test        # model and history, in Node
npm run build   # dist/: esm, cjs, iife, min, css
npm run demo    # http://localhost:5173/demo/
```

## Not done yet

- Touch scrolling: nodes capture touch so they can be dragged, which makes scrolling from a node awkward on phones.
- Keyboard moving of nodes. Selecting, deleting, undo and add (Tab to a `+`, Enter) work.
- The loop and skip lines of Groundhogg's logic editor, and its trigger options like pass-through. Branches and OR groups are here, arbitrary jumps between nodes aren't.
- Nothing is virtualised. Hundreds of nodes are fine, thousands will be slow because every change redraws.

## License

MIT
