/**
 * Tiny element helpers. Strings are always text, never HTML, so node titles can't inject markup.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

const append = (el, children) => children.flat(Infinity).forEach(child => {

  if (child === null || child === undefined || child === false) {
    return
  }

  el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)))
})

const setProps = (el, props) => Object.entries(props ?? {}).forEach(([name, value]) => {

  if (value === null || value === undefined || value === false) {
    return
  }

  if (name === 'class') {
    el.setAttribute('class', value)
    return
  }

  if (name === 'style' && typeof value === 'object') {
    Object.entries(value).forEach(([prop, val]) => prop.startsWith('--') ? el.style.setProperty(prop, val) : el.style[prop] = val)
    return
  }

  if (name === 'dataset') {
    Object.assign(el.dataset, value)
    return
  }

  if (name.startsWith('on') && typeof value === 'function') {
    el.addEventListener(name.slice(2).toLowerCase(), value)
    return
  }

  el.setAttribute(name, value === true ? '' : value)
})

/**
 * @param tag string
 * @param props Object|null attributes, class, style (an object), dataset, onClick, ...
 * @param children any text, elements, nested arrays, null
 * @return HTMLElement
 */
export const h = (tag, props, ...children) => {
  const el = document.createElement(tag)
  setProps(el, props)
  append(el, children)
  return el
}

/**
 * @return SVGElement
 */
export const svg = (tag, props, ...children) => {
  const el = document.createElementNS(SVG_NS, tag)
  setProps(el, props)
  append(el, children)
  return el
}

const PATHS = {
  plus     : 'M12 5v14M5 12h14',
  lock     : 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
  unlock   : 'M7 11V8a5 5 0 0 1 9.5-2M6 11h12v9H6z',
  duplicate: 'M9 9h11v11H9zM5 15V4h11',
  trash    : 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
}

/**
 * @param name string plus, lock, unlock, duplicate, or trash
 * @param size number
 */
export const icon = (name, size = 14) => svg('svg', {
  viewBox       : '0 0 24 24',
  width         : size,
  height        : size,
  fill          : 'none',
  stroke        : 'currentColor',
  'stroke-width': 2,
  'stroke-linecap' : 'round',
  'stroke-linejoin': 'round',
  'aria-hidden' : 'true',
}, svg('path', { d: PATHS[name] }))
