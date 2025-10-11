# LibGuides API Setup Guide

## Overview

The Databases A-Z list is powered by SpringShare LibGuides and requires API credentials to programmatically access the database list. This prevents hallucinations about database availability.

## Current Status

- **Journals A-Z**: ✅ Implemented via Primo API (uses existing `PRIMO_API_KEY`)
- **Blog**: ✅ Implemented via WordPress REST API (no authentication required)
- **Databases A-Z**: ⏳ Awaiting LibGuides API credentials

## Why LibGuides API is Needed

The Databases A-Z page (`https://libguides.gc.cuny.edu/az/databases`) loads content dynamically via JavaScript, making it impossible to scrape via WebFetch. Without API access, the agent cannot:

1. Verify which databases are actually available
2. Search for specific databases by name
3. Provide accurate information about database access

This leads to hallucinations (e.g., claiming "ProQuest, LexisNexis, and Dow Jones" are available without verification).

## LibGuides API Details

### API Version
- **LibGuides API v1.2** (latest)
- Authentication: OAuth 2.0
- Base URL: `https://lgapi-us.libapps.com/1.2/` (for US-hosted instances)

### Required Credentials

The following credentials must be obtained from the LibGuides admin panel:

1. **`site_id`** - Your institution's LibGuides site identifier
2. **`client_id`** - OAuth 2.0 client ID
3. **`client_secret`** - OAuth 2.0 client secret

### How to Obtain Credentials

**Admin Access Required**: You must have administrator access to your LibGuides CMS account.

1. Log into your LibGuides admin account at `https://[your-institution].libguides.com/libapps/`
2. Navigate to: **Tools → API → Endpoints 1.2**
3. The API documentation will display your credentials
4. Copy the `site_id`, `client_id`, and `client_secret`

### API Capabilities

The LibGuides API v1.2 supports:

- **GET** requests to retrieve database lists, guides, assets
- **POST/PUT** requests to create or update A-Z assets
- Filtering by subject, type, vendor, access mode
- Search functionality across database names and descriptions

### Relevant Endpoints

- **GET /az** - Retrieve A-Z database list
- **GET /az/{asset_id}** - Get specific database details
- Supports query parameters for filtering and search

## Configuration

### Environment Variables

Add to `primo/.env` (or create dedicated `.env` file):

```bash
# Existing Primo credentials
PRIMO_API_KEY="..."
primo_base_url="https://api-na.hosted.exlibrisgroup.com/primo/v1/search"
primo_vid="01CUNY_GC"
primo_tab="Everything"
primo_scope="IZ_CI_AW"

# LibGuides credentials (TO BE ADDED)
LIBGUIDES_SITE_ID="[your-site-id]"
LIBGUIDES_CLIENT_ID="[your-client-id]"
LIBGUIDES_CLIENT_SECRET="[your-client-secret]"
LIBGUIDES_BASE_URL="https://lgapi-us.libapps.com/1.2"
```

## Implementation Plan

### Phase 2A: Create Database Search Tool (once credentials obtained)

1. **Create `src/libguides/client.ts`**
   - OAuth 2.0 authentication
   - Database search function
   - Error handling

2. **Create `src/tools/databaseTool.ts`**
   - MCP tool wrapper for database searches
   - Parameters: search term, filters (subject, type)

3. **Create `src/tools/databaseMcpServer.ts`**
   - MCP server configuration
   - Export server for agentRunner

4. **Update `src/services/agentRunner.ts`**
   - Register database MCP server
   - Add to ALLOWED_TOOLS

5. **Update system prompt**
   - Document SearchDatabase tool
   - Remove hardcoded database references from site map
   - Instruct agent to verify database availability via tool

### Phase 2B: Testing

1. Test database searches (e.g., "JSTOR", "ProQuest", "Web of Science")
2. Test filtering by subject areas
3. Test handling of databases not available
4. Verify no more hallucinations about database availability

## Alternative: Manual Data Export

If API credentials cannot be obtained, consider:

1. **Manual JSON export** - Admin exports database list as JSON/CSV
2. **Static data file** - Store in `data/databases.json`
3. **Periodic updates** - Refresh monthly or quarterly

This is less ideal because:
- Requires manual updates
- No real-time accuracy
- Admin overhead

## Resources

- [SpringShare LibGuides API Documentation](https://ask.springshare.com/libguides/faq/871) (login required)
- [Ex Libris Developer Network - Primo API](https://developers.exlibrisgroup.com/primo/apis/)
- [CUNY GC LibGuides Home](https://libguides.gc.cuny.edu/)

## Questions?

Contact the LibGuides administrator or IT support for assistance obtaining API credentials.

---

*Last updated: 2025-10-08*
