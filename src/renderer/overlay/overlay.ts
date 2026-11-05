export {}

const loading = document.getElementById("loading") as HTMLDivElement
const content = document.getElementById("content") as HTMLDivElement
const srcEl = document.getElementById("src") as HTMLTextAreaElement
const tgtEl = document.getElementById("tgt") as HTMLDivElement
const srcLabel = document.getElementById("srcLabel") as HTMLSpanElement
const tgtLabel = document.getElementById("tgtLabel") as HTMLSpanElement
const errorEl = document.getElementById("error") as HTMLDivElement
const sourceLanguage = document.getElementById("sourceLanguage") as HTMLSelectElement
const targetLanguage = document.getElementById("targetLanguage") as HTMLSelectElement
const statusEl = document.getElementById("translationStatus") as HTMLSpanElement
const translateBtn = document.getElementById("translate") as HTMLButtonElement
const bridge = window.bridge

let sessionId = 0
let requestSerial = 0
let translatedKey = ""
let pendingKey: string | null = null

function draftKey(): string {
  return JSON.stringify([srcEl.value, sourceLanguage.value, targetLanguage.value])
}

function updateState(): void {
  const dirty = Boolean(translatedKey && translatedKey !== draftKey())
  statusEl.textContent = pendingKey !== null
    ? (pendingKey === draftKey() ? "翻译中…" : "原文或语言已修改，可重新翻译")
    : dirty ? "原文或语言已修改，待重新翻译" : ""
  translateBtn.disabled = !srcEl.value.trim() || pendingKey === draftKey()
  translateBtn.innerHTML = `${tgtEl.textContent ? "重新翻译" : "翻译"} <kbd>Ctrl+Enter</kbd>`
  tgtEl.classList.toggle("stale", dirty)
}

function fillLanguages(select: HTMLSelectElement, languages: LanguageDef[], current: string): void {
  select.replaceChildren(...languages.map((language) => {
    const option = document.createElement("option")
    option.value = language.id
    option.textContent = language.name
    return option
  }))
  select.value = current
}

bridge.onOverlayResult((result) => {
  requestSerial++
  sessionId = result.sessionId
  pendingKey = null
  translatedKey = ""
  loading.hidden = !result.loading
  content.hidden = Boolean(result.loading)
  srcEl.value = result.recognized || ""
  tgtEl.textContent = result.translated || ""
  srcLabel.textContent = result.detected ? `原文 · ${result.detected}` : "原文"
  tgtLabel.textContent = result.targetLabel || "译文"
  fillLanguages(sourceLanguage, result.sourceLanguages, result.sourceId)
  fillLanguages(targetLanguage, result.targetLanguages, result.targetId)
  errorEl.textContent = result.error || ""
  errorEl.hidden = !result.error
  if (result.translated) translatedKey = draftKey()
  updateState()
  if (!result.loading) {
    srcEl.focus()
    srcEl.setSelectionRange(0, 0)
    if (result.autoTranslate) void translate()
  }
})

async function translate(): Promise<void> {
  if (content.hidden || translateBtn.disabled) return
  const serial = ++requestSerial
  const key = draftKey()
  const input = { sessionId, text: srcEl.value, sourceId: sourceLanguage.value, targetId: targetLanguage.value }
  const targetName = targetLanguage.selectedOptions[0]?.textContent || "译文"
  pendingKey = key
  errorEl.hidden = true
  updateState()
  try {
    const result = await bridge.overlay.translate(input)
    if (serial !== requestSerial || !result) return
    // Keep edits made during the request. Only the translation changes.
    tgtEl.textContent = result.translated
    tgtLabel.textContent = targetName
    srcLabel.textContent = input.sourceId === "auto" && draftKey() === key
      ? `原文 · ${result.detected_language}` : "原文"
    translatedKey = key
  } catch (error: unknown) {
    if (serial !== requestSerial) return
    errorEl.textContent = error instanceof Error ? error.message : String(error)
    errorEl.hidden = false
  } finally {
    if (serial === requestSerial) {
      pendingKey = null
      updateState()
    }
  }
}

function close(): void {
  requestSerial++
  pendingKey = null
  bridge.overlay.close()
}

document.getElementById("close")!.addEventListener("click", close)
translateBtn.addEventListener("click", () => void translate())
srcEl.addEventListener("input", () => {
  srcLabel.textContent = "原文"
  updateState()
})
sourceLanguage.addEventListener("change", () => {
  srcLabel.textContent = "原文"
  updateState()
})
targetLanguage.addEventListener("change", updateState)
document.addEventListener("keydown", (event) => {
  if (event.isComposing) return
  if (event.key === "Escape") close()
  if (event.ctrlKey && event.key === "Enter") {
    event.preventDefault()
    void translate()
  }
})

document.querySelectorAll<HTMLButtonElement>(".copy").forEach((button) => {
  button.addEventListener("click", () => {
    const text = button.dataset.target === "src" ? srcEl.value : tgtEl.textContent
    if (!text) return
    bridge.overlay.copy(text)
    button.textContent = "已复制"
    setTimeout(() => (button.textContent = "复制"), 900)
  })
})
