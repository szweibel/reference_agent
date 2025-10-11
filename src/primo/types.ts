export interface PrimoConfig {
  apiKey: string;
  baseUrl: string;
  vid: string;
  scope?: string;
  tab?: string;
  institutionCode: string;
  viewCode: string;
  discoveryHost: string;
}

export interface PrimoSearchInput {
  query: string;
  limit?: number;
  offset?: number;
  scopeOverride?: string;
  tabOverride?: string;
  includePcAvailability?: boolean;
  qInclude?: string;
  facets?: string[];
}

export interface PrimoSearchInfo {
  total: number;
  totalLocal?: number;
  totalConsortium?: number;
  firstResult: number;
  lastResult: number;
  limit: number;
  offset: number;
}

export interface PrimoLocalAvailability {
  isAvailable: boolean;
  status: string | null;
  mainLocation: string | null;
  subLocation: string | null;
  callNumber: string | null;
  libraryCode: string | null;
}

export interface PrimoConsortiumAvailability {
  institutionCode: string;
  institutionName: string;
  status: string | null;
}

export interface PrimoAvailabilitySummary {
  raw: string[];
  displayedAvailability: string | null;
  local: PrimoLocalAvailability | null;
  consortium: PrimoConsortiumAvailability[];
  isElectronic: boolean;
}

export interface PrimoItemSummary {
  title: string | null;
  authors: string[];
  publicationYear: string | null;
  description: string | null;
  recordId: string | null;
  sourceRecordId: string | null;
  permalink: string | null;
  subjects: string[];
  identifiers: string[];
  publisher: string | null;
  language: string | null;
  format: string | null;
  availability: PrimoAvailabilitySummary;
}

export interface PrimoSearchResult {
  info: PrimoSearchInfo;
  items: PrimoItemSummary[];
  raw: PrimoApiResponse;
}

// --- Raw Primo API types (subset) ---
export interface PrimoApiResponse {
  info?: {
    total?: number;
    totalResultsLocal?: number;
    totalResultsPC?: number;
    first?: number;
    last?: number;
  };
  docs?: PrimoApiDoc[];
  timelog?: Record<string, unknown>;
}

export interface PrimoApiDoc {
  context?: string;
  adaptor?: string;
  ['@id']?: string;
  delivery?: PrimoApiDelivery;
  pnx?: PrimoApiPnx;
}

export interface PrimoApiDelivery {
  bestlocation?: PrimoApiBestLocation | null;
  availability?: string[] | null;
  deliveryCategory?: string[] | null;
  serviceMode?: string[] | null;
  displayedAvailability?: string | null;
  almaInstitutionsList?: PrimoApiInstitutionAvailability[] | null;
}

export interface PrimoApiBestLocation {
  organization?: string | null;
  libraryCode?: string | null;
  availabilityStatus?: string | null;
  mainLocation?: string | null;
  subLocation?: string | null;
  callNumber?: string | null;
}

export interface PrimoApiInstitutionAvailability {
  instCode?: string | null;
  instName?: string | null;
  availabilityStatus?: string | null;
}

export interface PrimoApiPnx {
  display?: Record<string, unknown> | undefined;
  addata?: Record<string, unknown> | undefined;
  control?: Record<string, unknown> | undefined;
}
