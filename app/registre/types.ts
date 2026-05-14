export const GUILD_ID = "mek_dyude";

export const TRANSACTION_TYPES = [
  "credit",
  "dette",
  "loc",
  "paie",
  "enca",
  "correction",
] as const;

export const WRITABLE_TRANSACTION_TYPES = [
  "credit",
  "dette",
  "loc",
  "paie",
  "enca",
] as const;

export const TRANSACTION_STATUSES = [
  "actif",
  "regle",
  "annule",
  "litige",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type WritableTransactionType = (typeof WRITABLE_TRANSACTION_TYPES)[number];
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
export type CounterpartyType = "guild" | "member" | "external";
export type SolarDirection = "in" | "out";

export interface LedgerTransaction {
  id: number;
  guild_id: string;
  type: TransactionType;
  status: TransactionStatus;
  date: string;
  season: string;
  counterparty_type: CounterpartyType;
  counterparty_id: string | null;
  counterparty_name: string;
  resource_name: string;
  resource_qty: number;
  counter_solar: number;
  counter_solar_direction: SolarDirection | null;
  note: string | null;
  original_transaction_id: number | null;
  created_by: string;
  created_at: string;
  sealed_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
}

export interface CounterpartyOption {
  type: CounterpartyType;
  id: string | null;
  name: string;
}

export interface InventoryOption {
  id: number;
  name: string;
  category: string;
  stock: number;
}

export interface CreateTransactionInput {
  type: WritableTransactionType;
  dateText: string;
  season: string;
  counterpartyType: CounterpartyType;
  counterpartyId: string | null;
  counterpartyName: string;
  resourceName: string;
  resourceQty: number | string;
  counterSolar: number | string;
  counterSolarEnabled: boolean;
  note: string | null;
}

export type LedgerActionResult =
  | { ok: true; transactionId?: number; sealedAt?: string }
  | { ok: false; message: string };

export const TYPE_META: Record<
  TransactionType,
  {
    label: string;
    shortLabel: string;
    icon: string;
    color: string;
    tartan: "credit" | "dette" | "loc" | "paie" | "enca" | "neutral";
    resourceDirection: SolarDirection;
    defaultCounterSolar: number;
    counterSolarDirection: SolarDirection;
    initialStatus: TransactionStatus;
    description: string;
    counterLabel: string;
  }
> = {
  credit: {
    label: "Crédit accordé",
    shortLabel: "Crédit",
    icon: "+",
    color: "#3d6e2a",
    tartan: "credit",
    resourceDirection: "out",
    defaultCounterSolar: 0,
    counterSolarDirection: "in",
    initialStatus: "actif",
    description: "Le clan prête ressource ou Solar à un tiers. Sera dû.",
    counterLabel: "Solar reçus en échange",
  },
  dette: {
    label: "Dette",
    shortLabel: "Dette",
    icon: "−",
    color: "#8B1A1A",
    tartan: "dette",
    resourceDirection: "in",
    defaultCounterSolar: 135,
    counterSolarDirection: "in",
    initialStatus: "actif",
    description: "Le clan emprunte. À rembourser lors d'une saison future.",
    counterLabel: "Solar reçus en avance",
  },
  loc: {
    label: "Dépôt en location",
    shortLabel: "Location",
    icon: "◫",
    color: "#A0622A",
    tartan: "loc",
    resourceDirection: "out",
    defaultCounterSolar: 50,
    counterSolarDirection: "in",
    initialStatus: "actif",
    description: "Dépôt d'objet ou ressource confié pour une durée définie.",
    counterLabel: "Solar de garantie",
  },
  paie: {
    label: "Paiement",
    shortLabel: "Paiement",
    icon: "↗",
    color: "#1a3868",
    tartan: "paie",
    resourceDirection: "out",
    defaultCounterSolar: 0,
    counterSolarDirection: "out",
    initialStatus: "regle",
    description: "Sortie immédiate de Solar contre marchandise ou service.",
    counterLabel: "Marchandise reçue",
  },
  enca: {
    label: "Encaissement",
    shortLabel: "Encaissement",
    icon: "↘",
    color: "#2d6e3a",
    tartan: "enca",
    resourceDirection: "in",
    defaultCounterSolar: 0,
    counterSolarDirection: "in",
    initialStatus: "regle",
    description: "Entrée immédiate de Solar suite à vente ou règlement.",
    counterLabel: "Marchandise livrée",
  },
  correction: {
    label: "Correction",
    shortLabel: "Correction",
    icon: "✎",
    color: "#5a3010",
    tartan: "neutral",
    resourceDirection: "in",
    defaultCounterSolar: 0,
    counterSolarDirection: "in",
    initialStatus: "regle",
    description: "Trace d'audit liée à une inscription existante.",
    counterLabel: "Correction",
  },
};

export const STATUS_META: Record<
  TransactionStatus,
  { label: string; color: string }
> = {
  actif: { label: "Actif", color: "#8B1A1A" },
  regle: { label: "Réglé", color: "#3d6e2a" },
  annule: { label: "Annulé", color: "#5a3010" },
  litige: { label: "Litige", color: "#A0622A" },
};

export const SEASON_OPTIONS = [
  { value: "automne_2026", label: "Automne 2026" },
  { value: "ete_2026", label: "Été 2026" },
  { value: "hiver_2026", label: "Hiver 2026" },
  { value: "printemps_2026", label: "Printemps 2026" },
];
