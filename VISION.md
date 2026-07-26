# LoreBridge Vision

## Purpose

LoreBridge enables AI assistants to safely understand and interact with tabletop roleplaying game campaigns through structured, permission-controlled tools.

A campaign rarely lives in one place. Its history may be spread across a virtual tabletop, campaign wiki, session notes, transcripts, handouts, and the Game Master's memory. LoreBridge is intended to connect those sources without surrendering control of them to an AI provider.

## What success looks like

A Game Master can talk naturally with an AI assistant and ask questions such as:

- What does the campaign currently say about this NPC?
- Find every journal reference to a location or artifact.
- Summarize the unresolved plot threads relevant to tonight's session.
- Which actors and journals are connected to the current scene?
- Prepare a proposed session recap for my approval.

The AI retrieves only the information needed, identifies its sources, and never changes campaign data without permission.

## Guiding principles

### GM control

The Game Master decides which worlds, document types, and operations LoreBridge may access.

### Read first

LoreBridge begins as a read-only system. Write capabilities are added individually and only after their behavior, permissions, previews, and audit trails are established.

### Least privilege

Every tool receives the narrowest access required to complete its task. LoreBridge will not provide arbitrary code execution, unrestricted database access, or general filesystem access.

### Provider independence

Campaign tools should not depend on ChatGPT, Claude, Gemini, or any one model provider. MCP will be the first client protocol, but the Foundry integration and shared tool contracts should remain reusable.

### Platform independence

Foundry VTT is the first platform, not the final boundary. The architecture should eventually permit additional campaign sources such as LegendKeeper, Obsidian, transcripts, and structured session records.

### Evidence over invention

Answers about a campaign should be grounded in retrieved campaign documents. The assistant should distinguish sourced facts, inferred connections, and creative suggestions.

### Human approval

Sensitive and destructive changes require an explicit preview and approval. The Game Master remains the final authority.

## Initial scope

The first release will focus on a live Foundry VTT v14 world and provide read-only access to:

- world information
- journals and journal pages
- actors
- scenes
- compendium indexes and selected entries

The first proof of concept is complete when an external AI client can ask for real campaign information and receive it through LoreBridge without requiring the question to be entered inside Foundry.

## Non-goals for the first release

- Autonomous campaign management
- Unattended changes to world data
- Arbitrary macro or JavaScript execution
- Direct access to Foundry's database files
- Bulk ingestion of an entire world into every AI request
- Support for every game system at launch
