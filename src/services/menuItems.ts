import { getJSON } from './http';

export type PriceUnit = 'flat' | 'per_person' | 'per_unit' | string;

export interface MenuItem {
  id: string;
  name: string;
  category_id: string | null;
  description: string | null;
  base_price: number | null;
  price_unit: PriceUnit | null;
  is_active: boolean;
}

export interface MenuItemRule {
  rule_type: string;
  value: string;
}

export interface MenuItemSoftRule {
  id: string;
  label: string;
  content: string;
  is_customer_visible: boolean;
  sort_order: number;
}

export interface VariantOption {
  id: string;
  name: string;
  price: number | null;
  price_unit: PriceUnit | null;
  sort_order: number;
}

export interface VariantGroup {
  id: string;
  name: string;
  pricing_mode: string;
  sort_order: number;
  options: VariantOption[];
}

export interface AttachedModifierGroup {
  id: string;
  name: string;
  min_selections: number;
  max_selections: number;
  sort_order: number;
  options: VariantOption[];
}

export interface ExternalProviderMapping {
  provider_key: string;
  provider_name: string;
  external_item_key: string;
  is_active: boolean;
}

export interface MenuItemDetail extends MenuItem {
  sku: string | null;
  serving_description: string | null;
  dietary_tags: string | null;
  allergens: string | null;
  rules: MenuItemRule[];
  soft_rules: MenuItemSoftRule[];
  variant_groups: VariantGroup[];
  modifier_groups: AttachedModifierGroup[];
  external_provider_mappings: ExternalProviderMapping[];
}

export interface ListMenuItemsResult {
  items: MenuItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListMenuItemsInput {
  limit?: number;
  offset?: number;
  is_active?: boolean;
  category_id?: string;
  search?: string;
}

export interface Category {
  id: string;
  name: string;
  sort_order: number;
}

function normalizeString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim();
  return normalized || fallback;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

function normalizeNonNegativeInt(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return fallback;
  }
  return value;
}

function normalizeMenuItem(value: unknown): MenuItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = normalizeString(record['id']);
  const name = normalizeString(record['name']);

  if (!id || !name) {
    return null;
  }

  const basePrice =
    typeof record['base_price'] === 'number' && Number.isInteger(record['base_price'])
      ? record['base_price']
      : null;

  return {
    id,
    name,
    category_id: normalizeOptionalString(record['category_id']),
    description: normalizeOptionalString(record['description']),
    base_price: basePrice,
    price_unit: normalizeOptionalString(record['price_unit']),
    is_active: record['is_active'] !== false,
  };
}

function normalizeMenuItemRule(value: unknown): MenuItemRule | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const ruleType = normalizeString(record['rule_type']);
  const ruleValue = normalizeString(record['value']);
  if (!ruleType || !ruleValue) {
    return null;
  }
  return {
    rule_type: ruleType,
    value: ruleValue,
  };
}

function normalizeMenuItemSoftRule(value: unknown): MenuItemSoftRule | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = normalizeString(record['id']);
  if (!id) {
    return null;
  }
  return {
    id,
    label: normalizeString(record['label']),
    content: normalizeString(record['content']),
    is_customer_visible: record['is_customer_visible'] === true,
    sort_order: normalizeNonNegativeInt(record['sort_order'], 0),
  };
}

function normalizeVariantOption(value: unknown): VariantOption | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = normalizeString(record['id']);
  const name = normalizeString(record['name']);
  if (!id || !name) {
    return null;
  }
  const price =
    typeof record['price'] === 'number' && Number.isInteger(record['price'])
      ? record['price']
      : null;
  return {
    id,
    name,
    price,
    price_unit: normalizeOptionalString(record['price_unit']),
    sort_order: normalizeNonNegativeInt(record['sort_order'], 0),
  };
}

function normalizeVariantGroup(value: unknown): VariantGroup | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = normalizeString(record['id']);
  const name = normalizeString(record['name']);
  if (!id || !name) {
    return null;
  }
  const optionsRaw = Array.isArray(record['options']) ? record['options'] : [];
  const options = optionsRaw
    .map((option) => normalizeVariantOption(option))
    .filter((option): option is VariantOption => option !== null);
  return {
    id,
    name,
    pricing_mode: normalizeString(record['pricing_mode']),
    sort_order: normalizeNonNegativeInt(record['sort_order'], 0),
    options,
  };
}

function normalizeAttachedModifierGroup(value: unknown): AttachedModifierGroup | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = normalizeString(record['id']);
  const name = normalizeString(record['name']);
  if (!id || !name) {
    return null;
  }
  const optionsRaw = Array.isArray(record['options']) ? record['options'] : [];
  const options = optionsRaw
    .map((option) => normalizeVariantOption(option))
    .filter((option): option is VariantOption => option !== null);
  return {
    id,
    name,
    min_selections: normalizeNonNegativeInt(record['min_selections'], 0),
    max_selections: normalizeNonNegativeInt(record['max_selections'], 0),
    sort_order: normalizeNonNegativeInt(record['sort_order'], 0),
    options,
  };
}

function normalizeExternalProviderMapping(value: unknown): ExternalProviderMapping | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const providerKey = normalizeString(record['provider_key']);
  const providerName = normalizeString(record['provider_name']);
  const externalItemKey = normalizeString(record['external_item_key']);
  if (!providerKey || !providerName || !externalItemKey) {
    return null;
  }
  return {
    provider_key: providerKey,
    provider_name: providerName,
    external_item_key: externalItemKey,
    is_active: record['is_active'] === true,
  };
}

function normalizeMenuItemDetail(value: unknown): MenuItemDetail | null {
  const base = normalizeMenuItem(value);
  if (!base || !value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const rulesRaw = Array.isArray(record['rules']) ? record['rules'] : [];
  const rules = rulesRaw
    .map((entry) => normalizeMenuItemRule(entry))
    .filter((entry): entry is MenuItemRule => entry !== null);
  const softRulesRaw = Array.isArray(record['soft_rules']) ? record['soft_rules'] : [];
  const softRules = softRulesRaw
    .map((entry) => normalizeMenuItemSoftRule(entry))
    .filter((entry): entry is MenuItemSoftRule => entry !== null);
  const variantGroupsRaw = Array.isArray(record['variant_groups']) ? record['variant_groups'] : [];
  const variantGroups = variantGroupsRaw
    .map((entry) => normalizeVariantGroup(entry))
    .filter((entry): entry is VariantGroup => entry !== null);
  const modifierGroupsRaw = Array.isArray(record['modifier_groups'])
    ? record['modifier_groups']
    : [];
  const modifierGroups = modifierGroupsRaw
    .map((entry) => normalizeAttachedModifierGroup(entry))
    .filter((entry): entry is AttachedModifierGroup => entry !== null);
  const externalProviderMappingsRaw = Array.isArray(record['external_provider_mappings'])
    ? record['external_provider_mappings']
    : [];
  const externalProviderMappings = externalProviderMappingsRaw
    .map((entry) => normalizeExternalProviderMapping(entry))
    .filter((entry): entry is ExternalProviderMapping => entry !== null);

  return {
    ...base,
    sku: normalizeOptionalString(record['sku']),
    serving_description: normalizeOptionalString(record['serving_description']),
    dietary_tags: normalizeOptionalString(record['dietary_tags']),
    allergens: normalizeOptionalString(record['allergens']),
    rules,
    soft_rules: softRules,
    variant_groups: variantGroups,
    modifier_groups: modifierGroups,
    external_provider_mappings: externalProviderMappings,
  };
}

function normalizeMenuItemDetailPayload(payload: unknown): MenuItemDetail | null {
  const direct = normalizeMenuItemDetail(payload);
  if (direct) {
    return direct;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const keys = ['item', 'menu_item', 'data'];
  for (const key of keys) {
    const normalized = normalizeMenuItemDetail(record[key]);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function normalizeMenuItemList(payload: unknown, fallbackLimit: number): ListMenuItemsResult {
  if (!payload || typeof payload !== 'object') {
    return { items: [], total: 0, limit: fallbackLimit, offset: 0 };
  }

  const record = payload as Record<string, unknown>;
  const rawItems = Array.isArray(record['items']) ? record['items'] : [];
  const items: MenuItem[] = [];

  for (const entry of rawItems) {
    const normalized = normalizeMenuItem(entry);
    if (normalized) {
      items.push(normalized);
    }
  }

  return {
    items,
    total: normalizeNonNegativeInt(record['total'], items.length),
    limit: normalizeNonNegativeInt(record['limit'], fallbackLimit),
    offset: normalizeNonNegativeInt(record['offset'], 0),
  };
}

function buildListMenuItemsUrl(input?: ListMenuItemsInput): string {
  const params = new URLSearchParams();

  if (typeof input?.limit === 'number' && Number.isInteger(input.limit) && input.limit > 0) {
    params.set('limit', String(input.limit));
  }
  if (typeof input?.offset === 'number' && Number.isInteger(input.offset) && input.offset >= 0) {
    params.set('offset', String(input.offset));
  }
  if (typeof input?.is_active === 'boolean') {
    params.set('is_active', String(input.is_active));
  }
  if (typeof input?.category_id === 'string' && input.category_id.trim()) {
    params.set('category_id', input.category_id.trim());
  }
  if (typeof input?.search === 'string' && input.search.trim()) {
    params.set('search', input.search.trim());
  }

  const query = params.toString();
  return query ? `/menu-items?${query}` : '/menu-items';
}

function normalizeCategory(value: unknown): Category | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = normalizeString(record['id']);
  const name = normalizeString(record['name']);
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    sort_order: normalizeNonNegativeInt(record['sort_order'], 0),
  };
}

function normalizeCategories(payload: unknown): Category[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const categories: Category[] = [];
  const seen = new Set<string>();

  for (const entry of payload) {
    const normalized = normalizeCategory(entry);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    categories.push(normalized);
  }

  return categories;
}

export async function listMenuItems(input?: ListMenuItemsInput): Promise<ListMenuItemsResult> {
  const fallbackLimit =
    typeof input?.limit === 'number' && Number.isInteger(input.limit) && input.limit > 0
      ? input.limit
      : 50;
  const payload = await getJSON<unknown>(buildListMenuItemsUrl(input));
  return normalizeMenuItemList(payload, fallbackLimit);
}

export async function listCategories(): Promise<Category[]> {
  const payload = await getJSON<unknown>('/categories');
  return normalizeCategories(payload);
}

export async function getMenuItemById(menuItemID: string): Promise<MenuItemDetail | null> {
  const payload = await getJSON<unknown>(`/menu-items/${menuItemID}`);
  return normalizeMenuItemDetailPayload(payload);
}
