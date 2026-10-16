import './style.css'
import { mountEditor } from './editor/shell'
import { loadEditorFonts, useArimoMetrics } from './io/fonts'
import { STYLE_PRESETS } from './model/defaults'
import { createAutosave, loadDraft } from './store/autosave'
import { idbStorage } from './store/idb'
import { createStore } from './store/store'

// Boot: load the autosaved draft (if any) behind the start dialog, then show the dialog so the
// user picks Resume, a new style, or a file (app-flow "Start dialog").
async function boot() {
  // Wait for the bundled fonts before the first render, so the sheet on screen and every export
  // measure text (line wraps, underlines) the same way. Local files, so this is quick; if they
  // fail or take over 1.5 s the tool opens anyway and measures with its built-in estimate.
  const loaded = await Promise.race([
    loadEditorFonts().then(() => true, () => false),
    new Promise<boolean>((r) => setTimeout(() => r(false), 1500)),
  ])
  if (loaded) useArimoMetrics() // decided once, before the first render; never switches later
  let damaged = false
  const draft = await loadDraft(idbStorage, undefined, () => (damaged = true))
  const store = createStore(draft?.mockup ?? STYLE_PRESETS.crew.make())
  const editor = mountEditor(document.querySelector<HTMLDivElement>('#app')!, store)
  editor.openMenu({ canClose: false, draft: draft ? { client: draft.mockup.header.client, savedAt: draft.savedAt } : undefined })
  if (damaged) editor.toast("Your last draft couldn't be restored, so this is a fresh mockup. Saved files are not affected.", 'error')
  const autosave = createAutosave(idbStorage, editor.setAutosaveOk)
  store.subscribe(autosave.schedule)
  // Save straight away when the tab is hidden or closed, so the last second of edits isn't lost.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void autosave.flush()
  })
}

void boot()
