# Contributing to Unified MCP Server

Thank you for considering contributing to the Unified MCP Server! This document provides guidelines for contributing to the project.

## Code of Conduct

Be respectful, inclusive, and professional in all interactions.

## How to Contribute

### Reporting Issues

Before creating an issue, please check if it already exists. When creating a new issue:

1. Use a clear, descriptive title
2. Describe the expected behavior vs actual behavior
3. Include steps to reproduce the issue
4. Include your environment details (OS, Node version, etc.)
5. Add relevant logs or error messages

### Suggesting Features

Feature suggestions are welcome! Please:

1. Check if the feature has already been requested
2. Explain the use case and benefit
3. Describe how you envision it working
4. Consider implementation complexity

### Pull Requests

1. **Fork the repository** and create a branch from `main`
2. **Follow the existing code style** - see Code Style section below
3. **Add tests** for new features or bug fixes
4. **Update documentation** if you change APIs or add features
5. **Run all tests** before submitting: `npm test`
6. **Keep PRs focused** - one feature or fix per PR

## Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/unified-mcp-server.git
cd unified-mcp-server

# Install dependencies
npm install

# Run tests
npm test

# Test locally with npx
npx .
```

## Code Style

- Use **2 spaces** for indentation
- Add **JSDoc comments** for all functions
- Follow **existing naming conventions**
- Keep functions **small and focused**
- Use **descriptive variable names**

### Function Documentation

```javascript
/**
 * Brief description of what the function does
 *
 * @param {Object} params - Parameter object
 * @param {string} params.field - Description of field
 * @returns {Object} Description of return value
 * @throws {ValidationError} When validation fails
 */
function exampleFunction(params) {
  // Implementation
}
```

## Testing

All contributions must include tests:

- **Unit tests** for individual tools
- **Integration tests** for multi-tool workflows
- **Error handling tests** for validation

Test structure:
```javascript
await test('tool_name - test description', async () => {
  const result = await callMCP('tool_name', { param: 'value' });
  assertTrue(condition, 'Failure message');
});
```

### Development Workflow (Cascading Updates)

When making changes, always follow this order:

1. **Docs first** — update documentation to reflect what you intend to build
2. **Implementation** — write the code
3. **Tests** — add or update tests for the changed code
4. **Version bump** — update version in `package.json` and `index.js`

Run targeted tests after each implementation step. Run the full suite before commit.

### Test Targeting Guide

Use targeted test scripts during development instead of running the full suite every time. Pick the script(s) that cover the modules you changed.

| Area | Source modules | Test script | Test file |
|------|---------------|-------------|-----------|
| **Infrastructure** | `src/database.js`, `src/database-wasm.js`, `src/errors.js`, `src/validation.js` | `npm run test:database` | `test/test-database.js` |
| **CLI** | `src/cli.js`, `bootstrap.js`, `index.js` (entry) | `npm run test:cli` | `test/test-cli.js` |
| **Memory system** | `src/memory/*.js` | `npm run test:memory` | `test/test-memory-system.js` |
| **Tools — knowledge** | `src/tools/knowledge.js` | `npm run test:tools` | `test/test-tools.js` |
| **Tools — reasoning** | `src/tools/reasoning.js` | `npm run test:tools` | `test/test-tools.js` |
| **Tools — workflow** | `src/tools/workflow.js` | `npm run test:workflows` | `test/test-workflows.js` |
| **Tools — config** | `src/tools/config.js` | `npm run test:config` | `test/test-config.js` |
| **Tools — automation** | `src/tools/automation.js` | `npm run test:hook-execution` | `test/test-hook-execution.js` |
| **Tools — memory MCP** | `src/tools/memory.js` | `npm run test:memory` | `test/test-memory-system.js` |
| **Compliance / enforcement** | `src/tools/workflow.js` (compliance) | `npm run test:compliance` | `test/test-compliance.js` |
| **Enforcement rules** | Protocol enforcement logic | `npm run test:enforcement` | `test/test-enforcement.js` |
| **Project context** | `src/tools/automation.js` (project context) | `npm run test:project-context` | `test/test-project-context.js` |
| **Tool descriptions** | Tool schema/descriptions | `npm run test:tool-description-dryrun` | `test/test-tool-description-dryrun.js` |
| **Tool guidance** | Protocol-with-context | `npm run test:tool-guidance` | `test/test-tool-guidance.js` |
| **Integration** | Cross-module workflows | `npm run test:integration` | `test/test-integration.js` |
| **Agent workflows** | Agent-facing workflows | `npm run test:agent-workflows` | `test/test-agent-workflows.js` |
| **npx** | Package/install behavior | `npm run test:npx` | `test/test-npx.js` |
| **Version sync** | Version consistency across files | `npm run test:version-sync` | `test/test-version-sync.js` |

### When to Run What

- **During development** — run only the targeted script(s) for the modules you touched
- **Spanning multiple areas** — chain the relevant scripts:
  ```bash
  npm run test:memory && npm run test:tools
  ```
- **Before commit/push** — always run the full suite: `npm test`
- **Docs-only changes** — run `npm run test:version-sync` (checks doc/code consistency)

## Tool Development

When adding new tools:

1. Add function to index.js in appropriate section
2. Add handler case in MCP tools/call section
3. Add tool to tools/list response
4. Write at least 4 tests (success, validation, edge cases)
5. Document in docs/TOOL_REFERENCE.md
6. Update README if it's a major feature

## Commit Messages

Use clear, descriptive commit messages:

- **feat:** New feature (e.g., "feat: add export_config tool")
- **fix:** Bug fix (e.g., "fix: handle missing session_id")
- **docs:** Documentation changes
- **test:** Adding or updating tests
- **refactor:** Code refactoring without changing behavior
- **chore:** Maintenance tasks

Example:
```
feat: add search filtering by domain

- Add domain parameter to search_experiences
- Update FTS5 query to include domain filter
- Add tests for domain filtering
```

## Documentation

Keep documentation up to date:

- **README.md** - Overview and quick start
- **docs/TOOL_REFERENCE.md** - Tool documentation with examples
- **docs/WORKFLOWS.md** - Usage patterns
- **docs/CONFIGURATION.md** - Configuration options

## Release Process

Maintainers handle releases:

1. Update version in package.json and index.js
2. Update CHANGELOG.md with changes
3. Run full test suite
4. Create git tag
5. Update gist deployment
6. Announce release

## Questions?

- Open a discussion for general questions
- Create an issue for bugs or features
- Check existing documentation first

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
