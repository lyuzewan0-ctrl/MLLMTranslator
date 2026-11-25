export {}

const bridge = window.bridge

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T

const apiKey = $("apiKey") as HTMLInputElement
const model = $("model") as HTMLSelectElement
const endpoint = $("endpoint") as HTMLInputElement
const scScreenshot = $("scScreenshot") as HTMLInputElement
const scSelection = $("scSelection") as HTMLInputElement
const scMath = $("scMath") as HTMLInputElement
const scQuick = $("scQuick") as HTMLInputElement
const scModel = $("scModel") as HTMLInputElement
const scSource = $("scSource") as HTMLInputElement
const scTarget = $("scTarget") as HTMLInputElement
const curSource = $("curSource") as HTMLSelectElement
const curTarget = $("curTarget") as HTMLSelectElement
const mathFormat = $("mathFormat") as HTMLSelectElement
const launchAtLogin = $("launchAtLogin") as HTMLInputElement
const autoStartSection = $("autoStartSection") as HTMLElement
const autoStart = $("autoStart") as HTMLInputElement
const statusEl = $("status") as HTMLDivElement

function fillSelect(sel: HTMLSelectElement, langs: LanguageDef[], currentId: string) {
  sel.innerHTML = ""
  for (const l of langs) {
    const o = document.createElement("option")
    o.value = l.id
    o.textContent = l.name
    if (l.id === currentId) o.selected = true
    sel.appendChild(o)
  }
}

function showError(error: unknown) {
  statusEl.textContent = error instanceof Error ? error.message : String(error)
}

async function load() {
  const s = await bridge.settings.get()
  apiKey.value = s.goApiKey
  model.value = s.model
  endpoint.value = s.endpoint
  autoStartSection.hidden = !s.autoStartSupported
  autoStart.checked = s.autoStart
  scScreenshot.value = s.shortcuts.screenshot
  scSelection.value = s.shortcuts.selection
  scMath.value = s.shortcuts.math || ""
  scQuick.value = s.shortcuts.quickScreenshot || ""
  scModel.value = s.shortcuts.cycleModel || ""
  scSource.value = s.shortcuts.cycleSource
  scTarget.value = s.shortcuts.cycleTarget
  fillSelect(curSource, s.sourceLanguages, s.currentSourceId)
  fillSelect(curTarget, s.targetLanguages, s.currentTargetId)
  mathFormat.value = s.math?.outputFormat || "md"
  launchAtLogin.checked = s.launchAtLogin
  $("windowsAutoStartSection").hidden = !s.launchAtLoginSupported
}

async function save() {
  const patch: Partial<RendererSettings> = {
    goApiKey: apiKey.value.trim(),
    model: model.value || "minimax-m3",
    endpoint: endpoint.value.trim(),
    launchAtLogin: launchAtLogin.checked,
    currentSourceId: curSource.value,
    currentTargetId: curTarget.value,
    math: {
      outputFormat: (mathFormat.value as "md" | "tex") || "md",
    },
    shortcuts: {
      screenshot: scScreenshot.value.trim(),
      selection: scSelection.value.trim(),
      math: scMath.value.trim(),
      quickScreenshot: scQuick.value.trim(),
      cycleModel: scModel.value.trim(),
      cycleSource: scSource.value.trim(),
      cycleTarget: scTarget.value.trim(),
    },
  }
  if (!autoStartSection.hidden) patch.autoStart = autoStart.checked
  await bridge.settings.set(patch)
  statusEl.textContent = "已保存 ✓"
  setTimeout(() => (statusEl.textContent = ""), 1500)
}

async function reset() {
  await bridge.settings.reset()
  await load()
  statusEl.textContent = "已恢复默认"
  setTimeout(() => (statusEl.textContent = ""), 1500)
}

$("save").addEventListener("click", () => void save().catch(showError))
$("reset").addEventListener("click", () => void reset().catch(showError))
$("goLink").addEventListener("click", (e) => {
  e.preventDefault()
  bridge.openExternal()
})

void load().catch(showError)
