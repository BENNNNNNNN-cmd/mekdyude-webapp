"use client";

import { useMemo, useState } from "react";
import { createTransaction } from "./actions";
import {
  SEASON_OPTIONS,
  TYPE_META,
  WRITABLE_TRANSACTION_TYPES,
  type CounterpartyOption,
  type CreateTransactionInput,
  type InventoryOption,
  type WritableTransactionType,
} from "./types";
import { Badge } from "@/app/components/v3/Badge";
import { Folio } from "@/app/components/v3/Folio";
import { TartanStripe } from "@/app/components/v3/TartanStripe";

const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Août", "Sep", "Oct", "Nov", "Déc"];

interface FlowForm {
  type: WritableTransactionType | "";
  counterpartyKey: string;
  externalCounterparty: string;
  resourceName: string;
  qty: string;
  counterOn: boolean;
  counterAmount: string;
  dateText: string;
  season: string;
  note: string;
}

interface InscrireFlowProps {
  counterparties: CounterpartyOption[];
  inventory: InventoryOption[];
  currentUser: string;
  defaultSeason: string;
  canWrite: boolean;
  onClose: () => void;
  onDone: () => void;
}

function formatDate(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")} ${
    MONTHS[date.getMonth()]
  } ${date.getFullYear()}`;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function counterpartyKey(option: CounterpartyOption) {
  return `${option.type}:${option.id ?? ""}`;
}

function splitCounterpartyKey(key: string, counterparties: CounterpartyOption[]) {
  if (key === "__external") return null;
  return counterparties.find((option) => counterpartyKey(option) === key) ?? null;
}

function toRoman(value: number) {
  const pairs: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = value;
  let out = "";
  for (const [n, roman] of pairs) {
    while (remaining >= n) {
      out += roman;
      remaining -= n;
    }
  }
  return out;
}

function sealDate(value: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "SCELLÉ";
  return `${String(date.getDate()).padStart(2, "0")}·${
    MONTHS[date.getMonth()].toUpperCase()
  }·${toRoman(date.getFullYear())}`;
}

function dateParts(dateText: string) {
  const parts = dateText.trim().split(/\s+/);
  return {
    day: parts[0] || "—",
    month: parts[1] || "",
    year: parts[2] || "",
  };
}

function primaryStyle(color = "#c8242a"): React.CSSProperties {
  return {
    background: `linear-gradient(180deg, ${color}, #6e1414)`,
    border: "2px solid #4a0a0a",
    color: "#f4ead2",
    letterSpacing: "0.2em",
    clipPath: "polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -2px 0 rgba(0,0,0,0.3), 0 3px 8px rgba(0,0,0,0.5)",
  };
}

function fieldStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: "100%",
    background: "rgba(244,234,210,0.7)",
    border: "1px solid rgba(74,40,16,0.4)",
    borderBottom: "2px solid #4a2810",
    color: "#1a1008",
    outline: "none",
    fontFamily: "var(--font-serif-body)",
    fontSize: 16,
    padding: "10px 12px",
    ...extra,
  };
}

function defaultResourceForType(
  type: WritableTransactionType | "",
  inventory: InventoryOption[],
  current: string
) {
  const currentStillExists = inventory.some((item) => item.name === current);
  if (currentStillExists && type !== "paie" && type !== "enca") return current;

  const solar = inventory.find(
    (item) => item.name.toLocaleLowerCase("fr-CA") === "solar"
  );
  if ((type === "paie" || type === "enca") && solar) return solar.name;

  const nonSolar = inventory.find(
    (item) => item.name.toLocaleLowerCase("fr-CA") !== "solar"
  );
  return nonSolar?.name ?? solar?.name ?? "";
}

function StepRail({
  step,
  onJump,
}: {
  step: 1 | 2 | 3;
  onJump: (step: 1 | 2 | 3) => void;
}) {
  const items: Array<{ step: 1 | 2 | 3; label: string }> = [
    { step: 1, label: "Type d'inscription" },
    { step: 2, label: "Détails" },
    { step: 3, label: "Sceller" },
  ];

  return (
    <div
      className="flex items-center mb-5 px-5 py-3"
      style={{
        background: "linear-gradient(180deg, #2a1a08, #1a0e05)",
        border: "2px solid #4a2810",
      }}
    >
      {items.map((item, idx) => {
        const state =
          step === item.step ? "active" : step > item.step ? "done" : "idle";
        const clickable = state === "done";
        return (
          <div key={item.step} className="contents">
            <button
              type="button"
              onClick={() => clickable && onJump(item.step)}
              disabled={!clickable}
              className="flex items-center gap-2.5 px-3 py-1 font-serif text-xs font-bold uppercase disabled:cursor-default"
              style={{
                letterSpacing: "0.18em",
                color:
                  state === "done"
                    ? "#7fb15c"
                    : state === "active"
                      ? "#f4ead2"
                      : "rgba(244,234,210,0.35)",
              }}
            >
              <span
                className="inline-flex items-center justify-center w-[30px] h-[30px] font-serif text-[13px] font-extrabold"
                style={{
                  border:
                    state === "done"
                      ? "2px solid #3d6e2a"
                      : state === "active"
                        ? "2px solid #c8842a"
                        : "2px solid #4a2810",
                  background:
                    state === "done"
                      ? "#3d6e2a"
                      : state === "active"
                        ? "linear-gradient(180deg, #A0622A, #6e3e10)"
                        : "transparent",
                  color:
                    state === "done" || state === "active"
                      ? "#f4ead2"
                      : "rgba(244,234,210,0.35)",
                  boxShadow:
                    state === "active"
                      ? "inset 0 1px 0 rgba(255,255,255,0.15), 0 0 12px rgba(200,132,42,0.5)"
                      : "none",
                }}
              >
                {state === "done" ? "✓" : item.step}
              </span>
              <span>{item.label}</span>
            </button>
            {idx < items.length - 1 && (
              <div
                className="flex-1 h-0.5 mx-1.5"
                style={{
                  background:
                    step > item.step
                      ? "repeating-linear-gradient(90deg, #3d6e2a 0 6px, transparent 6px 10px)"
                      : "repeating-linear-gradient(90deg, #8B1A1A 0 6px, transparent 6px 10px)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FlowHeader({
  step,
  title,
  type,
}: {
  step: string;
  title: string;
  type?: WritableTransactionType | "";
}) {
  const meta = type ? TYPE_META[type] : null;
  return (
    <div
      className="flex items-center justify-between px-6 py-4"
      style={{
        background:
          "linear-gradient(180deg, rgba(160,98,42,0.18), rgba(160,98,42,0.08))",
        borderBottom: "2px solid #8B1A1A",
      }}
    >
      <div>
        <div
          className="font-serif text-[11px] font-extrabold uppercase text-parch-muted"
          style={{ letterSpacing: "0.26em" }}
        >
          ❦ {step} ❦
        </div>
        <div
          className="mt-1 font-serif text-xl font-bold text-parch-ink"
          style={{ letterSpacing: "0.06em" }}
        >
          {title}
        </div>
      </div>
      {meta && (
        <Badge color={meta.color} className="text-[11px] px-3.5 py-1.5">
          {meta.icon} {meta.shortLabel}
        </Badge>
      )}
    </div>
  );
}

export default function InscrireFlow({
  counterparties,
  inventory,
  currentUser,
  defaultSeason,
  canWrite,
  onClose,
  onDone,
}: InscrireFlowProps) {
  const initialCounterpartyKey =
    counterparties[0] ? counterpartyKey(counterparties[0]) : "__external";
  const initialResource = defaultResourceForType("", inventory, "");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sealing, setSealing] = useState(false);
  const [done, setDone] = useState(false);
  const [sealedAt, setSealedAt] = useState<string | null>(null);
  const [sealedFolio, setSealedFolio] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FlowForm>({
    type: "",
    counterpartyKey: initialCounterpartyKey,
    externalCounterparty: "",
    resourceName: initialResource,
    qty: "1",
    counterOn: false,
    counterAmount: "0",
    dateText: formatDate(new Date()),
    season: defaultSeason,
    note: "",
  });

  const selectedType = form.type ? TYPE_META[form.type] : null;
  const selectedCounterparty = splitCounterpartyKey(
    form.counterpartyKey,
    counterparties
  );
  const counterpartyName =
    form.counterpartyKey === "__external"
      ? form.externalCounterparty.trim()
      : selectedCounterparty?.name ?? "";
  const selectedResource = inventory.find((item) => item.name === form.resourceName);
  const solar = inventory.find(
    (item) => item.name.toLocaleLowerCase("fr-CA") === "solar"
  );
  const qty = Number(form.qty);
  const counterSolar = form.counterOn ? Number(form.counterAmount) || 0 : 0;
  const resourceIsSolar =
    selectedResource?.name.toLocaleLowerCase("fr-CA") === "solar";
  const overStock =
    !!selectedType &&
    !!selectedResource &&
    selectedType.resourceDirection === "out" &&
    Number.isFinite(qty) &&
    qty > selectedResource.stock;
  const canContinueStep2 =
    !!form.type &&
    !!counterpartyName &&
    !!selectedResource &&
    Number.isInteger(qty) &&
    qty > 0 &&
    !overStock &&
    canWrite;

  const resourceGroups = useMemo(
    () => ({
      ressources: inventory.filter((item) => item.category === "ressource"),
      objets: inventory.filter((item) => item.category === "objet"),
    }),
    [inventory]
  );

  const effectSummary = useMemo(() => {
    if (!selectedType || !selectedResource || !Number.isFinite(qty)) return "—";
    const resourceDelta =
      selectedType.resourceDirection === "in" ? qty : -qty;
    const effects = [
      `${selectedResource.name} ${selectedResource.stock.toLocaleString("fr-CA")} → ${(
        selectedResource.stock + resourceDelta
      ).toLocaleString("fr-CA")}`,
    ];
    if (counterSolar > 0 && solar && !resourceIsSolar) {
      const solarDelta =
        selectedType.counterSolarDirection === "in" ? counterSolar : -counterSolar;
      effects.push(
        `Solar ${solar.stock.toLocaleString("fr-CA")} → ${(
          solar.stock + solarDelta
        ).toLocaleString("fr-CA")}`
      );
    }
    return effects.join(" · ");
  }, [counterSolar, qty, resourceIsSolar, selectedResource, selectedType, solar]);

  const chooseType = (type: WritableTransactionType) => {
    const meta = TYPE_META[type];
    const nextResource = defaultResourceForType(type, inventory, form.resourceName);
    const nextResourceIsSolar =
      nextResource.toLocaleLowerCase("fr-CA") === "solar";
    setForm((current) => ({
      ...current,
      type,
      resourceName: nextResource,
      counterAmount: String(meta.defaultCounterSolar),
      counterOn: meta.defaultCounterSolar > 0 && !nextResourceIsSolar,
    }));
    setError(null);
  };

  const seal = async () => {
    const transactionType = form.type;
    if (
      !transactionType ||
      !selectedType ||
      !selectedResource ||
      !canContinueStep2 ||
      sealing
    ) {
      return;
    }

    const counterparty =
      form.counterpartyKey === "__external"
        ? {
            type: "external" as const,
            id: null,
            name: form.externalCounterparty.trim(),
          }
        : selectedCounterparty;

    if (!counterparty) {
      setError("La contrepartie choisie est invalide.");
      return;
    }

    const payload: CreateTransactionInput = {
      type: transactionType,
      dateText: form.dateText,
      season: form.season,
      counterpartyType: counterparty.type,
      counterpartyId: counterparty.id,
      counterpartyName: counterparty.name,
      resourceName: selectedResource.name,
      resourceQty: form.qty,
      counterSolar: form.counterAmount,
      counterSolarEnabled: form.counterOn && !resourceIsSolar,
      note: form.note,
    };

    setSealing(true);
    setError(null);
    await wait(800);
    const result = await createTransaction(payload);
    setSealing(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setSealedAt(result.sealedAt ?? new Date().toISOString());
    setSealedFolio(result.transactionId ?? null);
    setDone(true);
    onDone();
  };

  const reset = () => {
    setDone(false);
    setStep(1);
    setSealedAt(null);
    setSealedFolio(null);
    setError(null);
    setForm({
      type: "",
      counterpartyKey: initialCounterpartyKey,
      externalCounterparty: "",
      resourceName: defaultResourceForType("", inventory, ""),
      qty: "1",
      counterOn: false,
      counterAmount: "0",
      dateText: formatDate(new Date()),
      season: defaultSeason,
      note: "",
    });
  };

  if (done) {
    return (
      <div className="max-w-[880px] mx-auto">
        <Folio>
          <div className="px-10 py-16 text-center">
            <div
              className="mx-auto mb-8 flex h-40 w-40 rotate-[-8deg] flex-col items-center justify-center rounded-full font-serif font-extrabold text-on-body"
              style={{
                background: "radial-gradient(circle at 35% 35%, #c8242a, #6e1414)",
                border: "5px solid #8B1A1A",
                boxShadow:
                  "inset -4px -4px 10px rgba(0,0,0,0.4), inset 4px 4px 10px rgba(255,255,255,0.18), 0 6px 18px rgba(0,0,0,0.6)",
                letterSpacing: "0.08em",
              }}
            >
              <span className="text-[11px]">SCELLÉ</span>
              <span className="my-1 text-[28px]">⚜</span>
              <span className="text-[9px] tracking-[0.16em]">
                {sealDate(sealedAt)}
              </span>
            </div>
            <h2
              className="font-serif text-[32px] font-black uppercase text-parch-ink"
              style={{ letterSpacing: "0.18em" }}
            >
              Inscrit au registre
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[17px] italic leading-7 text-parch-ink-soft">
              {selectedType?.shortLabel ?? "Inscription"} de{" "}
              <strong>{counterpartyName || "contrepartie"}</strong> · {form.qty}{" "}
              {selectedResource?.name.toLocaleLowerCase("fr-CA") ?? "ressource"}
              <br />
              consigné dans le folio {sealedFolio ? `#${sealedFolio}` : "du registre"}.
            </p>
            <div className="mx-auto mt-8 flex max-w-[520px] justify-center gap-3">
              <button
                type="button"
                onClick={reset}
                className="font-serif text-xs font-bold uppercase px-5 py-3 cursor-pointer"
                style={{
                  border: "1px solid rgba(74,40,16,0.5)",
                  color: "#4a2810",
                  letterSpacing: "0.18em",
                }}
              >
                † Une autre inscription
              </button>
              <button
                type="button"
                onClick={onClose}
                className="font-serif text-xs font-extrabold uppercase px-7 py-3 cursor-pointer"
                style={primaryStyle("#3d6e2a")}
              >
                Retour au registre
              </button>
            </div>
          </div>
        </Folio>
      </div>
    );
  }

  const parts = dateParts(form.dateText);
  const previewSign =
    selectedType?.resourceDirection === "in" ? "+" : selectedType ? "−" : "";

  return (
    <div className="max-w-[880px] mx-auto">
      <div
        className="mb-5 flex items-center justify-between px-6 py-4"
        style={{
          background: "linear-gradient(180deg, #1a0e05 0%, #2a1a08 100%)",
          border: "2px solid #4a2810",
          borderTop: "4px solid #8B1A1A",
          borderBottom: "4px solid #8B1A1A",
          boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        }}
      >
        <div>
          <div
            className="font-serif text-2xl font-black uppercase text-on-body"
            style={{ letterSpacing: "0.18em", textShadow: "0 2px 0 #000" }}
          >
            Inscrire au registre
          </div>
          <div className="mt-1 text-sm italic text-on-body-soft">
            ⚜ Folio de saison · Tenu par {currentUser} ⚜
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="font-serif text-[11px] font-semibold uppercase px-4 py-2.5 cursor-pointer"
          style={{
            background: "transparent",
            color: "rgba(244,234,210,0.8)",
            border: "1px solid rgba(160,98,42,0.5)",
            letterSpacing: "0.16em",
          }}
        >
          ✕ Fermer
        </button>
      </div>

      <StepRail step={step} onJump={setStep} />

      {error && (
        <div
          className="mb-3 px-4 py-3 text-sm italic"
          style={{
            background: "rgba(139,32,32,0.15)",
            border: "1px solid #8B1A1A",
            color: "#f4ead2",
          }}
        >
          ⚠ {error}
        </div>
      )}

      {step === 1 && (
        <Folio>
          <FlowHeader step="Étape I" title="Quelle inscription?" />
          <div className="flex flex-col gap-4 px-6 py-6">
            <p className="m-0 text-[15px] italic leading-6 text-parch-ink-soft">
              Déclarez d'abord la nature de l'écriture. Le formulaire s'adaptera à
              votre choix.
            </p>
            {!canWrite && (
              <div className="border border-blood bg-blood/10 px-4 py-3 text-sm italic text-parch-ink-soft">
                Seuls les administrateurs peuvent inscrire au registre.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {WRITABLE_TRANSACTION_TYPES.map((type) => {
                const meta = TYPE_META[type];
                const active = form.type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => chooseType(type)}
                    className="relative flex items-start gap-3.5 p-4 text-left cursor-pointer transition-[filter] hover:brightness-105"
                    style={{
                      background: active
                        ? "rgba(139,32,32,0.08)"
                        : "rgba(244,234,210,0.55)",
                      border: `2px solid ${active ? meta.color : "rgba(74,40,16,0.3)"}`,
                      boxShadow: active
                        ? `inset 0 0 14px ${meta.color}20, 0 2px 6px rgba(0,0,0,0.15)`
                        : "none",
                    }}
                  >
                    <span
                      className="w-1 self-stretch"
                      style={{
                        background: `repeating-linear-gradient(180deg, ${meta.color} 0 6px, #1a1008 6px 9px)`,
                      }}
                    />
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-serif text-base font-bold"
                      style={{
                        border: `2px solid ${meta.color}`,
                        background: active
                          ? `radial-gradient(circle at 35% 35%, ${meta.color}ee, ${meta.color}aa)`
                          : `radial-gradient(circle at 35% 35%, ${meta.color}55, ${meta.color}22)`,
                        color: active ? "#f4ead2" : meta.color,
                        boxShadow:
                          "inset -1px -1px 3px rgba(0,0,0,0.3), inset 1px 1px 3px rgba(255,255,255,0.15)",
                      }}
                    >
                      {meta.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block font-serif text-sm font-extrabold uppercase text-parch-ink"
                        style={{ letterSpacing: "0.14em" }}
                      >
                        {meta.shortLabel}
                      </span>
                      <span className="mt-1 block text-[13px] italic leading-5 text-parch-ink-soft">
                        {meta.description}
                      </span>
                    </span>
                    {active && (
                      <span
                        className="absolute -right-2.5 -top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-on-body"
                        style={{ background: meta.color }}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <FlowFooter
            left="1 sur 3"
            right={form.type ? `Type sélectionné · ${TYPE_META[form.type].shortLabel}` : "Choisissez un type"}
          >
            <FolioButton onClick={onClose}>Annuler</FolioButton>
            <FolioButton
              primary
              disabled={!form.type || !canWrite}
              onClick={() => setStep(2)}
            >
              Continuer ↦
            </FolioButton>
          </FlowFooter>
        </Folio>
      )}

      {step === 2 && (
        <Folio>
          <FlowHeader
            step="Étape II"
            title="Détails de l'inscription"
            type={form.type}
          />
          <div className="px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <Field label="Contrepartie · qui ?" full>
                <select
                  value={form.counterpartyKey}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      counterpartyKey: event.target.value,
                    }))
                  }
                  style={fieldStyle()}
                >
                  <optgroup label="Guildes">
                    {counterparties
                      .filter((option) => option.type === "guild")
                      .map((option) => (
                        <option key={counterpartyKey(option)} value={counterpartyKey(option)}>
                          {option.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Membres du clan">
                    {counterparties
                      .filter((option) => option.type === "member")
                      .map((option) => (
                        <option key={counterpartyKey(option)} value={counterpartyKey(option)}>
                          {option.name}
                        </option>
                      ))}
                  </optgroup>
                  <option value="__external">＋ Nouvelle contrepartie…</option>
                </select>
              </Field>

              {form.counterpartyKey === "__external" && (
                <Field label="Nom de la contrepartie" full>
                  <input
                    value={form.externalCounterparty}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        externalCounterparty: event.target.value,
                      }))
                    }
                    style={fieldStyle()}
                  />
                </Field>
              )}

              <Field label="Ressource">
                <select
                  value={form.resourceName}
                  onChange={(event) =>
                    setForm((current) => {
                      const isSolar =
                        event.target.value.toLocaleLowerCase("fr-CA") === "solar";
                      return {
                        ...current,
                        resourceName: event.target.value,
                        counterOn: isSolar ? false : current.counterOn,
                      };
                    })
                  }
                  style={fieldStyle()}
                >
                  <optgroup label="Ressources">
                    {resourceGroups.ressources.map((item) => (
                      <option key={item.id} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Objets">
                    {resourceGroups.objets.map((item) => (
                      <option key={item.id} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </Field>

              <Field label="Quantité">
                <input
                  type="number"
                  min={1}
                  value={form.qty}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, qty: event.target.value }))
                  }
                  style={fieldStyle()}
                />
                {selectedResource && (
                  <div
                    className="mt-1 text-xs italic"
                    style={{
                      color: overStock ? "#8B1A1A" : "#7a5028",
                      fontWeight: overStock ? 600 : 400,
                    }}
                  >
                    {overStock
                      ? `⚠ Stock insuffisant — coffre : ${selectedResource.stock} ${selectedResource.name.toLocaleLowerCase("fr-CA")}`
                      : `Stock du coffre : ${selectedResource.stock} ${selectedResource.name.toLocaleLowerCase("fr-CA")}`}
                  </div>
                )}
              </Field>

              <Field label="Date d'inscription">
                <input
                  value={form.dateText}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dateText: event.target.value,
                    }))
                  }
                  style={fieldStyle()}
                />
              </Field>

              <Field label="Saison">
                <select
                  value={form.season}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, season: event.target.value }))
                  }
                  style={fieldStyle()}
                >
                  {SEASON_OPTIONS.map((season) => (
                    <option key={season.value} value={season.value}>
                      {season.label}
                    </option>
                  ))}
                </select>
              </Field>

              {!resourceIsSolar && form.type && (
                <div
                  className="md:col-span-2 flex items-center gap-3.5 p-4"
                  style={{
                    border: "1px dashed rgba(74,40,16,0.5)",
                    background: "rgba(160,98,42,0.06)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        counterOn: !current.counterOn,
                      }))
                    }
                    className="relative h-6 w-[42px] shrink-0 rounded-full"
                    style={{
                      background: form.counterOn
                        ? "#3d6e2a"
                        : "rgba(74,40,16,0.4)",
                      border: `1px solid ${
                        form.counterOn ? "#3d6e2a" : "rgba(74,40,16,0.5)"
                      }`,
                    }}
                  >
                    <span
                      className="absolute top-px h-5 w-5 rounded-full bg-card transition-[left]"
                      style={{
                        left: form.counterOn ? 20 : 1,
                        boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                      }}
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div
                      className="font-serif text-xs font-bold uppercase text-parch-ink"
                      style={{ letterSpacing: "0.14em" }}
                    >
                      Contrepartie en Solar
                    </div>
                    <div className="mt-1 text-[13px] italic text-parch-ink-soft">
                      {TYPE_META[form.type].counterLabel}.
                    </div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    disabled={!form.counterOn}
                    value={form.counterAmount}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        counterAmount: event.target.value,
                      }))
                    }
                    style={fieldStyle({
                      width: 110,
                      textAlign: "right",
                      opacity: form.counterOn ? 1 : 0.45,
                    })}
                  />
                  <span
                    className="font-serif text-xs text-parch-muted"
                    style={{ letterSpacing: "0.16em" }}
                  >
                    SOLAR
                  </span>
                </div>
              )}

              <Field label="Note de campement" full>
                <textarea
                  value={form.note}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, note: event.target.value }))
                  }
                  placeholder="Pourquoi cette inscription ? Contexte utile pour relire dans six mois…"
                  style={fieldStyle({
                    minHeight: 84,
                    resize: "vertical",
                    fontStyle: "italic",
                  })}
                />
              </Field>
            </div>
          </div>
          <FlowFooter left="2 sur 3" right={`Coffre · ${solar?.stock ?? 0} Solar`}>
            <FolioButton onClick={() => setStep(1)}>← Retour</FolioButton>
            <FolioButton
              primary
              disabled={!canContinueStep2}
              onClick={() => setStep(3)}
            >
              Voir le sceau ↦
            </FolioButton>
          </FlowFooter>
        </Folio>
      )}

      {step === 3 && (
        <Folio>
          <FlowHeader step="Étape III" title="Apposer le sceau" type={form.type} />
          <div className="flex flex-col gap-4 px-6 py-6">
            <p className="m-0 text-[15px] italic leading-6 text-parch-ink-soft">
              Voici l'écriture telle qu'elle paraîtra dans le registre. Vérifiez
              avant de sceller.
            </p>

            <div
              style={{
                background: "rgba(244,234,210,0.6)",
                border: "2px solid #4a2810",
                boxShadow: "inset 0 0 30px rgba(160,98,42,0.1)",
              }}
            >
              <div
                className="px-4 py-2 text-center font-serif text-[10px] font-extrabold uppercase text-parch-ink-soft"
                style={{
                  letterSpacing: "0.26em",
                  background:
                    "linear-gradient(180deg, rgba(160,98,42,0.2), rgba(160,98,42,0.08))",
                  borderBottom: "1px solid #8B1A1A",
                }}
              >
                ❦ Aperçu de l'inscription ❦
              </div>
              <div
                className="grid min-h-[88px]"
                style={{ gridTemplateColumns: "90px 4px 1fr 110px" }}
              >
                <div
                  className="flex flex-col items-center justify-center px-2 py-3 text-center"
                  style={{
                    background: "rgba(160,98,42,0.10)",
                    borderRight: "1px solid rgba(139,32,32,0.18)",
                  }}
                >
                  <div className="font-serif text-[26px] font-bold leading-none text-parch-ink-soft">
                    {parts.day}
                  </div>
                  <div
                    className="mt-1 font-serif text-[10px] font-bold uppercase text-parch-muted"
                    style={{ letterSpacing: "0.22em" }}
                  >
                    {parts.month}
                  </div>
                </div>
                <TartanStripe kind={selectedType?.tartan ?? "neutral"} />
                <div className="flex flex-col justify-center px-4 py-3">
                  {selectedType && (
                    <Badge color={selectedType.color} className="self-start">
                      {selectedType.icon} {selectedType.shortLabel}
                    </Badge>
                  )}
                  <div className="mt-1 font-serif text-base font-semibold text-parch-ink">
                    {counterpartyName || "Contrepartie"}
                  </div>
                  <div className="mt-1 text-[13px] italic leading-5 text-parch-ink-soft">
                    {form.note || "(aucune note)"}
                  </div>
                </div>
                <div className="flex flex-col items-end justify-center px-3 py-3">
                  <div
                    className="font-serif text-[22px] font-extrabold tabular-nums"
                    style={{
                      color:
                        selectedType?.resourceDirection === "in"
                          ? "#3d6e2a"
                          : "#8B1A1A",
                    }}
                  >
                    {previewSign}
                    {form.qty || "0"}
                  </div>
                  <div
                    className="mt-1.5 font-serif text-[10px] uppercase text-parch-muted"
                    style={{ letterSpacing: "0.16em" }}
                  >
                    {selectedResource?.name ?? "Ressource"}
                  </div>
                </div>
              </div>
            </div>

            <div
              className="p-4"
              style={{
                background: "rgba(160,98,42,0.08)",
                border: "1px solid rgba(74,40,16,0.3)",
              }}
            >
              <SummaryLine label="Effet sur le coffre" value={effectSummary} />
              <SummaryLine
                label="Statut initial"
                value={
                  selectedType?.initialStatus === "regle"
                    ? "Réglé"
                    : "Actif (à régler)"
                }
              />
              <SummaryLine label="Inscrit par" value={currentUser} />
            </div>

            <div
              className="border-l-4 px-3.5 py-3 text-[13px] leading-5"
              style={{
                background: "rgba(139,32,32,0.08)",
                borderColor: "#8B1A1A",
                color: "#4a0a0a",
              }}
            >
              <strong
                className="font-serif text-xs uppercase"
                style={{ letterSpacing: "0.1em" }}
              >
                ⚠ AVANT DE SCELLER —
              </strong>{" "}
              une fois apposé, le sceau ne s'efface pas. L'écriture restera au
              registre, même corrigée plus tard. Une trace d'annulation sera
              visible.
            </div>

            <button
              type="button"
              disabled={sealing || !canContinueStep2}
              onClick={seal}
              className="mx-auto mt-2 flex h-[110px] w-[110px] flex-col items-center justify-center rounded-full font-serif font-extrabold text-on-body disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                border: "4px solid #8B1A1A",
                background: "radial-gradient(circle at 35% 35%, #c8242a, #6e1414)",
                boxShadow:
                  "inset -3px -3px 8px rgba(0,0,0,0.4), inset 3px 3px 8px rgba(255,255,255,0.18), 0 4px 12px rgba(0,0,0,0.5)",
                letterSpacing: "0.06em",
                transform: sealing ? "scale(1.18)" : "scale(1)",
                transition: "transform 150ms",
              }}
            >
              <span className="text-[11px]">{sealing ? "…" : "APPOSER"}</span>
              <span className="mt-1 text-base">{sealing ? "⚜" : "LE SCEAU"}</span>
            </button>
          </div>
          <FlowFooter
            left="3 sur 3"
            right={sealing ? "Sceau en cours…" : "Prêt à inscrire"}
          >
            <FolioButton disabled={sealing} onClick={() => setStep(2)}>
              ← Modifier
            </FolioButton>
            <FolioButton disabled={sealing} onClick={onClose}>
              Annuler
            </FolioButton>
          </FlowFooter>
        </Folio>
      )}
    </div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={full ? "md:col-span-2" : undefined}>
      <span
        className="mb-1.5 block font-serif text-[11px] font-bold uppercase text-parch-muted"
        style={{ letterSpacing: "0.2em" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function FlowFooter({
  left,
  right,
  children,
}: {
  left: string;
  right: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-6 py-3.5"
      style={{
        borderTop: "2px solid #8B1A1A",
        background:
          "linear-gradient(180deg, rgba(160,98,42,0.04), rgba(160,98,42,0.12))",
      }}
    >
      <div
        className="font-serif text-[11px] font-bold uppercase text-parch-muted"
        style={{ letterSpacing: "0.16em" }}
      >
        <span>{left}</span>
        <span className="mx-2">·</span>
        <span>{right}</span>
      </div>
      <div className="flex gap-2.5">{children}</div>
    </div>
  );
}

function FolioButton({
  primary,
  disabled,
  onClick,
  children,
}: {
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="font-serif text-xs font-bold uppercase px-4 py-2.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      style={
        primary
          ? primaryStyle()
          : {
              background: "transparent",
              border: "1px solid rgba(74,40,16,0.5)",
              color: "#4a2810",
              letterSpacing: "0.18em",
            }
      }
    >
      {children}
    </button>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span
        className="font-serif text-[11px] font-bold uppercase text-parch-muted"
        style={{ letterSpacing: "0.16em" }}
      >
        {label}
      </span>
      <span className="text-right text-[15px] font-semibold text-parch-ink">
        {value}
      </span>
    </div>
  );
}
