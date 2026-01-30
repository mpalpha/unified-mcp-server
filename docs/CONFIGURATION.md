# Configuration

## Built-in Presets

### three-gate (Default)
Standard TEACH → LEARN → REASON workflow with moderate enforcement.

- **Enforcement**: Moderate
- **Token TTL**: Operation 5min, Session 60min
- **Gates**: All three gates with required tools per phase

### minimal
Lightweight workflow with optional gates.

- **Enforcement**: Lenient
- **Token TTL**: Operation 10min, Session 120min
- **Gates**: All optional, no required tools

### strict
Strict enforcement with all validations required.

- **Enforcement**: Strict
- **Token TTL**: Operation 3min, Session 30min
- **Gates**: All gates with extensive tool requirements

### custom
Template for custom workflows.

- **Enforcement**: Custom
- **Token TTL**: Configurable
- **Gates**: Customize as needed

## Preset Structure

```json
{
  "name": "my-preset",
  "description": "Custom workflow",
  "gates": {
    "teach": {
      "required_tools": ["record_experience"],
      "description": "Record knowledge"
    },
    "learn": {
      "required_tools": ["search_experiences"],
      "description": "Gather context"
    },
    "reason": {
      "required_tools": ["reason_through"],
      "description": "Think through problem"
    }
  },
  "token_ttl": {
    "operation": 300000,
    "session": 3600000
  },
  "enforcement": "moderate"
}
```

## Creating Custom Presets

1. Export a built-in preset:
```json
{
  "name": "export_config",
  "arguments": {
    "preset_name": "three-gate",
    "file_path": "~/.unified-mcp/presets/my-custom.json"
  }
}
```

2. Edit the JSON file

3. Apply your custom preset:
```json
{
  "name": "apply_preset",
  "arguments": {
    "preset_name": "my-custom",
    "session_id": "my-session"
  }
}
```

## Validation

Validate your configuration:
```json
{
  "name": "validate_config",
  "arguments": {
    "config": { /* your config */ }
  }
}
```

Returns errors and warnings for invalid configurations.

## Preset Storage

- Built-in presets: Defined in server code
- Custom presets: `~/.unified-mcp/presets/*.json`
