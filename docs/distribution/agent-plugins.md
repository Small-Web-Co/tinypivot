# TinyPivot in agent plugin directories

Where TinyPivot can be listed, what each directory needs, what this repository already has, and what only you can do (accounts, forms, and anything sent to another company). Checked against each directory's documentation on 2026-11-25; recheck before you submit, since several of these programs are new.

Everything below is ready in the repository unless a line says **You**.

## At a glance

| Directory | Who can submit | Ready in the repo | You |
|---|---|---|---|
| Claude directory (claude.ai, Cowork, Claude Code) | Anyone on a paid Claude plan | Plugin bundle in `packages/mcp`, passes `claude plugin validate --strict` | Submit at claude.ai/directory/manage |
| Claude Code channel allowlist | Anthropic partners only | Channel declared in `plugin.json`; request drafted below | Find a partner contact, send the request |
| Official MCP Registry | Already published | `packages/mcp/server.json`, published by CI | Nothing |
| Claude Desktop extensions (.mcpb) | Closed to new local servers | Nothing needed: the plugin bundle replaces it | Nothing |
| OpenCode ecosystem / awesome-opencode | Anyone, by pull request | Studio plugin installed by `init`; listing text below | Open the pull requests once the repo meets awesome-opencode's 25-star rule |
| pi package gallery | Automatic for npm packages with the `pi-package` keyword | pi extension installed by `init` | Optional follow-up: publish the extension as a pi package |
| Gemini CLI extension gallery | Automatic for public repos with the `gemini-cli-extension` topic | `gemini-extension.json`, passes `gemini extensions validate` | Add the GitHub topic |
| Antigravity plugin marketplace | Partners only, by interest form | `plugin.json` + `mcp_config.json` in `packages/mcp`, passes `agy plugin validate` | Send the interest form |
| Cursor marketplace | Anyone, manual review | `.cursor-plugin/plugin.json`, `mcp.json`, root `.cursor-plugin/marketplace.json` | Submit at cursor.com/marketplace/publish |
| Codex / ChatGPT plugin directory | Local MCP servers: OpenAI partners only | `.codex-plugin/plugin.json`, root `.agents/plugins/marketplace.json` (self-hosted marketplace) | Ask an OpenAI contact to allowlist the org, or stay self-hosted |

## Before any submission

- **Privacy and terms pages.** `https://tiny-pivot.com/privacy` and `https://tiny-pivot.com/terms` are added in this branch (`demo/site/legal.ts`). They go live with the next site deploy. Claude's, Codex's and Cursor's forms ask for them. Have someone qualified read both: they describe what the code does, but they are not legal advice, and the terms leave out governing law and a refund policy.
- **License.** The manifests' `license` field is `SEE LICENSE IN LICENSE.md`, matching `packages/mcp/package.json` and the dual-license `packages/mcp/LICENSE.md` (a test keeps them in step). Some forms ask for an SPDX identifier; where one does, answer with the license file instead of `MIT`.
- **Icon.** `packages/mcp/assets/icon.png` (512×512, the site's pivot-grid mark). Antigravity asks for about 10% padding and legibility on light and dark backgrounds: the mark has a cream background, so it reads on both.
- **Versions.** Every manifest carries the MCP package version (0.6.0), and the Claude plugin's `.mcp.json` starts exactly that version. Release with `pnpm release:mcp <patch|minor|major|x.y.z>`: it bumps `packages/mcp/package.json`, `server.json`, `.mcp.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.codex-plugin/plugin.json`, `plugin.json`, `src/server.ts`, `src/telemetry.ts`, the root `.claude-plugin/marketplace.json` and `gemini-extension.json`. `tests/unit/mcp-init.test.ts` fails if any of them drifts.

## Claude Code and the Claude directory

**Submit:** https://claude.ai/directory/manage → Submit new → Plugin bundle. Docs: https://claude.com/docs/plugins/submit, checklist: https://claude.com/docs/plugins/pre-submission-checklist.

Requirements:
- A paid plan (Pro, Max or Ultra; on Team or Enterprise, an Owner or a role with the Directory permission), with your GitHub account connected on claude.ai and push access to `Small-Web-Co/tinypivot`.
- Repository `Small-Web-Co/tinypivot`, plugin path `packages/mcp`, branch `master` (or a release tag).
- Form steps: validation, listing details (read from `plugin.json` and the README), data handling questions, compliance (a contact email and four acknowledgements).
- Everything the plugin runs must be inside `packages/mcp`. It is: the plugin only starts `npx`.

Ready:
- `packages/mcp/.claude-plugin/plugin.json` now has `displayName`, `icon`, `documentationUrl`, `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl`, `network.hosts` (registry.npmjs.org for npx and DuckDB, tiny-pivot.com for usage statistics, and www.tiny-pivot.com, where the site redirects it) and the `channels` entry.
- `claude plugin validate --strict packages/mcp` passes, including its directory checks.

**Pinned npx.** The directory's checklist says an `npx` launcher must be pinned to an exact version and that an unpinned one blocks submission. The plugin's `.mcp.json` therefore starts `@smallwebco/tinypivot-mcp@0.6.0`, and `pnpm release:mcp` moves the pin with each release. Plugin users get a release once the directory picks up the new commit. Everything else, including `init`'s configs and the Cursor, Antigravity and Gemini manifests, keeps `@latest` so a release reaches users on restart (see `MCP_NPX_SPEC` in `src/init.ts`).

Pinned packages are always held for a human reviewer, so expect a manual review either way.

## Claude Code channel allowlist

Goal: `claude --channels plugin:tinypivot@<marketplace>` works without `--dangerously-load-development-channels`.

What the docs say (https://code.claude.com/docs/en/channels, https://code.claude.com/docs/en/channels-reference):
- During the research preview, `--channels` accepts only plugins on Anthropic's allowlist, or on an organization's own `allowedChannelPlugins` list.
- The default allowlist is the channel plugins in `claude-plugins-official`. The community marketplace is not on it, and neither is a plugin in its own marketplace (like `tinypivot@tinypivot` today).
- There is no public form. The docs say partners should ask their Anthropic partner contact to coordinate an official-marketplace listing.
- Team and Enterprise admins can allow TinyPivot for their own organization now, with managed settings:

  ```json
  {
    "channelsEnabled": true,
    "allowedChannelPlugins": [{ "marketplace": "tinypivot", "plugin": "tinypivot" }]
  }
  ```

  This list replaces Anthropic's default allowlist for that organization, so it has to name every channel plugin the organization uses.

Ready:
- `packages/mcp/.claude-plugin/plugin.json` declares `"channels": [{ "server": "tinypivot", "displayName": "TinyPivot Studio" }]`, bound to the server in `.mcp.json`.
- The server declares `claude/channel` when Claude Code was started with TinyPivot in either channel flag (`src/claude-channel.ts`; it recognises `plugin:tinypivot@…` as well as `server:tinypivot`).
- It does not declare `claude/channel/permission`. The docs say to declare it only when the channel authenticates who is replying, and the Studio has no sign-in, so tool approvals stay in the terminal.

**You:** get TinyPivot into the Claude directory first (above), then send the request below to an Anthropic partner contact. If you don't have one, the Claude directory's support address (`directory@anthropic.com`, given in the directory docs for submission questions) is the closest public contact. Ask there who handles channel allowlist requests rather than expecting them to approve it.

Draft request:

> **Subject: Channel allowlist request — TinyPivot (Claude Code plugin)**
>
> Hello,
>
> We'd like TinyPivot's channel considered for the Claude Code channel allowlist, so users can start it with `claude --channels plugin:tinypivot@…` instead of `--dangerously-load-development-channels`.
>
> **What TinyPivot is.** A local MCP server (`@smallwebco/tinypivot-mcp`, source at https://github.com/Small-Web-Co/tinypivot, plugin in `packages/mcp`) that turns CSV, JSON and SQL results into charts and pivot tables. It is in the Official MCP Registry as `io.github.Small-Web-Co/tinypivot` [and in the Claude directory as … — add once listed].
>
> **What the channel does.** TinyPivot runs a local web page, TinyPivot Studio, at `http://127.0.0.1:<port>`, that shows each step Claude takes with the data: the reason, the SQL and the resulting chart. The user can write to Claude from that page, for example "split this by region" while looking at a chart. The channel delivers that message into the running Claude Code session as a `notifications/claude/channel` event, and Claude answers with the `studio_reply` tool so the answer appears in the Studio. Without the channel, the message waits until Claude next calls a TinyPivot tool.
>
> **Who can send messages.** Only the person at the computer: the Studio listens on 127.0.0.1 only, accepts writes only from its own page (it checks the Host and Origin headers and requires a custom `x-tinypivot` header that browsers won't send cross-site without a preflight it never grants), and has no remote or network access. There is no third-party service, webhook or bot in the path.
>
> **Permissions.** The channel does not declare `claude/channel/permission`; tool approvals stay in the terminal.
>
> **Data.** Studio messages contain only what the user types and the data rows they choose to attach. Nothing is sent off the machine by the channel. Privacy policy: https://tiny-pivot.com/privacy.
>
> **Plugin manifest.** `channels: [{ "server": "tinypivot", "displayName": "TinyPivot Studio" }]` in `packages/mcp/.claude-plugin/plugin.json`; the server code is `packages/mcp/src/claude-channel.ts` and `src/server.ts` (`studio_reply`).
>
> Happy to make changes to meet your requirements, or to list the plugin in `claude-plugins-official` if that is the route.
>
> Thanks,
> [name], Small Web, LLC
> [contact email]

## Official MCP Registry

Already published as `io.github.Small-Web-Co/tinypivot` from `packages/mcp/server.json` by the `mcp-v*` tag workflow. Note the registry limits `description` to 100 characters; the current one is 94.

## Claude Desktop extensions (.mcpb)

The Claude directory no longer accepts local MCP servers packaged as desktop extensions (https://claude.com/docs/directory/publish). The plugin bundle above is the way to list a local server now, so there is nothing to build.

## OpenCode

Live Studio messages: done in this branch.
- `src/opencode-plugin.ts` generates `~/.config/opencode/plugins/tinypivot.js`. When a TinyPivot tool runs in an OpenCode session, the plugin connects to that Studio's `/api/studio/agent-stream`. A Studio message becomes a prompt in that session (`client.session.promptAsync`). When the session goes idle, the plugin posts the agent's last answer to `/api/studio/reply`, and it reports busy/idle to `/api/studio/agent-status`.
- `init` installs the plugin when OpenCode is detected (or with `--targets=opencode`). The server refreshes an installed copy to the current version, and tells the Studio user to run `init` when it is missing.
- Tested against a real OpenCode 1.19.3 session (`opencode serve`): the Studio showed OpenCode as live, a Studio message started a turn, and the model's answer appeared in the Studio trace.
- **Not supported yet: OpenCode 2.x.** OpenCode 2 (2.4.1, released 2026-11-23) has a new plugin API (`Plugin.define({ id, setup(ctx) })`) and does not run 1.x plugins. When you move to OpenCode 2, the plugin needs a second entry point using `ctx.session.prompt` and `ctx.event.subscribe`.

Listings (**You**, once the repository qualifies):
- **awesome-opencode** (https://github.com/awesome-opencode/awesome-opencode, rules in `contributing.md`). Requires at least 25 stars (the repository has 13 today), a repository older than 30 days, a commit in the last 90 days, and setup documented. Add `data/plugins/tinypivot.yaml`:

  ```yaml
  name: TinyPivot
  repo: https://github.com/Small-Web-Co/tinypivot
  tagline: Charts, pivot tables and a live data Studio for OpenCode; send messages to your session from the Studio.
  description: TinyPivot is an MCP server and OpenCode plugin. It turns CSV, JSON and SQL results into charts and pivot tables, shows every step in a local Studio, and delivers messages you write in the Studio straight into the OpenCode session. Install with `npx @smallwebco/tinypivot-mcp@latest init --targets=opencode`.
  min_version: 1.19.0
  ```

  The PR must say it supports OpenCode V1 only.
- **opencode.ai/docs/ecosystem**: "Submit a PR" to the OpenCode docs; there are no further rules published.
- Optional later: publish the plugin as its own npm package so users can add it to OpenCode's `plugin` list instead of running `init`.

## pi

- `init` installs the pi extension (`~/.pi/agent/extensions/tinypivot.ts`), which already delivers Studio messages live.
- The gallery at https://pi.dev/packages lists npm packages with the `pi-package` keyword automatically; there is no submission. A pi package declares its files in a `pi` key in `package.json` (`extensions`, `skills`, …) and installs with `pi install npm:<name>`.
- **Follow-up, not done here:** ship the generated extension as a pi package (for example a build step that writes it into the package and a `pi.extensions` entry), then add the `pi-package` keyword. Until then, `init` is the install path.

## Gemini CLI

- `gemini-extension.json` at the repository root (Gemini installs extensions from a repository's root): starts the server through npx and offers an optional, keychain-stored license key setting. `gemini extensions validate .` passes.
- Install: `gemini extensions install https://github.com/Small-Web-Co/tinypivot`.
- Gallery: https://geminicli.com/extensions indexes public repositories with the `gemini-cli-extension` topic daily. **You:** add that topic to the GitHub repository.
- Since 2026-06-18 Google points unpaid users to the Antigravity CLI instead of Gemini CLI, so the Antigravity listing below matters more.

## Antigravity

- `packages/mcp/plugin.json` (`displayName`, `logo`, three `suggestedPrompts`, …) and `packages/mcp/mcp_config.json` (now npx; it pointed at `dist/cli.js`, which is not in the repository). `agy plugin validate packages/mcp` passes with two warnings it cannot avoid: it notices Claude Code's `.mcp.json` and Cursor's `mcp.json` in the same folder and says it won't load them.
- The marketplace (launched 2026-10-29) takes partner plugins only. **You:** fill in the interest form at https://forms.gle/2EX5RFYPoJe1UgxR9 (linked from https://antigravity.google/blog/plugin-marketplace-in-antigravity/).
- The Antigravity MCP store has no documented submission process.
- `init` keeps configuring the Antigravity IDE and CLI directly.

## Cursor

- `packages/mcp/.cursor-plugin/plugin.json`, `packages/mcp/mcp.json` (Cursor's file name for the plugin's MCP servers) and the root `.cursor-plugin/marketplace.json`, which points at `packages/mcp`. There is no Cursor validator on this machine, so these follow the docs (https://cursor.com/docs/plugins/building) without a local check.
- **You:** submit the public repository at https://cursor.com/marketplace/publish. Review is manual. Before submitting, try it locally by copying `packages/mcp` into `~/.cursor/plugins/local/tinypivot`, as the docs suggest.
- Teams can already import the repository as a team marketplace (Dashboard → Plugins & MCPs → Add Marketplace).

## Codex and ChatGPT

- `packages/mcp/.codex-plugin/plugin.json` (listing details in `interface`, MCP servers from `.mcp.json`, the skill) and the root `.agents/plugins/marketplace.json`. Users can add the repository as a marketplace now: `codex plugin marketplace add Small-Web-Co/tinypivot`. Codex is not installed on this machine, so this is untested.
- The public directory (https://platform.openai.com/plugins, docs at https://developers.openai.com/plugins/deploy/submission) only accepts plugins whose MCP server is a public HTTPS endpoint. A local server like TinyPivot needs an OpenAI representative to allowlist the organization, after which it is listed as "Desktop only". The submission also asks for organization verification, five positive and three negative test cases, a demo video and release notes. **You:** decide whether to pursue that through an OpenAI contact.

## Other places worth a look later

- GitHub MCP Registry (https://github.com/mcp, one-click install in VS Code): appears to draw from the Official MCP Registry, where TinyPivot already is. Check whether it is listed.
- Zed: MCP server extensions are pull requests to `zed-industries/extensions`, and Zed plans to move to the Official MCP Registry instead.
- Goose and Amp: no public submission process found.
