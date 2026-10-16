import { describe, expect, it } from 'vitest'
import { sanitizeSvg } from '../../src/io/upload'

const parse = (s: string) => new DOMParser().parseFromString(s, 'image/svg+xml')

describe('SVG logo cleaning (uploads and opened files)', () => {
  const evil = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="80" onload="alert(1)">
    <script>alert(2)</script>
    <style>@import url(https://evil.example/x.css); .a{fill:url(https://evil.example/p.svg#g)} .b{fill:url(#ok)}</style>
    <foreignObject width="10" height="10"><iframe xmlns="http://www.w3.org/1999/xhtml" src="javascript:alert(3)"></iframe></foreignObject>
    <a href="javascript:alert(4)"><rect class="a" width="10" height="10" onclick="alert(5)"/></a>
    <image href="https://evil.example/track.png" width="5" height="5"/>
    <image xlink:href="data:image/png;base64,iVBORw0KGgo=" width="5" height="5"/>
    <use href="#keep"/><set attributeName="href" to="javascript:alert(6)"/>
    <rect id="keep" class="b" fill="#862633" width="200" height="80"/>
  </svg>`

  it('removes everything that can run code, load outside files or taint the export canvas', () => {
    const out = sanitizeSvg(evil)!
    const doc = parse(out)
    expect(doc.querySelectorAll('script, foreignObject, iframe, object, embed, set, animate')).toHaveLength(0)
    expect(out).not.toMatch(/\bon[a-z]+=/i)
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('evil.example')
    expect(out).not.toContain('@import')
  })

  it('keeps the artwork: shapes, fills, internal references and embedded images', () => {
    const doc = parse(sanitizeSvg(evil)!)
    expect(doc.querySelector('#keep')!.getAttribute('fill')).toBe('#862633')
    expect(doc.querySelector('use')!.getAttribute('href')).toBe('#keep')
    expect(doc.querySelectorAll('image')).toHaveLength(1) // the data: one stays, the tracker goes
    expect(doc.querySelector('style')!.textContent).toContain('url(#ok)')
    expect(doc.documentElement.getAttribute('width')).toBe('200')
  })

  it('returns null for text that is not an SVG document', () => {
    expect(sanitizeSvg('<html><body>hi</body></html>')).toBeNull()
    expect(sanitizeSvg('not xml at all <')).toBeNull()
  })
})

describe('bypasses found by the Codex review (task 20)', () => {
  const clean = (s: string) => sanitizeSvg(s)!
  const NS = 'xmlns="http://www.w3.org/2000/svg"'

  it('namespace tricks: prefixed script/set/style and a re-prefixed XLink href', () => {
    const out = clean(`<svg ${NS} xmlns:s="http://www.w3.org/2000/svg" xmlns:q="http://www.w3.org/1999/xlink">
      <s:script>alert(1)</s:script><s:set attributeName="href" to="javascript:alert(2)"/>
      <s:style>@import url(https://example.invalid/a.css);</s:style>
      <a q:href="javascript:alert(3)"><rect width="5" height="5"/></a></svg>`)
    expect(out).not.toMatch(/script|<[a-z]*:?set\b|javascript:|example\.invalid|@import/i)
  })

  it('uppercase or unknown elements are dropped (only known SVG drawing elements survive)', () => {
    const out = clean(`<svg ${NS}><SCRIPT>alert(1)</SCRIPT><blink>x</blink><rect width="5" height="5"/></svg>`)
    expect(out).not.toMatch(/SCRIPT|blink/)
    expect(out).toContain('<rect')
  })

  it('CSS escapes, comments and CDATA cannot smuggle @import or an outside url()', () => {
    const out = clean(`<svg ${NS}><style><![CDATA[@im\\70ort "https://example.invalid/a.css"; .a{fill:u\\72l(https://example.invalid/x)} .b{fill:url/**/(https://example.invalid/y)} .c{fill:url(#ok)}]]></style>
      <rect style="fill:u\\72l(https://example.invalid/z)" width="5" height="5"/></svg>`)
    expect(out).not.toMatch(/example\.invalid|@import|\\\\/i)
    expect(out).toContain('url(#ok)')
  })

  it('a root that is not an SVG-namespace <svg> is refused', () => {
    expect(sanitizeSvg('<svg xmlns="http://example.invalid/not-svg"><rect/></svg>')).toBeNull()
  })

  it('Illustrator-style class colours still work after cleaning', () => {
    const out = clean(`<svg ${NS} viewBox="0 0 10 10"><defs><style>.cls-1{fill:#862633;}.cls-2{fill:#ffb81c}</style></defs><rect class="cls-1" width="10" height="5"/><circle class="cls-2" cx="5" cy="7" r="2"/></svg>`)
    expect(out).toContain('.cls-1{fill:#862633;}')
    expect(out).toContain('class="cls-2"')
  })
})
