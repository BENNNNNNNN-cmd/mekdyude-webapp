"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cancelTransaction,
  createCorrectionTransaction,
  settleTransaction,
} from "./actions";
import InscrireFlow from "./InscrireFlow";
import {
  STATUS_META,
  TYPE_META,
  type CounterpartyOption,
  type InventoryOption,
  type LedgerActionResult,
  type LedgerTransaction,
  type TransactionType,
} from "./types";
import { Banner, GhostButton, PrimaryButton } from "@/app/components/v3/Banner";
import { Badge, OutlinedBadge } from "@/app/components/v3/Badge";
import { DatePlaque } from "@/app/components/v3/DatePlaque";
import { DayHeader } from "@/app/components/v3/DayHeader";
import { Folio, FolioFooter } from "@/app/components/v3/Folio";
import { StonePlaque, StonePlaqueGrid } from "@/app/components/v3/StonePlaque";
import { TartanStripe } from "@/app/components/v3/TartanStripe";
import { WaxSeal } from "@/app/components/v3/WaxSeal";

const FILTERS = [
  { id: "all", label: "Tous" },
  { id: "credit", label: "Crédits" },
  { id: "dette", label: "Dettes" },
  { id: "loc", label: "Locations" },
  { id: "paie", label: "Paiements" },
] as const;

const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Août", "Sep", "Oct", "Nov", "Déc"];

interface RegistreClientProps {
  initialTransactions: LedgerTransaction[];
  counterparties: CounterpartyOption[];
  inventory: InventoryOption[];
  currentUser: string;
  canWrite: boolean;
  seasonLabel: string;
  defaultSeason: string;
}

type FilterId = (typeof FILTERS)[number]["id"];
type Toast = { type: "success" | "error"; message: string } | null;

function isSolar(resourceName: string) {
  return resourceName.toLocaleLowerCase("fr-CA") === "solar";
}

function signedSolarDelta(transaction: LedgerTransaction) {
  if (transaction.status === "annule" || transaction.type === "correction") {
    return 0;
  }

  const meta = TYPE_META[transaction.type];
  let total = 0;
  if (isSolar(transaction.resource_name)) {
    total +=
      meta.resourceDirection === "in"
        ? transaction.resource_qty
        : -transaction.resource_qty;
  }
  if (transaction.counter_solar_direction === "in") {
    total += transaction.counter_solar;
  }
  if (transaction.counter_solar_direction === "out") {
    total -= transaction.counter_solar;
  }
  return total;
}

function principalSolar(transaction: LedgerTransaction) {
  if (isSolar(transaction.resource_name)) return transaction.resource_qty;
  return transaction.counter_solar;
}

function formatSigned(value: number) {
  if (value > 0) return `+${value.toLocaleString("fr-CA")}`;
  if (value < 0) return `−${Math.abs(value).toLocaleString("fr-CA")}`;
  return "0";
}

function splitDate(dateText: string) {
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return { day: "—", month: "", year: "" };
  }
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: MONTHS[date.getMonth()],
    year: String(date.getFullYear()),
  };
}

function statusColor(status: LedgerTransaction["status"]) {
  return STATUS_META[status]?.color ?? "#5a3010";
}

function rowAmount(transaction: LedgerTransaction) {
  if (transaction.type === "correction") {
    return { value: "0", sign: 0, unit: "Audit" };
  }

  if (transaction.type === "loc") {
    return { value: `×${transaction.resource_qty}`, sign: 0, unit: transaction.resource_name };
  }

  const sign = TYPE_META[transaction.type].resourceDirection === "in" ? 1 : -1;
  return {
    value: `${sign > 0 ? "+" : "−"}${transaction.resource_qty.toLocaleString("fr-CA")}`,
    sign,
    unit: transaction.resource_name,
  };
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("fr-CA");
}

function formatLastSaved(transactions: LedgerTransaction[]) {
  const latest = transactions[0]?.sealed_at;
  if (!latest) return "Aucune inscription scellée";
  const date = new Date(`${latest}${latest.endsWith("Z") ? "" : "Z"}`);
  if (Number.isNaN(date.getTime())) return "Sauvegardé";
  return `Sauvegardé · ${date.toLocaleDateString("fr-CA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

export default function RegistreClient({
  initialTransactions,
  counterparties,
  inventory,
  currentUser,
  canWrite,
  seasonLabel,
  defaultSeason,
}: RegistreClientProps) {
  const router = useRouter();
  const [transactions, setTransactions] = useState(initialTransactions);
  const [mode, setMode] = useState<"registre" | "inscrire">("registre");
  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    setTransactions(initialTransactions);
  }, [initialTransactions]);

  const stats = useMemo(() => {
    const solar = inventory.find((item) => isSolar(item.name))?.stock ?? 0;
    const activeCredits = transactions.filter(
      (tx) => tx.type === "credit" && tx.status === "actif"
    );
    const activeDebts = transactions.filter(
      (tx) => tx.type === "dette" && tx.status === "actif"
    );
    const activeLocations = transactions.filter(
      (tx) => tx.type === "loc" && tx.status === "actif"
    );
    return {
      solar,
      activeCreditSolar: activeCredits.reduce((sum, tx) => sum + principalSolar(tx), 0),
      activeCreditCount: activeCredits.length,
      activeDebtSolar: activeDebts.reduce((sum, tx) => sum + principalSolar(tx), 0),
      activeDebtCount: activeDebts.length,
      activeLocationCount: activeLocations.length,
      netSolar: transactions.reduce((sum, tx) => sum + signedSolarDelta(tx), 0),
    };
  }, [inventory, transactions]);

  const filteredTransactions = useMemo(() => {
    const q = normalizeSearch(search);
    return transactions.filter((transaction) => {
      const matchesFilter =
        filter === "all" ||
        transaction.type === filter ||
        (filter === "paie" && transaction.type === "enca");
      const matchesSearch =
        q.length === 0 ||
        [
          transaction.counterparty_name,
          transaction.resource_name,
          transaction.note,
          transaction.created_by,
          TYPE_META[transaction.type].label,
        ]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase("fr-CA").includes(q));
      return matchesFilter && matchesSearch;
    });
  }, [filter, search, transactions]);

  const runAction = async (
    transactionId: number,
    action: () => Promise<LedgerActionResult>,
    successMessage: string
  ) => {
    setPending(transactionId);
    setToast(null);
    try {
      const result = await action();
      if (!result.ok) {
        setToast({ type: "error", message: result.message });
        return;
      }
      setToast({ type: "success", message: successMessage });
      router.refresh();
    } catch {
      setToast({ type: "error", message: "Erreur de registre. Veuillez réessayer." });
    } finally {
      setPending(null);
    }
  };

  const handleSettle = (transaction: LedgerTransaction) => {
    runAction(
      transaction.id,
      () => settleTransaction(transaction.id),
      `Transaction #${transaction.id} réglée.`
    );
  };

  const handleCorrection = (transaction: LedgerTransaction) => {
    const note = window.prompt(
      `Note de correction pour l'inscription #${transaction.id}`
    );
    if (note == null) return;
    runAction(
      transaction.id,
      () => createCorrectionTransaction(transaction.id, note),
      `Correction ajoutée pour l'inscription #${transaction.id}.`
    );
  };

  const handleCancel = (transaction: LedgerTransaction) => {
    const reason = window.prompt(
      `Motif d'annulation pour l'inscription #${transaction.id}`
    );
    if (reason == null) return;
    runAction(
      transaction.id,
      () => cancelTransaction(transaction.id, reason),
      `Transaction #${transaction.id} annulée avec trace de correction.`
    );
  };

  if (mode === "inscrire") {
    return (
      <InscrireFlow
        counterparties={counterparties}
        inventory={inventory}
        currentUser={currentUser}
        defaultSeason={defaultSeason}
        canWrite={canWrite}
        onClose={() => setMode("registre")}
        onDone={() => {
          setToast({ type: "success", message: "Inscription scellée au registre." });
          router.refresh();
        }}
      />
    );
  }

  return (
    <>
      <Banner
        title="Registre du Clan"
        sub={`${seasonLabel} · ${transactions.length} inscription${
          transactions.length !== 1 ? "s" : ""
        } · Tenu par ${currentUser}`}
        actions={
          <>
            <GhostButton type="button">↓ Folio PDF</GhostButton>
            <PrimaryButton
              type="button"
              onClick={() => setMode("inscrire")}
              disabled={!canWrite}
              style={{ opacity: canWrite ? 1 : 0.5 }}
            >
              † Inscrire
            </PrimaryButton>
          </>
        }
      />

      <StonePlaqueGrid cols={4}>
        <StonePlaque
          label="Solar au coffre"
          value={stats.solar.toLocaleString("fr-CA")}
          sub={`${formatSigned(stats.netSolar)} Solar au registre`}
          valueColor="#f4ead2"
        />
        <StonePlaque
          label="Crédits actifs"
          value={`+${stats.activeCreditSolar.toLocaleString("fr-CA")}`}
          sub={`${stats.activeCreditCount} débiteur${
            stats.activeCreditCount !== 1 ? "s" : ""
          }`}
          valueColor="#7fb15c"
        />
        <StonePlaque
          label="Dettes actives"
          value={`−${stats.activeDebtSolar.toLocaleString("fr-CA")}`}
          sub={`${stats.activeDebtCount} créancier${
            stats.activeDebtCount !== 1 ? "s" : ""
          }`}
          valueColor="#c84040"
        />
        <StonePlaque
          label="Locations"
          value={stats.activeLocationCount}
          sub="en cours"
          valueColor="#c8842a"
        />
      </StonePlaqueGrid>

      {toast && (
        <div
          className="mb-3 px-4 py-3 text-sm italic"
          style={{
            background:
              toast.type === "success"
                ? "rgba(61,110,42,0.16)"
                : "rgba(139,32,32,0.15)",
            border: `1px solid ${toast.type === "success" ? "#3d6e2a" : "#8B1A1A"}`,
            color: "#f4ead2",
          }}
        >
          {toast.type === "success" ? "✓" : "⚠"} {toast.message}
        </div>
      )}

      <div
        className="flex flex-wrap items-center gap-2.5 px-4 py-3"
        style={{
          background: "linear-gradient(180deg, #2a1a08, #1a0e05)",
          border: "2px solid #4a2810",
          borderBottom: "none",
        }}
      >
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-body-soft pointer-events-none">
            ⌕
          </span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher dans le registre…"
            className="font-serif-body text-sm outline-none"
            style={{
              width: 320,
              padding: "8px 12px 8px 32px",
              background: "#0c0703",
              border: "1px solid rgba(160,98,42,0.4)",
              color: "#f4ead2",
            }}
          />
        </div>
        {FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className="font-serif text-[11px] font-bold uppercase px-3 py-2 cursor-pointer"
              style={{
                letterSpacing: "0.14em",
                border: `1px solid ${
                  active ? "#c8842a" : "rgba(160,98,42,0.3)"
                }`,
                background: active
                  ? "linear-gradient(180deg, #A0622A, #6e3e10)"
                  : "transparent",
                color: active ? "#f4ead2" : "rgba(244,234,210,0.5)",
                boxShadow: active
                  ? "inset 0 1px 0 rgba(255,255,255,0.15)"
                  : "none",
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <Folio className="border-t-0 overflow-x-auto">
        <DayHeader
          label="Cette semaine"
          meta={`Solde net · ${formatSigned(stats.netSolar)} Solar`}
          className="border-t-0"
        />

        {filteredTransactions.length === 0 ? (
          <div className="px-6 py-14 text-center text-parch-muted">
            <div className="mb-2 font-serif text-4xl text-gold/40">◫</div>
            <p className="text-base italic">
              Aucune inscription ne correspond au registre courant.
            </p>
          </div>
        ) : (
          <div className="min-w-[960px]">
            {filteredTransactions.map((transaction, index) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                alt={index % 2 === 1}
                canWrite={canWrite}
                pending={pending === transaction.id}
                onSettle={() => handleSettle(transaction)}
                onCorrection={() => handleCorrection(transaction)}
                onCancel={() => handleCancel(transaction)}
              />
            ))}
          </div>
        )}

        <FolioFooter className="flex items-center justify-between font-serif uppercase not-italic">
          <span>
            {filteredTransactions.length} inscription
            {filteredTransactions.length !== 1 ? "s" : ""} affichée
            {filteredTransactions.length !== 1 ? "s" : ""} ·{" "}
            {Math.max(0, transactions.length - filteredTransactions.length)} archivée
            {transactions.length - filteredTransactions.length !== 1 ? "s" : ""}
          </span>
          <span>⚜ {formatLastSaved(transactions)} ⚜</span>
        </FolioFooter>
      </Folio>
    </>
  );
}

function TransactionRow({
  transaction,
  alt,
  canWrite,
  pending,
  onSettle,
  onCorrection,
  onCancel,
}: {
  transaction: LedgerTransaction;
  alt: boolean;
  canWrite: boolean;
  pending: boolean;
  onSettle: () => void;
  onCorrection: () => void;
  onCancel: () => void;
}) {
  const meta = TYPE_META[transaction.type];
  const amount = rowAmount(transaction);
  const date = splitDate(transaction.date);
  const disabled = pending || !canWrite;
  const canCancel =
    transaction.type !== "correction" && transaction.status !== "annule";
  const canCorrect = transaction.type !== "correction";

  return (
    <div
      className="grid min-h-[86px]"
      style={{
        gridTemplateColumns: "108px 4px minmax(0,1fr) 130px 4px 130px",
        borderBottom: "1px solid rgba(139,32,32,0.18)",
        background: alt ? "rgba(160,98,42,0.05)" : "transparent",
        opacity: transaction.status === "annule" ? 0.72 : 1,
      }}
    >
      <DatePlaque day={date.day} month={date.month} year={date.year} />
      <TartanStripe kind={meta.tartan} />
      <div className="flex min-w-0 flex-col justify-center px-4.5 py-3.5">
        <div className="mb-1 flex flex-wrap items-center gap-2.5">
          <Badge color={meta.color}>{meta.label}</Badge>
          <OutlinedBadge color={statusColor(transaction.status)}>
            {STATUS_META[transaction.status]?.label ?? transaction.status}
          </OutlinedBadge>
          {transaction.original_transaction_id && (
            <OutlinedBadge color="#5a3010">
              Réf #{transaction.original_transaction_id}
            </OutlinedBadge>
          )}
        </div>
        <div
          className="truncate font-serif text-[17px] font-semibold text-parch-ink"
          style={{ letterSpacing: "0.02em" }}
        >
          {transaction.counterparty_name}
        </div>
        <div className="mt-0.5 line-clamp-2 text-sm italic leading-5 text-parch-ink-soft">
          {transaction.note || "Aucune note de campement."}
          {transaction.cancellation_reason
            ? ` · Annulation: ${transaction.cancellation_reason}`
            : ""}
        </div>
      </div>
      <div
        className="flex flex-col items-end justify-center px-4 py-3.5"
        style={{ borderRight: "1px solid rgba(139,32,32,0.12)" }}
      >
        <div
          className="font-serif text-2xl font-extrabold tabular-nums leading-none"
          style={{
            color:
              amount.sign > 0
                ? "#3d6e2a"
                : amount.sign < 0
                  ? "#8B1A1A"
                  : "#5a3010",
            textShadow: "0 1px 0 rgba(244,234,210,0.5)",
          }}
        >
          {amount.value}
        </div>
        <div
          className="mt-1.5 font-serif text-[11px] uppercase text-parch-muted"
          style={{ letterSpacing: "0.16em" }}
        >
          {amount.unit}
        </div>
      </div>
      <TartanStripe kind={meta.tartan} />
      <div className="flex flex-wrap items-center justify-center gap-1.5 px-3 py-3">
        {transaction.status === "actif" && (
          <WaxSeal
            intent="confirm"
            size={36}
            title="Régler"
            disabled={disabled}
            onClick={onSettle}
            style={{ opacity: disabled ? 0.45 : 1 }}
          >
            {pending ? "…" : "✓"}
          </WaxSeal>
        )}
        <WaxSeal
          intent="neutral"
          size={36}
          title="Corriger"
          disabled={disabled || !canCorrect}
          onClick={onCorrection}
          style={{ opacity: disabled || !canCorrect ? 0.45 : 1 }}
        >
          ✎
        </WaxSeal>
        <WaxSeal
          intent="destroy"
          size={36}
          title="Annuler"
          disabled={disabled || !canCancel}
          onClick={onCancel}
          style={{ opacity: disabled || !canCancel ? 0.45 : 1 }}
        >
          ↶
        </WaxSeal>
      </div>
    </div>
  );
}
