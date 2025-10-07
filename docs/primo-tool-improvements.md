# Primo Tool Improvements

## Summary
Restructured the SearchPrimo tool to use structured parameters instead of query strings, making it significantly easier for the agent to use correctly and reducing errors.

## Changes Made

### 1. Tool Interface Simplification (src/tools/primoTool.ts)

**Before:**
```typescript
// Agent had to construct complex query strings like:
{ query: 'title,exact,"Their Eyes Were Watching God"' }
```

**After:**
```typescript
// Agent now provides structured parameters:
{
  value: "Their Eyes Were Watching God",
  field: "title",
  operator: "exact"
}
```

**Benefits:**
- No string formatting errors
- Clear parameter types with autocomplete
- Explicit field and operator choices
- Self-documenting through parameter names

### 2. Enhanced Tool Description

Added comprehensive inline documentation in the tool definition itself:
- Explains each parameter clearly
- Lists all available fields: `any`, `title`, `creator`, `sub`, `isbn`, `issn`
- Lists operators: `contains`, `exact`
- Provides search strategy guidance for different query types
- Includes retry strategy recommendations

### 3. Updated System Prompt (src/lib/prompt.ts)

Simplified the SearchPrimo guidance:
- Clear parameter selection strategy based on query type
- Examples for each search scenario (known-item, author, subject, ISBN)
- Explicit retry strategy when searches fail
- Removed complex query string examples

### 4. Default Values

Both `field` and `operator` have sensible defaults:
- `field='any'` - Search all fields
- `operator='contains'` - Match all words in any order

This allows simple searches like `{ value: "machine learning" }` to work immediately.

## Search Strategy Guidance

The tool now guides the agent to:

1. **Known-item searches** → `field='title', operator='exact'`
2. **Author searches** → `field='creator', operator='contains'`
3. **Subject searches** → `field='sub', operator='contains'`
4. **ISBN/ISSN lookups** → `field='isbn'/'issn', operator='exact'`
5. **General keywords** → `field='any', operator='contains'`

And when searches fail:
- Try different operator (`contains` ↔ `exact`)
- Try different field (`title` → `any` or vice versa)
- Simplify the search value (remove subtitles, articles, etc.)

## Testing

Added comprehensive tests:
- Tests for exact field/operator specification
- Tests for default value behavior
- Tests for error handling
- All tests pass ✓

## Backward Compatibility

- The `/api/primo/search` REST endpoint still uses the old query string format
- Only the tool interface changed
- The underlying `buildQuery()` function constructs the same query strings internally
