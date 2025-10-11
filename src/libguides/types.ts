export interface LibGuidesConfig {
  siteId: string;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

export interface LibGuidesAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface LibGuidesDatabase {
  id: number;
  name: string;
  alt_names?: string[];
  description?: string;
  url?: string;
  subjects?: Array<{ id: number; name: string }>;
  types?: Array<{ id: number; name: string }>;
  vendors?: Array<{ id: number; name: string }>;
  enable_proxy?: boolean;
}

export interface LibGuidesDatabaseSearchResult {
  databases: LibGuidesDatabase[];
  total: number;
}

export interface DatabaseSearchInput {
  search?: string;
  subject?: string;
  type?: string;
  limit?: number;
}

// Guide content types
export interface LibGuidesGuide {
  id: number;
  name: string;
  description?: string;
  url?: string;
  friendly_url?: string;
  type_id: number;
  status: number;
  published?: string;
  pages?: LibGuidesPage[];
}

export interface LibGuidesPage {
  id: number;
  guide_id: number;
  name: string;
  url?: string;
  boxes?: LibGuidesBox[];
}

export interface LibGuidesBox {
  id: number;
  page_id: number;
  box_type: string;
  title?: string;
  body?: string;
  content?: string;
}

export interface GuideSearchInput {
  search?: string;
  guideId?: string;
  expand?: string; // e.g., "pages.boxes"
  limit?: number;
  fullTextSearch?: boolean; // If true, uses sort_by=relevance for full-text search
}

export interface GuideSearchResult {
  guides: LibGuidesGuide[];
  total: number;
}
