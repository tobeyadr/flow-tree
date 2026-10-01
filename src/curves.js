/**
 * Smooth connectors. The straight ones are CSS lines, but a curve from a node to columns of different widths has to be
 * measured, so this draws them as one SVG layer over the flow, and the CSS hides the straight ones.
 *
 * A fork goes from the bottom of a branching node to the top of each branch's label. A merge goes from the bottom of
 * each branch that doesn't end, to where the flow carries on below, which is the same for an OR group of triggers.
 * Everything between those, the lines inside a branch, stays CSS.
 */
import { svg } from './dom.js'

/**
 * An S-curve that leaves and arrives going straight down
 */
const curve = (x1, y1, x2, y2) => {
  const middle = ( y1 + y2 ) / 2
  return `M${ x1 } ${ y1 }C${ x1 } ${ middle } ${ x2 } ${ middle } ${ x2 } ${ y2 }`
}

/**
 * @param flow HTMLElement the .ft-flow element, which has been added to the page
 */
export const drawCurves = flow => {

  flow.querySelector(':scope > .ft-curves')?.remove()

  const origin = flow.getBoundingClientRect()

  // relative to the flow, so it lines up wherever the page is scrolled
  const box = el => {
    const r = el.getBoundingClientRect()
    return {
      x     : r.left - origin.left + r.width / 2,
      top   : r.top - origin.top,
      bottom: r.bottom - origin.top,
    }
  }

  const ends = []

  flow.querySelectorAll('.ft-split').forEach(split => {

    const card = split.parentElement.querySelector(':scope > .ft-node')

    if (!card) {
      return
    }

    const from = box(card)
    const to = box(split)

    split.querySelectorAll(':scope > .ft-col').forEach(col => {

      const label = col.querySelector(':scope > .ft-col-head > .ft-label')
      const foot = col.querySelector(':scope > .ft-col-foot')

      if (label) {
        const head = box(label)
        ends.push(curve(from.x, from.bottom, head.x, head.top))
      }

      if (foot && !col.classList.contains('ft-ended')) {
        const end = box(foot)
        ends.push(curve(end.x, end.bottom, to.x, to.bottom))
      }
    })
  })

  // triggers in an OR group join where the flow carries on
  flow.querySelectorAll('.ft-tcols.ft-several').forEach(group => {

    const to = box(group)

    group.querySelectorAll(':scope > .ft-tcol:not(.ft-ended) > .ft-col-foot').forEach(foot => {
      const end = box(foot)
      ends.push(curve(end.x, end.bottom, to.x, to.bottom))
    })
  })

  flow.prepend(svg('svg', {
    class        : 'ft-curves',
    'aria-hidden': 'true',
  }, ends.map(d => svg('path', {
    class: 'ft-curve',
    d,
  }))))
}
