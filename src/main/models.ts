type QuickSetting = "low" | "none" | "disable-thinking" | "default"

export const GO_ENDPOINTS = {
  openai: "https://opencode.ai/inference/go/openai/v1/chat/completions",
  anthropic: "https://opencode.ai/inference/go/anthropic/v1/messages",
}

const builtinEndpoints = new Set([
  ...Object.values(GO_ENDPOINTS),
  "https://opencode.ai/zen/go/v1/chat/completions",
  "https://opencode.ai/zen/go/v1/messages",
])

export function isBuiltinEndpoint(endpoint: string): boolean {
  return !endpoint || builtinEndpoints.has(endpoint.replace(/\/$/, ""))
}

interface GoModel {
  id: string
  name: string
  protocol: "openai" | "anthropic"
  quick: QuickSetting
}

// OpenCode Go models that accept PNG and use one of the app's two protocols.
export const MODELS: readonly GoModel[] = [
  { id: "qwen3.7-plus", name: "Qwen3.7 Plus", protocol: "anthropic", quick: "disable-thinking" },
  { id: "minimax-m3", name: "MiniMax M3", protocol: "anthropic", quick: "disable-thinking" },
  { id: "qwen3.8-flash", name: "Qwen3.8 Flash", protocol: "anthropic", quick: "disable-thinking" },
  { id: "minimax-m3.1-flash", name: "MiniMax M3.1 Flash", protocol: "openai", quick: "low" },
  { id: "hy4-flash-free", name: "Hy4 Flash Free", protocol: "openai", quick: "none" },
  { id: "glm-5.3-flash", name: "GLM-5.3 Flash", protocol: "openai", quick: "low" },
  { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", protocol: "openai", quick: "low" },
  { id: "mimo-v2.6-flash", name: "MiMo V2.6 Flash", protocol: "openai", quick: "default" },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", protocol: "anthropic", quick: "disable-thinking" },
  { id: "kimi-k2.7-code", name: "Kimi K2.7 Code", protocol: "openai", quick: "default" },
  { id: "kimi-k3", name: "Kimi K3", protocol: "openai", quick: "default" },
  { id: "kimi-k3.1-pro", name: "Kimi K3.1 Pro", protocol: "openai", quick: "low" },
  { id: "mimo-v2.6-pro", name: "MiMo V2.6 Pro", protocol: "openai", quick: "default" },
  { id: "step-5-preview", name: "Step 5 Preview", protocol: "openai", quick: "low" },
  { id: "qwen3.8-max", name: "Qwen3.8 Max", protocol: "anthropic", quick: "disable-thinking" },
  { id: "hy4", name: "Hy4", protocol: "openai", quick: "none" },
  { id: "qwen4-max", name: "Qwen4 Max", protocol: "anthropic", quick: "disable-thinking" },
  { id: "longcat-2.5", name: "LongCat 2.5", protocol: "openai", quick: "disable-thinking" },
  { id: "hungerg-free", name: "HungerG Free", protocol: "openai", quick: "default" },
]

export const DEFAULT_MODEL = "qwen3.7-plus"

export function findModel(id: string) {
  return MODELS.find(model => model.id === id)
}
