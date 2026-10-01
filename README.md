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

## What it does

- Add from the `+` on any line, drag nodes anywhere (into branches too, and a node takes what's in its branches with it), duplicate, delete, lock.
- Undo and redo, <kbd>Ctrl/⌘ Z</kbd>, <kbd>Ctrl/⌘ Shift Z</kbd>. <kbd>Delete</kbd> removes the selected node.
- Light, dark, or follow the system. Colors and sizes are CSS variables, see the top of `flow-tree.css`.
- Read-only mode for showing a flow.

It deliberately doesn't draw settings panels. Selecting a node calls `onSelect`, show your own form and call `flow.update(id, patch)`. Pass `{ coalesce: 'title' }` while someone is typing so a burst of edits is one undo step.

## API

| | |
|---|---|
| `getNodes()` `getNode(id)` `getSelected()` | read, always copies |
| `setNodes(nodes)` | replace, like on load. Doesn't call `onChange`, clears undo |
| `add(type, at?, init?)` `move(id, at)` `remove(id)` `duplicate(id, at?)` `update(id, patch, opts?)` `lock(id)` `unlock(id)` | change, each calls `onChange` |
| `undo()` `redo()` `canUndo()` `canRedo()` | history |
| `select(id \| null)` | selection |
| `setReadOnly()` `setTypes()` `setTheme()` `render()` `destroy()` | housekeeping |

Positions (`at`) are `{ after: id }`, `{ before: id }`, or `{ parent, branch, position: 'start' | 'end' }`. Leave out `parent` for the main flow.

Options and types are in [`types/index.d.ts`](types/index.d.ts). Notable ones: `renderNode` (draw your own card contents), `pickType` (bring your own add menu), `newId`, `readOnly`, `theme`.

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
- Groundhogg's trigger groups ("OR" benchmarks that hold their own branch) and the loop and skip lines of its logic editor. Only the tree structure is here.
- Nothing is virtualised. Hundreds of nodes are fine, thousands will be slow because every change redraws.
