// After npm run build, run with [rounds] [model IDs...] using the project Go key.
const fs = require("node:fs")
const path = require("node:path")
const { translateScreenshot } = require("../dist/main/api")
const { MODELS } = require("../dist/main/models")
const { BUILTIN_SOURCE_LANGUAGES, BUILTIN_TARGET_LANGUAGES } = require("../dist/main/languages")
const { KEY } = require("./load-key")

const fixtures = [
  {
    file: "test-text.png",
    source: "Hello World This is a test image",
    translated: [/世界/, /测试/, /图|像|片/],
  },
  {
    file: "maintenance.png",
    source: "Maintenance starts at 09:30 on Friday. Save your work before the update begins. The service will be unavailable for 15 minutes.",
    translated: [/(星期|周|礼拜)五/, /0?9[:：]30|九点半/, /维护|维护保养|检修/, /保存/, /15|十五/, /分钟/],
  },
].map(fixture => ({ ...fixture, image: fs.readFileSync(path.join(__dirname, "../test", fixture.file), "base64") }))
const normalize = text => text.toLowerCase().replace(/[^a-z0-9]/g, "")
const rounds = Number(process.argv[2] ?? 3)
const ids = process.argv.slice(3)
const models = ids.length ? ids : MODELS.map(model => model.id)
if (!Number.isSafeInteger(rounds) || rounds < 1 || models.some(id => !MODELS.some(model => model.id === id))) {
  throw new Error("Use a positive round count and IDs from the built-in model list.")
}

async function run() {
  const samples = new Map(models.map(id => [id, []]))
  for (let round = 0; round < rounds; round++) {
    const fixture = fixtures[round % fixtures.length]
    for (let offset = 0; offset < models.length; offset++) {
      const id = models[(round + offset) % models.length]
      const start = performance.now()
      try {
        const result = await translateScreenshot(fixture.image, BUILTIN_SOURCE_LANGUAGES[0], BUILTIN_TARGET_LANGUAGES[0], {
          apiKey: KEY, model: id, quickMode: true,
        })
        const seconds = (performance.now() - start) / 1000
        if (normalize(result.recognized) !== normalize(fixture.source) || !fixture.translated.every(pattern => pattern.test(result.translated))) {
          throw new Error("Unexpected OCR or translation: " + JSON.stringify([result.recognized, result.translated]))
        }
        samples.get(id).push(seconds)
        console.log(round + 1, fixture.file, id, seconds.toFixed(2), JSON.stringify(result.translated))
      } catch (error) {
        console.log(round + 1, id, "FAILED", error.message)
        process.exitCode = 1
      }
    }
  }
  for (const [id, times] of samples) {
    times.sort((a, b) => a - b)
    const middle = Math.floor(times.length / 2)
    const median = times.length % 2 ? times[middle] : (times[middle - 1] + times[middle]) / 2
    console.log(id, times.length + "/" + rounds, "median(s)", times.length ? median.toFixed(2) : "-")
  }
}

run().catch(error => { console.error(error.message); process.exitCode = 1 })
