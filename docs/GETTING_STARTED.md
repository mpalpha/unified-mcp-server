# Getting Started

## Installation

### Option 1: NPX (Recommended - No Installation Required)

Run directly from GitHub:

```bash
# Run the server
npx mpalpha/unified-mcp-server

# Show help
npx mpalpha/unified-mcp-server --help

# Show version
npx mpalpha/unified-mcp-server --version

# Interactive setup wizard
npx mpalpha/unified-mcp-server --init
```

### Option 2: Local Development

```bash
npx mpalpha/unified-mcp-server
cd unified-mcp-server
npm install
```

## Claude Code Integration

Add to your Claude Code MCP settings (`~/.config/claude/settings.json`):

```json
{
  "mcpServers": {
    "unified-mcp": {
      "command": "npx",
      "args": ["mpalpha/unified-mcp-server"]
    }
  }
}
```

Restart Claude Code, and all 25 tools will be available immediately!

## Running Tests

```bash
npm test
```

Expected: `110/110 tests passing` (includes NPX compatibility tests)

## Starting the Server

### Via NPX:
```bash
npx .                    # Start MCP server (JSON-RPC mode)
npx . --help             # Show usage
npx . --version          # Show version
npx . --init             # Setup wizard
```

### Via Node:
```bash
node index.js
```

The server communicates via JSON-RPC over stdin/stdout when started without flags.

## Your First Experience

Record an experience:
```json
{
  "name": "record_experience",
  "arguments": {
    "type": "effective",
    "domain": "Testing",
    "situation": "Learning the unified MCP server",
    "approach": "Reading documentation",
    "outcome": "Successfully recorded experience",
    "reasoning": "Documentation is clear"
  }
}
```

Search for it:
```json
{
  "name": "search_experiences",
  "arguments": {
    "query": "unified MCP"
  }
}
```

## Database Location

All data stored in: `~/.unified-mcp/data.db`

## Health Check

```json
{
  "name": "health_check",
  "arguments": {}
}
```
