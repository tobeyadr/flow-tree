/**
 * The popover for choosing what to add. Hosts with their own picker pass `pickType` instead.
 */
import { h } from './dom.js'

const MARGIN = 8

/**
 * @param root HTMLElement the popover goes inside, so it takes the editor's theme
 * @param anchor HTMLElement the button it opens from
 * @param types Object the type registry
 * @param signal AbortSignal aborting closes it
 * @return Promise<string|null> the chosen type, or null if it was closed
 */
export const pickType = ({
  root,
  anchor,
  types,
  signal,
}) => new Promise(resolve => {

  const entries = Object.entries(types).filter(([, def]) => def.addable !== false)

  if (!entries.length) {
    resolve(null)
    return
  }

  const groups = new Map()

  entries.forEach(([key, def]) => {
    const group = def.group ?? ''
    groups.set(group, [...groups.get(group) ?? [], [key, def]])
  })

  let search = null
  const list = h('div', { class: 'ft-pop-list' })

  const finish = value => {
    document.removeEventListener('pointerdown', onOutside, true)
    document.removeEventListener('keydown', onKey, true)
    signal?.removeEventListener('abort', onAbort)
    pop.remove()
    anchor.focus?.({ preventScroll: true })
    resolve(value)
  }

  const onAbort = () => finish(null)

  const onOutside = e => {
    if (!pop.contains(e.target)) {
      finish(null)
    }
  }

  const items = () => [...list.querySelectorAll('.ft-pop-item')]

  const onKey = e => {

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      finish(null)
      return
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const all = items()
      const at = all.indexOf(document.activeElement)
      all[( at + ( e.key === 'ArrowDown' ? 1 : -1 ) + all.length ) % all.length]?.focus()
    }
  }

  const fill = () => {

    const query = search?.value.trim().toLowerCase() ?? ''
    const children = []

    groups.forEach((group, name) => {

      const matches = group.filter(([key, def]) => !query || `${ def.name ?? key } ${ def.description ?? '' }`.toLowerCase().includes(query))

      if (!matches.length) {
        return
      }

      children.push(name ? h('div', { class: 'ft-pop-group' }, name) : null)

      matches.forEach(([key, def]) => children.push(h('button', {
        type   : 'button',
        class  : 'ft-pop-item',
        onClick: () => finish(key),
      }, [
        h('span', {
          class: 'ft-icon',
          style: def.color ? { '--ft-node-color': def.color } : null,
        }, def.icon && !/[/.]/.test(def.icon) ? def.icon : ( def.name ?? key ).slice(0, 1).toUpperCase()),
        h('span', { class: 'ft-text' }, [
          h('span', { class: 'ft-title' }, def.name ?? key),
          def.description ? h('span', { class: 'ft-sub' }, def.description) : null,
        ]),
      ])))
    })

    list.replaceChildren(...children.filter(Boolean))

    if (!list.children.length) {
      list.appendChild(h('div', { class: 'ft-pop-none' }, 'Nothing matches'))
    }
  }

  if (entries.length > 7) {
    search = h('input', {
      type       : 'search',
      class      : 'ft-pop-search',
      placeholder: 'Search',
      'aria-label': 'Search',
      onInput    : fill,
      onKeydown  : e => {
        if (e.key === 'Enter') {
          items()[0]?.click()
        }
      },
    })
  }

  const pop = h('div', {
    class: 'ft-popover',
    role : 'dialog',
  }, [search, list])

  fill()
  root.appendChild(pop)

  // under the button, or above it if there isn't room
  const rect = anchor.getBoundingClientRect()
  const { width, height } = pop.getBoundingClientRect()
  const below = rect.bottom + MARGIN + height <= window.innerHeight || rect.top - MARGIN - height < 0

  pop.style.left = `${ Math.max(MARGIN, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - MARGIN)) }px`
  pop.style.top = `${ below ? rect.bottom + MARGIN : rect.top - MARGIN - height }px`

  document.addEventListener('pointerdown', onOutside, true)
  document.addEventListener('keydown', onKey, true)
  signal?.addEventListener('abort', onAbort)

  ;( search ?? items()[0] )?.focus()
})
