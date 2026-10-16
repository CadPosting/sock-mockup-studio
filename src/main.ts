import './style.css'
import { mountEditor } from './editor/shell'
import { STYLE_PRESETS } from './model/defaults'
import { createAutosave, loadDraft } from './store/autosave'
import { idbStorage } from './store/idb'
import { createStore } from './store/store'

// Until the start dialog (task 14): resume the autosaved draft if there is one, else a blank crew.
async function boot() {
  const draft = await loadDraft(idbStorage)
  const store = createStore(draft?.mockup ?? STYLE_PRESETS.crew.make())
  const editor = mountEditor(document.querySelector<HTMLDivElement>('#app')!, store)
  const autosave = createAutosave(idbStorage, editor.setAutosaveOk)
  store.subscribe(autosave.schedule)
  // Save straight away when the tab is hidden or closed, so the last second of edits isn't lost.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void autosave.flush()
  })
}

void boot()
