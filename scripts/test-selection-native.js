// Launched by test-selection-native.ps1, which preserves the user's clipboard.
const { app, BrowserWindow, clipboard } = require("electron")
const { captureSelectedText } = require("../dist/main/selection")
const assert = require("node:assert/strict")
const path = require("node:path")
const { execFile } = require("node:child_process")
const token = process.argv[2]
if (!token?.startsWith("MMTranslator-native-test-")) throw new Error("Use the PowerShell test wrapper to preserve the clipboard")
app.setPath("userData", path.join(__dirname, "../dist/test-selection-profile"))
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let win
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 440, height: 220, show: false, title: "MMTranslator selection test", webPreferences: { contextIsolation: true, nodeIntegration: false } })
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent('<title>MMTranslator selection test</title><p>Temporary selection integration test</p><textarea id="source" style="width:95%;height:100px"></textarea>'))
  const text = `${token} Selected text\n中文 & emoji 😀`
  const original = `${token} original clipboard`
  const originalHtml = `<b>${original}</b>`
  clipboard.write({ text: original, html: originalHtml })
  const savedHtml = clipboard.readHTML()
  win.show()
  win.focus()
  win.webContents.focus()
  await win.webContents.executeJavaScript(`const input = document.getElementById('source'); input.value = ${JSON.stringify(text)}; input.focus(); input.select()`)
  await pause(150)
  const selected = await captureSelectedText()
  assert.equal(selected.replace(/\r\n/g, "\n"), text)
  assert.equal(clipboard.readText(), original, "restore the previous plain text")
  assert.equal(clipboard.readHTML(), savedHtml, "restore the previous HTML format")
  console.log("PASS: real Windows copy captures Unicode/newlines and restores text + HTML clipboard")

  // An unchanged clipboard must never be treated as a successful new selection.
  await win.webContents.executeJavaScript("document.getElementById('source').setSelectionRange(0, 0)")
  await assert.rejects(captureSelectedText(), /未获取到选中文字/)
  assert.equal(clipboard.readText(), original)
  assert.equal(clipboard.readHTML(), savedHtml)
  console.log("PASS: no selection rejects stale clipboard text without changing the clipboard")

  // Copying the same text again still counts, because detection uses the sequence number.
  await win.webContents.executeJavaScript(`document.getElementById('source').value = ${JSON.stringify(original)}; document.getElementById('source').select()`)
  assert.equal(await captureSelectedText(), original)
  console.log("PASS: selecting text identical to the clipboard is detected correctly")

  // A different process copying during capture must not be translated or overwritten.
  const unrelated = `${token} later clipboard write`
  let writerDone
  win.webContents.once("page-title-updated", () => {
    writerDone = new Promise((resolve, reject) => {
      const powershell = path.join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe")
      const command = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText('${unrelated.replace(/'/g, "''")}'); Start-Sleep -Milliseconds 300`
      execFile(powershell, ["-NoProfile", "-NonInteractive", "-STA", "-Command", command], { windowsHide: true }, (error) => error ? reject(error) : resolve())
    })
  })
  await win.webContents.executeJavaScript("document.addEventListener('copy', event => { event.preventDefault(); document.title = 'Clipboard race test' }, { once: true })")
  await assert.rejects(captureSelectedText(), /未获取到选中文字/)
  assert.ok(writerDone, "the copy shortcut reached the test app")
  await writerDone
  assert.equal(clipboard.readText(), unrelated, "leave the newer clipboard write intact")
  console.log("PASS: an unrelated clipboard write is neither translated nor overwritten")
  app.exit(0)
}).catch((error) => { console.error(error); app.exit(1) })
