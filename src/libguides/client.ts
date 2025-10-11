import './env.js';
import type {
  LibGuidesConfig,
  LibGuidesAuthResponse,
  LibGuidesDatabase,
  LibGuidesDatabaseSearchResult,
  DatabaseSearchInput,
  LibGuidesGuide,
  GuideSearchInput,
  GuideSearchResult
} from './types.js';

let cachedConfig: LibGuidesConfig | null = null;
let cachedToken: { token: string; expires: number } | null = null;

function readEnv(key: string): string | undefined {
  const value = process.env[key];
  return typeof value === 'string' ? value : undefined;
}

export function getLibGuidesConfig(): LibGuidesConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const siteId = readEnv('LIBGUIDES_SITE_ID');
  const clientId = readEnv('LIBGUIDES_CLIENT_ID');
  const clientSecret = readEnv('LIBGUIDES_CLIENT_SECRET');
  const baseUrl = readEnv('LIBGUIDES_BASE_URL') ?? 'https://lgapi-us.libapps.com/1.2';

  if (!siteId) {
    throw new Error('LIBGUIDES_SITE_ID is not configured.');
  }
  if (!clientId) {
    throw new Error('LIBGUIDES_CLIENT_ID is not configured.');
  }
  if (!clientSecret) {
    throw new Error('LIBGUIDES_CLIENT_SECRET is not configured.');
  }

  const config: LibGuidesConfig = {
    siteId,
    clientId,
    clientSecret,
    baseUrl
  };

  cachedConfig = config;
  return config;
}

async function getAccessToken(config: LibGuidesConfig): Promise<string> {
  const now = Date.now();

  if (cachedToken && cachedToken.expires > now) {
    return cachedToken.token;
  }

  const params = new URLSearchParams();
  params.set('client_id', config.clientId);
  params.set('client_secret', config.clientSecret);
  params.set('grant_type', 'client_credentials');

  const url = `${config.baseUrl}/oauth/token`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LibGuides OAuth failed with status ${response.status}: ${body}`);
  }

  const data = (await response.json()) as LibGuidesAuthResponse;

  cachedToken = {
    token: data.access_token,
    expires: now + (data.expires_in - 60) * 1000
  };

  return data.access_token;
}

export async function searchDatabases(input: DatabaseSearchInput): Promise<LibGuidesDatabaseSearchResult> {
  const config = getLibGuidesConfig();
  const token = await getAccessToken(config);

  const params = new URLSearchParams();
  params.set('site_id', config.siteId);

  // Note: /az endpoint doesn't support text search parameter
  // We'll filter client-side instead

  if (input.subject) {
    params.set('subject_id', input.subject);
  }

  if (input.type) {
    params.set('type_id', input.type);
  }

  const limit = input.limit ?? 20;
  params.set('expand', 'subjects,types,vendors');

  const url = `${config.baseUrl}/az?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    const truncated = body.length > 500 ? `${body.slice(0, 500)}…` : body;
    throw new Error(`LibGuides database search failed with status ${response.status}: ${truncated}`);
  }

  let databases = (await response.json()) as LibGuidesDatabase[];

  // Client-side filtering if search term provided
  if (input.search) {
    const searchLower = input.search.toLowerCase();
    databases = databases.filter(db => {
      // Search in name, description, and alt_names
      const nameMatch = db.name?.toLowerCase().includes(searchLower);
      const descMatch = db.description?.toLowerCase().includes(searchLower);
      const altMatch = db.alt_names?.some(alt => alt.toLowerCase().includes(searchLower));

      return nameMatch || descMatch || altMatch;
    });
  }

  const limited = databases.slice(0, limit);

  return {
    databases: limited,
    total: databases.length
  };
}

export async function searchGuides(input: GuideSearchInput): Promise<GuideSearchResult> {
  const config = getLibGuidesConfig();
  const token = await getAccessToken(config);

  const params = new URLSearchParams();
  params.set('site_id', config.siteId);
  params.set('status', '1,2'); // Published (1) and Unlisted (2) guides - excludes private/draft (0)

  if (input.search) {
    params.set('search_terms', input.search);

    // Use full-text search if requested (searches all content, not just name/description)
    if (input.fullTextSearch) {
      params.set('sort_by', 'relevance');
    }
  }

  // Default to expanding pages and boxes to get all tabbed content
  const expand = input.expand ?? 'pages.boxes';
  if (expand) {
    params.set('expand', expand);
  }

  const limit = input.limit ?? 10;

  let url: string;
  if (input.guideId) {
    // Fetch specific guide by ID
    url = `${config.baseUrl}/guides/${input.guideId}?${params.toString()}`;
  } else {
    // Search guides
    url = `${config.baseUrl}/guides?${params.toString()}`;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    const truncated = body.length > 500 ? `${body.slice(0, 500)}…` : body;
    throw new Error(`LibGuides guide search failed with status ${response.status}: ${truncated}`);
  }

  const data = await response.json();

  // API returns single object for specific guide, array for search
  const guides: LibGuidesGuide[] = Array.isArray(data) ? data : [data];
  const limited = guides.slice(0, limit);

  return {
    guides: limited,
    total: guides.length
  };
}
