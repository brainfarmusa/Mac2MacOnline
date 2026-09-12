export type BoxBidSourceLine = {
  line: number;
  quantity: number;
  values: Record<string, string>;
};

export type BoxBidGroup = {
  boxNumber: string;
  quantity: number;
  lineNumbers: number[];
  indexes: number[];
};

const headerKey = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");
// Permanent workflow rule: "box" and "lot" are interchangeable grouping
// labels for multiple-award deals. Container remains a supported legacy alias.
const boxHeaders = new Set([
  "box",
  "boxno",
  "boxnumber",
  "lot",
  "lotno",
  "lotnumber",
  "container",
  "containerno",
  "containernumber",
]);

export function boxNumberFromValues(values: Record<string, string>) {
  const entry = Object.entries(values || {}).find(([name]) =>
    boxHeaders.has(headerKey(name)),
  );
  return String(entry?.[1] || "")
    .trim()
    .replace(/^(?:box|lot)\s*/i, "")
    .trim();
}

export function isMultipleAwardDeal(
  lines: Array<BoxBidSourceLine & { award_mode?: "single" | "multiple" }>,
) {
  return (
    lines.some((line) => line.award_mode === "multiple") ||
    lines.some((line) => Boolean(boxNumberFromValues(line.values)))
  );
}

export function groupBidLinesByBox(lines: BoxBidSourceLine[]) {
  const groups = new Map<string, BoxBidGroup>();
  let currentBox = "";

  lines.forEach((line, index) => {
    const explicitBox = boxNumberFromValues(line.values);
    if (explicitBox) currentBox = explicitBox;
    const boxNumber = currentBox || "Unassigned";
    const group = groups.get(boxNumber) || {
      boxNumber,
      quantity: 0,
      lineNumbers: [],
      indexes: [],
    };
    group.quantity += Math.max(0, Math.trunc(Number(line.quantity) || 0));
    group.lineNumbers.push(Number(line.line));
    group.indexes.push(index);
    groups.set(boxNumber, group);
  });

  return [...groups.values()];
}
