// Wraps the opencode-claude-auth OpenCode plugin as an omo (senpi) provider.
//
// The plugin's core logic lives behind the `fetch` its auth loader returns
// (credential reading, refresh, Claude Code headers, body/stream transforms,
// retries). This extension obtains that fetch with a stub OpenCode context and
// exposes it on a loopback proxy, so senpi's stock `anthropic-messages` API only
// needs a `baseUrl`.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'

import plugin, { SYSTEM_IDENTITY } from 'opencode-claude-auth/claude-auth-plugin'

const PROVIDER_ID = 'claude-code'
const UPSTREAM = 'https://api.anthropic.com'

type PluginFetch = (input: string, init: RequestInit) => Promise<Response>

interface ExtensionAPI {
  registerProvider(name: string, config: Record<string, unknown>): void
}

const model = (id: string, name: string, adaptive: boolean) => ({
  id,
  name,
  reasoning: true,
  input: ['text', 'image'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 200_000,
  maxTokens: 64_000,
  ...(adaptive ? { compat: { forceAdaptiveThinking: true } } : {}),
})

const MODELS = [
  model('claude-opus-5-5', 'Claude Opus 5.5 (Claude Code auth)', true),
  model('claude-sonnet-5-5', 'Claude Sonnet 5.5 (Claude Code auth)', true),
  model('claude-haiku-5-5', 'Claude Haiku 5.5 (Claude Code auth)', false),
  model('claude-opus-5', 'Claude Opus 5 (Claude Code auth)', true),
]

async function loadPluginFetch(): Promise<PluginFetch | undefined> {
  const hooks = (await (plugin as unknown as () => Promise<Record<string, any>>)()) ?? {}
  const loader = hooks.auth?.loader
  if (!loader) return undefined
  // The loader only checks `auth.type` and zeroes costs on `provider.models`.
  const result = await loader(async () => ({ type: 'oauth' }), { models: {} })
  return typeof result?.fetch === 'function' ? (result.fetch as PluginFetch) : undefined
}

// Stands in for the plugin's `experimental.chat.system.transform` hook.
function withIdentity(body: string): string {
  try {
    const parsed = JSON.parse(body)
    const system =
      typeof parsed.system === 'string'
        ? [{ type: 'text', text: parsed.system }]
        : Array.isArray(parsed.system)
          ? parsed.system
          : []
    if (!system.some((e: { text?: unknown }) => typeof e?.text === 'string' && e.text.startsWith(SYSTEM_IDENTITY))) {
      system.unshift({ type: 'text', text: SYSTEM_IDENTITY })
    }
    parsed.system = system
    return JSON.stringify(parsed)
  } catch {
    return body
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

const DROP_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length', 'accept-encoding'])
// fetch has already decoded the body, so these no longer describe it.
const DROP_RESPONSE_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection'])

function startProxy(pluginFetch: PluginFetch): Promise<string> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const abort = new AbortController()
    res.on('close', () => abort.abort())
    try {
      const headers: Record<string, string> = {}
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined && !DROP_REQUEST_HEADERS.has(key))
          headers[key] = Array.isArray(value) ? value.join(',') : value
      }
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
      const raw = hasBody ? await readBody(req) : undefined
      const response = await pluginFetch(`${UPSTREAM}${req.url ?? '/'}`, {
        method: req.method,
        headers,
        body: raw === undefined ? undefined : withIdentity(raw),
        signal: abort.signal,
      })
      const outHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        if (!DROP_RESPONSE_HEADERS.has(key)) outHeaders[key] = value
      })
      res.writeHead(response.status, outHeaders)
      if (!response.body) return void res.end()
      Readable.fromWeb(response.body as any)
        .on('error', () => res.destroy())
        .pipe(res)
    } catch (err) {
      if (abort.signal.aborted) return
      const message = err instanceof Error ? err.message : String(err)
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: `omo-claude-auth: ${message}` } }))
    }
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.unref()
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    })
  })
}

export default async function omoClaudeAuth(pi: ExtensionAPI): Promise<void> {
  const pluginFetch = await loadPluginFetch()
  if (!pluginFetch) {
    console.warn('omo-claude-auth: no Claude Code OAuth credentials found; provider not registered.')
    return
  }
  pi.registerProvider(PROVIDER_ID, {
    name: 'Claude Code (opencode-claude-auth)',
    baseUrl: await startProxy(pluginFetch),
    apiKey: 'omo-claude-auth',
    api: 'anthropic-messages',
    models: MODELS,
  })
}
