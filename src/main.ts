import './style.css'
import { STYLE_PRESETS } from './model/defaults'
import { render } from './render/sheet'

// Temporary until the editor shell (task 9): show a blank crew sheet.
const app = document.querySelector<HTMLDivElement>('#app')!
app.replaceChildren(render(STYLE_PRESETS.crew.make()))
