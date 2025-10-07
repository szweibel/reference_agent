import './env.js';
import type {
  PrimoApiBestLocation,
  PrimoApiDoc,
  PrimoApiDelivery,
  PrimoApiInstitutionAvailability,
  PrimoApiPnx,
  PrimoApiResponse,
  PrimoAvailabilitySummary,
  PrimoConfig,
  PrimoConsortiumAvailability,
  PrimoItemSummary,
  PrimoLocalAvailability,
  PrimoSearchInfo,
  PrimoSearchInput,
  PrimoSearchResult
} from './types.js';

const DEFAULT_LIMIT = 10;

let cachedConfig: PrimoConfig | null = null;

function readEnv(key: string): string | undefined {
  const direct = process.env[key];
  if (typeof direct === 'string') {
    return direct;
  }

  const upper = key.toUpperCase();
  const upperValue = process.env[upper];
  if (typeof upperValue === 'string') {
    return upperValue;
  }

  const lower = key.toLowerCase();
  const lowerValue = process.env[lower];
  if (typeof lowerValue === 'string') {
    return lowerValue;
  }

  return undefined;
}

function canonicaliseVid(rawVid: string): { vid: string; institutionCode: string; viewCode: string } {
  const trimmed = rawVid.trim();
  if (trimmed.includes(':')) {
    const [institutionCode = trimmed, viewCode = ''] = trimmed.split(':', 2);
    return {
      vid: `${institutionCode}:${viewCode}`,
      institutionCode,
      viewCode
    };
  }

  const institutionCode = trimmed;
  const withoutLeadingDigits = trimmed.replace(/^\d+/, '');
  const viewCode = withoutLeadingDigits.length > 0 ? withoutLeadingDigits : trimmed;
  return {
    vid: `${institutionCode}:${viewCode}`,
    institutionCode,
    viewCode
  };
}

function deriveDiscoveryHost(viewCode: string): string {
  if (!viewCode) {
    return 'cuny-gc.primo.exlibrisgroup.com';
  }
  const hostSegment = viewCode.toLowerCase().replace(/_/g, '-');
  return `${hostSegment}.primo.exlibrisgroup.com`;
}

export function getPrimoConfig(): PrimoConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const apiKey = readEnv('PRIMO_API_KEY');
  if (!apiKey) {
    throw new Error('PRIMO_API_KEY is not configured.');
  }

  const baseUrl = readEnv('PRIMO_BASE_URL') ?? 'https://api-na.hosted.exlibrisgroup.com/primo/v1/search';
  const rawVid = readEnv('PRIMO_VID') ?? readEnv('PRIMO_VIEW_ID') ?? readEnv('PRIMO_VID_DEFAULT');
  if (!rawVid) {
    throw new Error('PRIMO_VID is not configured.');
  }

  const { vid, institutionCode, viewCode } = canonicaliseVid(rawVid);
  const scope = readEnv('PRIMO_SCOPE');
  const tab = readEnv('PRIMO_TAB');
  const discoveryHost = deriveDiscoveryHost(viewCode);

  const config: PrimoConfig = {
    apiKey,
    baseUrl,
    vid,
    institutionCode,
    viewCode,
    discoveryHost
  };

  if (typeof scope === 'string' && scope.length > 0) {
    config.scope = scope;
  }
  if (typeof tab === 'string' && tab.length > 0) {
    config.tab = tab;
  }

  cachedConfig = config;
  return config;
}

function firstString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim().length > 0) {
        return entry;
      }
    }
  }
  return null;
}

function collectStrings(value: unknown): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry : null))
      .filter((entry): entry is string => Boolean(entry && entry.trim().length > 0));
  }
  if (typeof value === 'string') {
    return value.trim().length > 0 ? [value] : [];
  }
  return [];
}

function cleanText(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const withoutSubfields = value.replace(/\$\$[A-Z0-9]+/g, '');
  const withoutHtml = withoutSubfields.replace(/<[^>]+>/g, ' ');
  const normalisedWhitespace = withoutHtml.replace(/\s+/g, ' ').trim();
  return normalisedWhitespace.length > 0 ? normalisedWhitespace : null;
}

function cleanTextArray(values: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const value of values) {
    const cleanedValue = cleanText(value);
    if (cleanedValue && !seen.has(cleanedValue)) {
      seen.add(cleanedValue);
      cleaned.push(cleanedValue);
    }
  }
  return cleaned;
}

function extractYear(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = value.match(/\b(\d{4})\b/);
  if (match && typeof match[1] === 'string' && match[1].length > 0) {
    return match[1];
  }
  return cleanText(value);
}

function isElectronicResource(delivery: PrimoApiDelivery | undefined | null): boolean {
  if (!delivery) {
    return false;
  }
  const category = delivery.deliveryCategory ?? [];
  const serviceMode = delivery.serviceMode ?? [];
  return category.some((entry) => typeof entry === 'string' && entry.toLowerCase().includes('alma-e')) ||
    serviceMode.some((entry) => typeof entry === 'string' && entry.toLowerCase().includes('viewit'));
}

function normaliseBestLocation(best: PrimoApiBestLocation | undefined | null, config: PrimoConfig, rawAvailability: string[]): PrimoLocalAvailability | null {
  if (!best) {
    return null;
  }
  const belongsToInstitution = best.organization === config.institutionCode ||
    (typeof best.libraryCode === 'string' && best.libraryCode.startsWith('GC'));

  if (!belongsToInstitution) {
    return null;
  }

  const availabilityStatus = best.availabilityStatus ?? null;
  const rawIndicator = availabilityStatus ? [availabilityStatus] : rawAvailability;
  const isAvailable = rawIndicator.some((entry) => typeof entry === 'string' && entry.toLowerCase().includes('available'));

  return {
    isAvailable,
    status: availabilityStatus,
    mainLocation: best.mainLocation ?? null,
    subLocation: best.subLocation ?? null,
    callNumber: best.callNumber ?? null,
    libraryCode: best.libraryCode ?? null
  };
}

function normaliseConsortiumAvailability(list: PrimoApiInstitutionAvailability[] | undefined | null, config: PrimoConfig): PrimoConsortiumAvailability[] {
  if (!list) {
    return [];
  }
  const entries: PrimoConsortiumAvailability[] = [];
  for (const entry of list) {
    if (!entry) {
      continue;
    }
    const code = typeof entry.instCode === 'string' && entry.instCode.length > 0 ? entry.instCode : null;
    if (!code || code === config.institutionCode) {
      continue;
    }
    const name = typeof entry.instName === 'string' && entry.instName.length > 0 ? entry.instName : null;
    const status = typeof entry.availabilityStatus === 'string' && entry.availabilityStatus.length > 0
      ? entry.availabilityStatus
      : null;

    entries.push({
      institutionCode: code,
      institutionName: name ?? code,
      status
    });
  }
  return entries;
}

function buildPermalink(recordId: string | null, context: string | undefined, config: PrimoConfig): string | null {
  if (!recordId) {
    return null;
  }
  const ctx = context ?? 'L';
  const url = new URL('https://' + config.discoveryHost + '/discovery/fulldisplay');
  url.searchParams.set('docid', recordId);
  url.searchParams.set('context', ctx);
  url.searchParams.set('vid', config.vid);
  return url.toString();
}

function normaliseDoc(doc: PrimoApiDoc, config: PrimoConfig): PrimoItemSummary {
  const delivery = doc.delivery;
  const pnx = doc.pnx ?? {};
  const display = (pnx.display ?? {}) as Record<string, unknown>;
  const addata = (pnx.addata ?? {}) as Record<string, unknown>;
  const control = (pnx.control ?? {}) as Record<string, unknown>;

  const title = cleanText(firstString(display['title']));
  const authors = cleanTextArray([
    ...collectStrings(addata['au']),
    ...collectStrings(display['creator']),
    ...collectStrings(display['contributor']),
    ...collectStrings(addata['addau'])
  ]);
  const publicationYear = extractYear(firstString(display['creationdate']) ?? firstString(addata['date']));
  const description = cleanText(
    firstString(display['description']) ?? firstString(addata['abstract']) ?? firstString(display['summary'])
  );
  const subjects = cleanTextArray(collectStrings(display['subject']));
  const identifiers = cleanTextArray(collectStrings(display['identifier']));
  const publisher = cleanText(firstString(display['publisher']) ?? firstString(addata['pub']));
  const language = cleanText(firstString(display['language']));
  const format = cleanText(firstString(display['format']) ?? firstString(addata['format']));

  const recordId = firstString(control['recordid']) ?? doc['@id'] ?? null;
  const sourceRecordId = firstString(control['sourcerecordid']);

  const rawAvailability = (delivery?.availability ?? [])
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const localAvailability = normaliseBestLocation(delivery?.bestlocation, config, rawAvailability);
  const consortiumAvailability = normaliseConsortiumAvailability(delivery?.almaInstitutionsList ?? undefined, config);

  const availability: PrimoAvailabilitySummary = {
    raw: rawAvailability,
    displayedAvailability: delivery?.displayedAvailability ?? null,
    local: localAvailability,
    consortium: consortiumAvailability,
    isElectronic: isElectronicResource(delivery)
  };

  const permalink = buildPermalink(recordId, doc.context, config);

  return {
    title,
    authors,
    publicationYear,
    description,
    recordId,
    sourceRecordId,
    permalink,
    subjects,
    identifiers,
    publisher,
    language,
    format,
    availability
  };
}

export async function searchPrimo(input: PrimoSearchInput): Promise<PrimoSearchResult> {
  const config = getPrimoConfig();
  const params = new URLSearchParams();
  params.set('apikey', config.apiKey);
  params.set('q', input.query);
  params.set('vid', config.vid);

  const limit = input.limit ?? DEFAULT_LIMIT;
  const offset = input.offset ?? 0;
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  const scope = input.scopeOverride ?? config.scope;
  if (scope) {
    params.set('scope', scope);
  }

  const tab = input.tabOverride ?? config.tab;
  if (tab) {
    params.set('tab', tab);
  }

  if (input.includePcAvailability !== false) {
    params.set('pcAvailability', 'true');
  }

  const url = `${config.baseUrl}?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    const truncated = body.length > 500 ? `${body.slice(0, 500)}…` : body;
    throw new Error(`Primo request failed with status ${response.status}: ${truncated}`);
  }

  const raw = (await response.json()) as PrimoApiResponse;
  const docs = raw.docs ?? [];
  const items = docs.map((doc) => normaliseDoc(doc, config));

  const info: PrimoSearchInfo = {
    total: raw.info?.total ?? raw.info?.totalResultsLocal ?? items.length,
    firstResult: raw.info?.first ?? (items.length > 0 ? offset + 1 : 0),
    lastResult: raw.info?.last ?? (items.length > 0 ? offset + items.length : 0),
    limit,
    offset
  };

  if (typeof raw.info?.totalResultsLocal === 'number') {
    info.totalLocal = raw.info.totalResultsLocal;
  }
  if (typeof raw.info?.totalResultsPC === 'number') {
    info.totalConsortium = raw.info.totalResultsPC;
  }

  return {
    info,
    items,
    raw
  };
}
