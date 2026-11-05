// Run after npm run build: electron scripts/test-overlay.js
// Isolated renderer test: no real settings, global shortcuts, API keys, or network calls.
const { app, BrowserWindow, ipcMain } = require("electron")
const assert = require("node:assert/strict")
const path = require("node:path")
const fs = require("node:fs")
app.setPath("userData", path.join(__dirname, "../dist/test-overlay-profile"))
let win
const requests = []
let copied = ""
let closed = 0
ipcMain.handle("overlay:translate", (_event, input) => new Promise((resolve, reject) => requests.push({ input, resolve, reject })))
ipcMain.on("overlay:copy", (_event, text) => { copied = text })
ipcMain.on("overlay:close", () => { closed++ })
const sourceLanguages = [{ id: "auto", name: "自动识别", english: "Auto" }, { id: "en", name: "英语", english: "English" }]
const targetLanguages = [{ id: "zh", name: "简体中文", english: "Simplified Chinese" }, { id: "en", name: "英语", english: "English" }]
const payload = { sessionId: 1, sourceLanguages, targetLanguages, sourceId: "auto", targetId: "zh", detected: "English", recognized: "OCR original", translated: "初始译文", sourceLabel: "English", targetLabel: "简体中文" }
const evaluate = (code) => win.webContents.executeJavaScript(code)
const pause = () => new Promise((resolve) => setTimeout(resolve, 20))
async function until(check) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await pause() }
  throw new Error("Timed out waiting for renderer")
}
async function edit(text) {
  await evaluate(`document.getElementById('src').value = ${JSON.stringify(text)}; document.getElementById('src').dispatchEvent(new Event('input'))`)
}
async function submit(count) {
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }))")
  await until(() => requests.length === count)
}
const result = (text) => ({ recognized: "must not overwrite edits", translated: text, detected_language: "English" })

app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 480, height: 480, show: false, frame: false, webPreferences: {
    preload: path.join(__dirname, "../dist/preload/preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false,
  } })
  await win.loadFile(path.join(__dirname, "../dist/renderer/overlay/index.html"))
  win.webContents.send("overlay:result", payload)
  await until(async () => await evaluate("document.getElementById('src').value") === payload.recognized)
  await edit("Corrected source\n中文 😀")
  assert.match(await evaluate("document.getElementById('translationStatus').textContent"), /待重新翻译/)
  await submit(1)
  assert.equal(requests[0].input.text, "Corrected source\n中文 😀")
  await edit("Newer draft")
  requests[0].resolve(result("第一版译文"))
  await until(async () => await evaluate("document.getElementById('tgt').textContent") === "第一版译文")
  assert.equal(await evaluate("document.getElementById('src').value"), "Newer draft")
  assert.match(await evaluate("document.getElementById('translationStatus').textContent"), /待重新翻译/)

  await submit(2)
  await edit("Newest draft")
  await submit(3)
  requests[2].resolve(result("最新译文"))
  await until(async () => await evaluate("document.getElementById('tgt').textContent") === "最新译文")
  requests[1].resolve(result("过期译文"))
  await pause()
  assert.equal(await evaluate("document.getElementById('tgt').textContent"), "最新译文")

  await evaluate("document.getElementById('targetLanguage').value = 'en'; document.getElementById('targetLanguage').dispatchEvent(new Event('change'))")
  await submit(4)
  assert.equal(requests[3].input.targetId, "en")
  requests[3].reject(new Error("test network failure"))
  await until(async () => !(await evaluate("document.getElementById('error').hidden")))
  assert.equal(await evaluate("document.getElementById('src').value"), "Newest draft")
  assert.equal(await evaluate("document.getElementById('tgt').textContent"), "最新译文")
  await submit(5)
  requests[4].resolve(result("Retry succeeded"))
  await until(async () => await evaluate("document.getElementById('tgt').textContent") === "Retry succeeded")
  assert.equal(await evaluate("document.getElementById('translationStatus').textContent"), "")
  await evaluate("document.querySelector('[data-target=src]').click()")
  await until(() => copied === "Newest draft")

  await edit("In flight before next capture")
  await submit(6)
  win.webContents.send("overlay:result", { ...payload, sessionId: 2, recognized: "New selection", translated: "", autoTranslate: true })
  await until(() => requests.length === 7)
  requests[5].resolve(result("Old session result"))
  requests[6].resolve(result("新选区译文"))
  await until(async () => await evaluate("document.getElementById('tgt').textContent") === "新选区译文")
  assert.equal(await evaluate("document.getElementById('src').value"), "New selection")

  // Capture a representative layout with a dirty draft and previous translation.
  await edit("This is editable source text.\n这里可以校对 OCR，也可以粘贴新内容。")
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
  fs.writeFileSync(path.join(__dirname, "../dist/test-overlay.png"), (await win.webContents.capturePage()).toPNG())
  await submit(8)
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))")
  await until(() => closed === 1)
  requests[7].resolve(result("Closed-window result"))
  await pause()
  assert.equal(await evaluate("document.getElementById('tgt').textContent"), "新选区译文")
  console.log("PASS: editing, language selection, retries, copy, request races, new capture, close, and layout capture")
  app.exit(0)
}).catch((error) => { console.error(error); app.exit(1) })
