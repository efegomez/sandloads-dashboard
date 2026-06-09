# Welcome to TREC Operations

## How We Use Claude

Based on Fernando Gómez's usage over the last 30 days (40 sessions):

Work Type Breakdown:
  Build Feature  ████████░░░░░░░░░░░░  37%
  Debug Fix      ███████░░░░░░░░░░░░░  35%
  Plan & Design  ██░░░░░░░░░░░░░░░░░░  10%
  Analyze Data   ██░░░░░░░░░░░░░░░░░░   8%
  Improve Quality█░░░░░░░░░░░░░░░░░░░   5%
  Other          █░░░░░░░░░░░░░░░░░░░   5%

Top Skills & Commands:
  /init          ████░░░░░░░░░░░░░░░░  3x/month
  /plugin        ███░░░░░░░░░░░░░░░░░  2x/month
  /codex:setup   ███░░░░░░░░░░░░░░░░░  2x/month
  /clear         ███░░░░░░░░░░░░░░░░░  2x/month
  /login         ███░░░░░░░░░░░░░░░░░  2x/month
  /mcp           ██░░░░░░░░░░░░░░░░░░  1x/month
  /agents        ██░░░░░░░░░░░░░░░░░░  1x/month

Top MCP Servers:
  ccd_session         ████░░░░░░░░░░░░░░░░  3 calls
  claude_ai_Google_Drive ███░░░░░░░░░░░░░░░░░  2 calls

## Your Setup Checklist

### Codebases
- [ ] sandloads-dashboard — https://github.com/efegomez/sandloads-dashboard (operational dashboard, deployed via GitHub Pages)
- [ ] cotizador-bloom — https://github.com/efegomez/cotizador-bloom (quote generator for Bloom Design Studio)
- [ ] dispatch-bot — lives in `dispatch-bot/` subdirectory of sandloads-dashboard repo (Telegram bot for load tracking)

### MCP Servers to Activate
- [ ] ccd_session — Claude Code Desktop session management (tracks sessions across conversations). Built into Claude Code Desktop — no extra setup needed.
- [ ] claude_ai_Google_Drive — Google Drive integration for reading/writing sheets and docs. Requires Google auth — run `/mcp` in Claude Code to connect.

### Skills to Know About
- `/init` — generates a CLAUDE.md for a new project so Claude understands the codebase. Run this first when starting in an unfamiliar repo.
- `/codex:setup` — sets up the Codex CLI for agentic coding tasks. Run once per machine.
- `/mcp` — manage MCP server connections (Google Drive, etc.)
- `/agents` — list and manage running background agents
- `/plugin` — install/manage Claude Code plugins
- `/clear` — clear conversation context when things get stale mid-session

## Team Tips

_TODO_

## Get Started

_TODO_

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
