// Dev page: lay the rendered template over one of Peter's reference PNGs to check the tracing
// lines up (engineering-plan task 3). The PNG is picked from disk and never leaves the browser,
// so client mockups don't need to be copied into the repo.
import '../style.css'
import { STYLE_PRESETS, type StylePresetId } from '../model/defaults'
import type { Mockup } from '../model/types'
import { render, SHEET } from '../render/sheet'

const app = document.querySelector<HTMLDivElement>('#app')!

const bar = document.createElement('div')
bar.style.cssText = 'display:flex;gap:16px;align-items:center;padding:12px;flex-wrap:wrap'

const presetSelect = document.createElement('select')
for (const [id, p] of Object.entries(STYLE_PRESETS)) presetSelect.add(new Option(p.name, id))

const file = document.createElement('input')
file.type = 'file'
file.accept = 'image/png,image/jpeg'

const opacity = document.createElement('input')
opacity.type = 'range'
opacity.min = '0'
opacity.max = '1'
opacity.step = '0.05'
opacity.value = '0.5'

const label = (text: string, control: HTMLElement) => {
  const l = document.createElement('label')
  l.append(text + ' ', control)
  return l
}
bar.append(label('Style', presetSelect), label('Reference PNG', file), label('Template opacity', opacity))

const stage = document.createElement('div')
stage.style.cssText = `position:relative;width:${SHEET.width}px;height:${SHEET.height}px;margin:0 12px;background:#fff`
const ref = document.createElement('img')
ref.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
ref.alt = ''
const layer = document.createElement('div')
layer.style.cssText = 'position:absolute;inset:0'
stage.append(ref, layer)
app.append(bar, stage)

// Colour the zones so the tracing stands out against Peter's mostly white socks.
function tinted(m: Mockup): Mockup {
  Object.assign(m.zones, {
    cuff: { hex: '#e0432b' },
    toe: { hex: '#e0432b' },
    heel: { hex: '#f2b03d' },
    leg: { hex: '#479ff8' },
    sole: { hex: '#479ff8' },
  })
  return m
}

function draw() {
  const m = tinted(STYLE_PRESETS[presetSelect.value as StylePresetId].make())
  layer.replaceChildren(render(m))
  layer.style.opacity = opacity.value
}

let objectUrl: string | undefined
file.addEventListener('change', () => {
  const f = file.files?.[0]
  if (!f) return
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = URL.createObjectURL(f)
  ref.src = objectUrl
})
presetSelect.addEventListener('change', draw)
opacity.addEventListener('input', () => (layer.style.opacity = opacity.value))
draw()
