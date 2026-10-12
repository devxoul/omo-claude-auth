# omo-claude-auth

An [omo](https://github.com/code-yeongyu/senpi) extension that lets omo use your existing Claude Code login. It wraps [opencode-claude-auth](https://github.com/griffinmartin/opencode-claude-auth) and leaves the plugin's code unchanged.

## How it works

opencode-claude-auth does all of its work inside the `fetch` function that its OpenCode auth loader returns: reading credentials from the macOS Keychain or `~/.claude/.credentials.json`, refreshing OAuth tokens, adding Claude Code headers and beta flags, renaming tools, transforming the response stream, and retrying requests.

This extension:

1. Runs the plugin with a stub OpenCode context to get that `fetch`.
2. Starts a loopback HTTP proxy on `127.0.0.1` that sends every request through it.
3. Adds the Claude Code system identity to each request, which the plugin's `experimental.chat.system.transform` hook does in OpenCode.
4. Registers a `claude-code` provider that uses omo's built-in `anthropic-messages` API, with the proxy as its `baseUrl`.

To get plugin fixes, run `bun update opencode-claude-auth`.

## Requirements

- Claude Code installed and logged in (run `claude` at least once)
- omo (senpi)
- Bun

## Installation

```sh
git clone https://github.com/devxoul/omo-claude-auth.git
cd omo-claude-auth
bun install
```

Add the folder to `packages` in your omo settings (`~/.omo/agent/settings.json`). Relative paths resolve from the agent directory:

```json
{
  "packages": ["/path/to/omo-claude-auth"]
}
```

To try it without changing settings, run `omo -e /path/to/omo-claude-auth/index.ts`.

## Usage

Select one of the `claude-code/*` models:

```sh
omo --list-models claude-code
omo --model claude-code/claude-opus-5-5
```

| Model                           | Context | Max output |
| ------------------------------- | ------- | ---------- |
| `claude-code/claude-opus-5-5`   | 200K    | 64K        |
| `claude-code/claude-sonnet-5-5` | 200K    | 64K        |
| `claude-code/claude-haiku-5-5`  | 200K    | 64K        |
| `claude-code/claude-opus-5`     | 200K    | 64K        |

The context window is capped at 200K because longer context can be billed as extra usage. To change the model list, edit `MODELS` in `index.ts`.

If no Claude Code OAuth credentials are found, the extension logs a warning and doesn't register the provider.

The plugin's environment variables (`ANTHROPIC_CLI_VERSION`, `ANTHROPIC_BETA_FLAGS`, `CLAUDE_AUTH_DEBUG`, `CLAUDE_CONFIG_DIR`, and others) still apply. See the [opencode-claude-auth README](https://github.com/griffinmartin/opencode-claude-auth#environment-variable-overrides).

## Side effects

These come from opencode-claude-auth:

- It writes tokens to OpenCode's `auth.json` at startup and every 5 minutes.
- When it refreshes a token, it writes the new token back to the Keychain entry or credentials file. Claude Code uses the same entry, so a refresh also rotates Claude Code's token.

## Disclaimer

This project is not affiliated with or endorsed by Anthropic.

It uses Claude Code's OAuth credentials to authenticate with Anthropic's API. Anthropic's Terms of Service say that Claude Pro/Max subscription tokens should only be used with official Anthropic clients. Using this extension may violate those terms and could put your account at risk. It may also stop working whenever Anthropic changes its OAuth flow, headers, or billing checks. Use it at your own risk.

If you want subscription usage through an official path, omo's built-in `anthropic-subscription` provider routes requests through the Claude Agent SDK instead.

## License

[MIT](LICENSE)

This project depends on [opencode-claude-auth](https://github.com/griffinmartin/opencode-claude-auth), which is MIT-licensed by its authors.
