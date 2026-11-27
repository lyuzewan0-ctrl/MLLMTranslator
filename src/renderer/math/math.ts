export {}

const bridge = window.bridge

const loading = document.getElementById("loading") as HTMLDivElement
const content = document.getElementById("content") as HTMLDivElement
const codeEl = document.getElementById("code") as HTMLPreElement
const errorEl = document.getElementById("error") as HTMLDivElement
const closeBtn = document.getElementById("close") as HTMLButtonElement
const copyBtn = document.getElementById("copyBtn") as HTMLButtonElement
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement
const tabs = document.querySelectorAll<HTMLButtonElement>(".tab")

let currentFormat: "md" | "tex" = "md"
let mathData: { markdown: string; latex: string } = { markdown: "", latex: "" }

function currentText(): string {
  return currentFormat === "md" ? mathData.markdown : mathData.latex
}

function render() {
  codeEl.textContent = currentText() || ""
  copyBtn.disabled = saveBtn.disabled = !currentText()
}

function setFormat(fmt: "md" | "tex") {
  currentFormat = fmt
  tabs.forEach((t) => {
    t.setAttribute("aria-pressed", String(t.dataset.format === fmt))
  })
  render()
}

bridge.math.onResult((r) => {
  if (r.loading) {
    loading.hidden = false
    content.hidden = true
    return
  }
  loading.hidden = true
  content.hidden = false
  if (r.error) {
    errorEl.hidden = false
    errorEl.textContent = r.error
    mathData = { markdown: "", latex: "" }
    render()
    return
  }
  errorEl.hidden = true
  mathData = { markdown: r.markdown || "", latex: r.latex || "" }
  const preferred: "md" | "tex" = r.defaultFormat === "tex" ? "tex" : "md"
  setFormat(preferred)
})

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const fmt = (tab.dataset.format as "md" | "tex") ?? "md"
    setFormat(fmt)
    try {
      bridge.math.setFormat(fmt)
    } catch {
      /* persist is best-effort */
    }
  })
})

closeBtn.addEventListener("click", () => bridge.math.close())

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") bridge.math.close()
})

copyBtn.addEventListener("click", () => {
  const text = codeEl.textContent
  if (text) bridge.math.copy(text)
  copyBtn.textContent = "已复制"
  setTimeout(() => (copyBtn.textContent = "复制"), 900)
})

saveBtn.addEventListener("click", async () => {
  const text = currentText()
  if (!text) return
  try {
    if (!await bridge.math.save(text, currentFormat)) return
    saveBtn.textContent = "已保存"
    setTimeout(() => (saveBtn.textContent = "保存"), 900)
  } catch (e: unknown) {
    errorEl.hidden = false
    errorEl.textContent = e instanceof Error ? e.message : String(e)
  }
})
