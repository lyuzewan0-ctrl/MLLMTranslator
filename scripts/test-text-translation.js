// Run after npm run build: node --test scripts/test-text-translation.js
const assert = require("node:assert/strict")
const { test } = require("node:test")
const { translateText } = require("../dist/main/api")
const source = { id: "auto", name: "自动识别", english: "Auto" }
const target = { id: "zh", name: "简体中文", english: "Simplified Chinese" }

test("text translation uses both protocols without images and preserves the exact edited source", async (t) => {
  const text = 'Corrected OCR: x = 1\n  "quoted"  中文 😀'
  const sessions = new Set()
  t.mock.method(globalThis, "fetch", async (endpoint, init) => {
    const body = JSON.parse(init.body)
    const blocks = body.messages[0].content
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].type, "text")
    assert.ok(blocks[0].text.includes(JSON.stringify(text)))
    assert.ok(blocks[0].text.includes("Simplified Chinese"))
    const headers = new Headers(init.headers)
    assert.ok(headers.get("x-opencode-session"))
    sessions.add(headers.get("x-opencode-session"))
    const response = JSON.stringify({ detected_language: "English", recognized: "unwanted model rewrite", translated: "修正后的译文" })
    return endpoint.endsWith("/messages")
      ? Response.json({ content: [{ type: "text", text: response }] })
      : Response.json({ choices: [{ message: { content: response } }] })
  })
  for (const model of ["kimi-k2.7-code", "minimax-m3"]) {
    const result = await translateText(text, source, target, { apiKey: "test", model })
    assert.equal(result.recognized, text)
    assert.equal(result.translated, "修正后的译文")
  }
  assert.equal(sessions.size, 2)
})

test("malformed or empty text translations are retryable errors", async (t) => {
  for (const response of ["not JSON", '{"translated":""}', '{"translated":"   "}']) {
    const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: { content: response } }] }))
    await assert.rejects(translateText("source", source, target, { apiKey: "test", model: "kimi-k2.7-code" }), /未返回有效译文/)
    mock.mock.restore()
  }
})

test("text requests honor cancellation", async (t) => {
  t.mock.method(globalThis, "fetch", (_endpoint, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
  }))
  const controller = new AbortController()
  const request = translateText("source", source, target, { apiKey: "test", model: "minimax-m3", signal: controller.signal })
  controller.abort()
  await assert.rejects(request, /已取消/)
})
