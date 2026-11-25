// Run after npm run build: node --test scripts/test-api-headers.js
const assert = require("node:assert/strict")
const { test } = require("node:test")
const { translateScreenshot, parseMath } = require("../dist/main/api")
const { version } = require("../package.json")

const source = { id: "en", name: "English", english: "English" }
const target = { id: "zh", name: "简体中文", english: "Simplified Chinese" }
const answer = {
  detected_language: "English",
  recognized: "Hello",
  translated: "你好",
  markdown: "$x$",
  latex: "x",
}

test("both vision protocols send OpenCode routing headers for translation and math", async (t) => {
  const sessions = new Set()
  t.mock.method(globalThis, "fetch", async (endpoint, init) => {
    const headers = new Headers(init.headers)
    const session = headers.get("x-opencode-session")
    // Model the gateway rejecting requests that caused the reported HTTP 400.
    if (!session) {
      return Response.json({ error: { message: "Missing x-opencode-session" } }, { status: 400 })
    }
    assert.match(session, /^[0-9a-f-]{36}$/)
    assert.ok(!sessions.has(session), "independent screenshots have separate conversations")
    sessions.add(session)
    assert.equal(headers.get("user-agent"), `MMTranslator/${version}`)
    const body = JSON.parse(init.body)
    assert.equal(body.reasoning_effort, body.model === "kimi-k3.1-pro" ? "low" : undefined)
    const content = JSON.stringify(answer)
    if (endpoint.endsWith("/messages")) {
      assert.deepEqual(body.thinking, { type: "disabled" })
      assert.equal(headers.get("x-api-key"), "test-key")
      assert.equal(headers.get("anthropic-version"), "2023-06-01")
      assert.equal(body.messages[0].content[1].source.data, "test-image")
      return Response.json({ content: [{ type: "text", text: content }] })
    }
    assert.equal(headers.get("authorization"), "Bearer test-key")
    assert.equal(body.temperature, undefined)
    assert.equal(body.messages[0].content[1].image_url.url, "data:image/png;base64,test-image")
    return Response.json({ choices: [{ message: { content } }] })
  })
  for (const model of ["kimi-k2.7-code", "kimi-k3.1-pro", "minimax-m3"]) {
    const opts = { apiKey: "test-key", model, quickMode: true }
    const result = await translateScreenshot("test-image", source, target, opts)
    assert.equal(result.translated, "你好")
    assert.equal((await parseMath("test-image", opts)).markdown, "$x$")
  }
  assert.equal(sessions.size, 6)
})

test("custom endpoints do not receive OpenCode-specific headers", async (t) => {
  t.mock.method(globalThis, "fetch", async (_endpoint, init) => {
    const headers = new Headers(init.headers)
    assert.equal(headers.get("x-opencode-session"), null)
    assert.equal(headers.get("user-agent"), null)
    return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] })
  })
  for (const endpoint of [
    "https://example.com/v1/chat/completions",
    "https://opencode.ai.example.com/v1/chat/completions",
    "http://localhost:1234/v1/chat/completions",
  ]) {
    await translateScreenshot("test-image", source, target, {
      apiKey: "test-key", model: "kimi-k2.7-code", endpoint,
    })
  }
})
