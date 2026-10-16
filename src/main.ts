import './style.css'
import { mountEditor } from './editor/shell'
import { STYLE_PRESETS } from './model/defaults'
import { createAutosave, loadDraft } from './store/autosave'
import { idbStorage } from './store/idb'
import { createStore } from './store/store'

// Boot: load the autosaved draft (if any) behind the start dialog, then show the dialog so the
// user picks Resume, a new style, or a file (app-flow "Start dialog").
async function boot() {
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
