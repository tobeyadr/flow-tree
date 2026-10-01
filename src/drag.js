/**
 * Moving nodes by dragging them to a gap. Pointer events, so it's the same for mouse, pen, and touch.
 */
import { h } from './dom.js'

const THRESHOLD = 6 // px before a press becomes a drag
const REACH = 90 // px, how near a gap the pointer has to be to pick it
const EDGE = 48 // px from the edge where it starts to scroll
const SPEED = 14

const distance = (x, y, rect) => Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom))

/**
 * @param tree FlowTree
 * @return function stops listening
 */
export const attachDrag = tree => {

  const root = tree.root
  let press = null // pointer is down on a node
  let drag = null // and has moved far enough

  const onDown = e => {

    if (e.button !== 0 || tree.readOnly || press) {
      return
    }

    const card = e.target.closest?.('.ft-node')

    if (!card || !root.contains(card) || e.target.closest('.ft-actions')) {
      return
    }

    const node = tree.model.get(card.dataset.id)

    if (!node || node.locked) {
      return
    }

    press = {
      node,
      card,
      x: e.clientX,
      y: e.clientY,
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', onKey, true)
  }

  const start = () => {

    const { node, card } = press
    const inside = new Set([node.id, ...tree.model.descendants(node.id)].map(String))
    const here = tree.model.locationOf(node.id)

    const targets = tree.gaps.filter(gap => {

      let loc

      try {
        loc = tree.model.resolve(gap.at, [node.id])
      }
      catch (err) {
        return false
      }

      // inside what's being dragged, or where it already is
      const valid = ( loc.parent === null || !inside.has(String(loc.parent)) ) && !( String(loc.parent) === String(here.parent) && loc.branch === here.branch && loc.index === here.index )

      gap.el.classList.toggle('ft-gap-off', !valid)

      return valid
    })

    const ghost = h('div', { class: 'ft-ghost' }, card.querySelector('.ft-icon')?.cloneNode(true))

    root.appendChild(ghost)
    root.classList.add('ft-dragging')
    card.closest('.ft-item')?.classList.add('ft-drag-source')

    drag = {
      node,
      ghost,
      targets,
      active: null,
      x     : press.x,
      y     : press.y,
      frame : requestAnimationFrame(tick),
    }
  }

  /**
   * Pick the gap nearest the pointer, within reach
   */
  const pick = () => {

    let best = null
    let bestDistance = REACH

    drag.targets.forEach(gap => {

      const d = distance(drag.x, drag.y, gap.el.getBoundingClientRect())

      if (d < bestDistance) {
        best = gap
        bestDistance = d
      }
    })

    if (best !== drag.active) {
      drag.active?.el.classList.remove('ft-gap-active')
      best?.el.classList.add('ft-gap-active')
      drag.active = best
    }
  }

  /**
   * Scroll when the pointer is near the edge of the editor, or the window if the editor doesn't scroll
   */
  const tick = () => {

    if (!drag) {
      return
    }

    const rect = root.getBoundingClientRect()
    const scrolls = root.scrollHeight > root.clientHeight + 1 || root.scrollWidth > root.clientWidth + 1

    const bounds = scrolls ? {
      left  : Math.max(rect.left, 0),
      right : Math.min(rect.right, window.innerWidth),
      top   : Math.max(rect.top, 0),
      bottom: Math.min(rect.bottom, window.innerHeight),
    } : {
      left  : 0,
      right : window.innerWidth,
      top   : 0,
      bottom: window.innerHeight,
    }

    const push = (position, low, high) => position < low + EDGE ? -SPEED * Math.min(1, ( low + EDGE - position ) / EDGE) : position > high - EDGE ? SPEED * Math.min(1, ( position - ( high - EDGE ) ) / EDGE) : 0

    const dx = push(drag.x, bounds.left, bounds.right)
    const dy = push(drag.y, bounds.top, bounds.bottom)

    if (dx || dy) {
      scrolls ? root.scrollBy(dx, dy) : window.scrollBy(dx, dy)
      pick()
    }

    drag.frame = requestAnimationFrame(tick)
  }

  const onMove = e => {

    if (!drag) {

      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < THRESHOLD) {
        return
      }

      start()
    }

    drag.x = e.clientX
    drag.y = e.clientY
    drag.ghost.style.left = `${ e.clientX }px`
    drag.ghost.style.top = `${ e.clientY }px`

    pick()
  }

  const stop = () => {

    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', onKey, true)

    if (drag) {
      cancelAnimationFrame(drag.frame)
      drag.ghost.remove()
      drag.targets.forEach(gap => gap.el.classList.remove('ft-gap-active'))
      tree.gaps.forEach(gap => gap.el.classList.remove('ft-gap-off'))
      root.classList.remove('ft-dragging')
      root.querySelector('.ft-drag-source')?.classList.remove('ft-drag-source')
    }

    const was = drag

    press = null
    drag = null

    return was
  }

  const onUp = () => {

    const was = stop()

    if (!was) {
      return
    }

    // the click that follows a drag shouldn't select anything
    tree.ignoreClick()

    if (was.active) {
      try {
        tree.move(was.node.id, was.active.at)
      }
      catch (err) {
        console.error(err)
      }
    }
  }

  const cancel = () => {
    if (stop()) {
      tree.ignoreClick()
    }
  }

  const onKey = e => {
    if (e.key === 'Escape' && drag) {
      e.preventDefault()
      e.stopPropagation()
      cancel()
    }
  }

  root.addEventListener('pointerdown', onDown)

  return () => {
    stop()
    root.removeEventListener('pointerdown', onDown)
  }
}
