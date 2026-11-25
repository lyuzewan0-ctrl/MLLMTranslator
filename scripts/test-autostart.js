const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')

test('Linux autostart preserves the persistent AppImage path and removes only its own entry', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmtranslator-autostart-'))
  const directory = path.join(root, 'autostart')
  const file = path.join(directory, 'ai.opencode.screenshot-translator.desktop')
  t.after(() => {
    fs.rmSync(file, { force: true })
    fs.rmdirSync(directory)
    fs.rmdirSync(root)
  })
  const appImage = path.join(root, 'My App $100%.AppImage')
  const context = vm.createContext({
    exports: {},
    require: (name) => name === 'electron' ? { app: { isPackaged: true, getPath: () => root } } : require(name),
    process: { platform: 'linux', env: { APPIMAGE: appImage }, execPath: '/tmp/.mount/app', pid: process.pid },
  })
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/main/autostart.js'), 'utf8'), context)
  await context.exports.syncLinuxAutoStart(true)
  const entry = fs.readFileSync(file, 'utf8')
  assert.match(entry, /My App \\\$100%%\.AppImage/)
  assert.ok(!entry.includes('/tmp/.mount/app'))
  const other = path.join(directory, 'other.desktop')
  fs.writeFileSync(other, 'keep')
  await context.exports.syncLinuxAutoStart(false)
  assert.equal(fs.existsSync(file), false)
  assert.equal(fs.readFileSync(other, 'utf8'), 'keep')
  fs.unlinkSync(other)
  await context.exports.syncLinuxAutoStart(false)
})
