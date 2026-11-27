// Run after npm run build: node --test scripts/test-translation-ipc.js
const assert = require("node:assert/strict")
const { test } = require("node:test")
const { EventEmitter } = require("node:events")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

function setup() {
  const handlers = new Map()
  const events = new Map()
  const shortcuts = new Map()
  const windows = []
  const requests = []
  const captures = []
  const languages = [{ id: "en", name: "English", english: "English" }, { id: "zh", name: "中文", english: "Chinese" }]
  const settings = { goApiKey: "test", model: "minimax-m3", sourceLanguages: languages, targetLanguages: languages, currentSourceId: "en", currentTargetId: "zh", shortcuts: { screenshot: "Alt+S", selection: "Alt+D", cycleModel: "Alt+K" } }
  class Window extends EventEmitter {
    constructor() {
      super(); this.visible = false; this.messages = []
      this.webContents = new EventEmitter()
      this.webContents.isLoading = () => false
      this.webContents.send = (channel, data) => this.messages.push({ channel, data })
      windows.push(this)
    }
    loadFile() { return Promise.resolve() }
    show() { this.visible = true }
    hide() { this.visible = false }
    isVisible() { return this.visible }
    isDestroyed() { return false }
    getSize() { return [480, 480] }
    getMinimumSize() { return [360, 360] }
    getBounds() { return {} }
    setBounds() {}
    focus() {}
    moveTop() {}
  }
  const app = new EventEmitter()
  Object.assign(app, { setName() {}, setAppUserModelId() {}, setLoginItemSettings() {}, requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), commandLine: { appendSwitch() {} } })
  const electron = {
    app, BrowserWindow: Window,
    nativeTheme: { shouldUseDarkColors: false },
    Tray: class { setImage() {} setContextMenu() {} setToolTip() {} },
    Menu: { buildFromTemplate: (x) => x },
    nativeImage: { createFromDataURL: () => ({ addRepresentation() {}, isEmpty: () => false }) },
    globalShortcut: { unregisterAll() {}, register: (key, fn) => { shortcuts.set(key, fn); return true } },
    ipcMain: { on: (key, fn) => events.set(key, fn), handle: (key, fn) => handlers.set(key, fn) },
    screen: { getCursorScreenPoint: () => ({ x: 10, y: 10 }), getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    Notification: { isSupported: () => false },
  }
  const modules = {
    electron,
    "./autostart": { syncLinuxAutoStart: async () => {} },
    "./store": { getSettings: () => structuredClone(settings), setSettings: (patch) => Object.assign(settings, patch) },
    "./models": require("../dist/main/models"),
    "./languages": { findLanguage: (list, id) => list.find((l) => l.id === id) },
    "./selection": { captureSelectedText: () => new Promise((resolve, reject) => captures.push({ resolve, reject })) },
    "./api": { translateText: (text, source, target, opts) => new Promise((resolve, reject) => requests.push({ text, source, target, opts, resolve, reject })) },
    "./screenshot": { initScreenshotModule() {}, closeSelection() {}, startSelection: () => Promise.resolve() },
  }
  const context = vm.createContext({
    require: (name) => modules[name] || require(name), exports: {}, __dirname: path.join(__dirname, "../dist/main"),
    process: { platform: "win32", execPath: "test.exe" }, console: { log() {}, error() {} }, AbortController,
  })
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../dist/main/index.js"), "utf8"), context)
  return { handlers, events, shortcuts, windows, requests, captures, settings }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))

test("model shortcut cycles through every built-in option and wraps", async () => {
  const { MODELS } = require("../dist/main/models")
  const h = setup()
  await tick()
  const initial = h.settings.model
  const seen = new Set()
  for (const _ of MODELS) {
    h.shortcuts.get("Alt+K")()
    seen.add(h.settings.model)
  }
  assert.deepEqual(seen, new Set(MODELS.map(model => model.id)))
  assert.equal(h.settings.model, initial)
})

async function open(h) {
  await tick()
  h.shortcuts.get("Alt+D")()
  assert.equal(h.windows.length, 0, "must not steal foreground focus before copy finishes")
  h.captures[0].resolve("Selected text")
  await tick()
  const win = h.windows[0]
  const data = win.messages.at(-1).data
  return { win, event: { sender: win.webContents }, input: { sessionId: data.sessionId, text: data.recognized, sourceId: "en", targetId: "zh" } }
}

test("translation IPC validates sender and draft, supersedes requests, and cancels on close", async () => {
  const h = setup()
  const { win, event, input } = await open(h)
  const translate = h.handlers.get("overlay:translate")
  await assert.rejects(translate({ sender: {} }, input), /Unauthorized/)
  for (const bad of [{ text: " " }, { text: "x".repeat(50001) }, { sourceId: "invalid" }]) {
    await assert.rejects(translate(event, { ...input, ...bad }))
  }
  assert.equal(h.requests.length, 0)
  const first = translate(event, input)
  const second = translate(event, { ...input, text: "Edited source" })
  assert.equal(h.requests[0].opts.signal.aborted, true)
  h.requests[1].resolve({ translated: "最新译文" })
  assert.equal((await second).translated, "最新译文")
  h.requests[0].resolve({ translated: "过期译文" })
  assert.equal(await first, null)
  const third = translate(event, input)
  h.events.get("overlay:close")(event)
  assert.equal(h.requests[2].opts.signal.aborted, true)
  assert.equal(win.visible, false)
  h.requests[2].resolve({ translated: "关闭后的结果" })
  assert.equal(await third, null)
  assert.equal(await translate(event, input), null)
})

test("failed selection opens an empty editor and repeated shortcuts do not overlap copies", async () => {
  const h = setup()
  await tick()
  h.shortcuts.get("Alt+D")()
  h.shortcuts.get("Alt+D")()
  assert.equal(h.captures.length, 1)
  h.captures[0].reject(new Error("未获取到选中文字"))
  await tick()
  const data = h.windows[0].messages.at(-1).data
  assert.equal(data.recognized, "")
  assert.equal(data.autoTranslate, false)
  assert.match(data.error, /未获取到/)
})

test("a new selection invalidates the previous window session", async () => {
  const h = setup()
  const { event, input } = await open(h)
  h.shortcuts.get("Alt+D")()
  h.captures[1].resolve("Another selection")
  await tick()
  assert.equal(await h.handlers.get("overlay:translate")(event, input), null)
  assert.equal(h.requests.length, 0)
})
