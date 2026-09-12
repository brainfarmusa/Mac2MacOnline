export type InventoryLine = {
  quantity?: number;
  values?: Record<string, string>;
};

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const unique = (values: string[]) => [...new Set(values.map(clean).filter(Boolean))];
const natural = (values: string[]) =>
  values.length < 2 ? values.join("") : values.length === 2 ? values.join(" and ") : `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
const valuesFor = (lines: InventoryLine[], pattern: RegExp) =>
  unique(lines.flatMap((line) => Object.entries(line.values || {}).filter(([key]) => pattern.test(key.trim())).map(([, value]) => value)));
const joinedLine = (line: InventoryLine) => Object.values(line.values || {}).join(" ");
const weightedMatches = (lines: InventoryLine[], pattern: RegExp) =>
  lines.reduce((sum, line) => sum + (pattern.test(joinedLine(line)) ? Math.max(1, Number(line.quantity) || 1) : 0), 0);

/**
 * Permanent product rule: classify from quantity-weighted spreadsheet line items.
 * Saved titles, filenames and isolated manufacturer names are deliberately excluded.
 */
export function inventoryCategory(lines: InventoryLine[], fallback = "Accessories") {
  if (!lines.length) return fallback;
  const headers = unique(lines.flatMap((line) => Object.keys(line.values || {}))).join(" ");
  const total = lines.reduce((sum, line) => sum + Math.max(1, Number(line.quantity) || 1), 0);
  const ratio = (pattern: RegExp) => weightedMatches(lines, pattern) / total;

  if (/\b(base clock|max turbo|cores?|pcie lanes|ram support)\b/i.test(headers) && ratio(/\b(xeon|epyc|processor|cpu)\b/i) > .5)
    return "CPUs";
  const serverRatio = ratio(/\b(poweredge|proliant|supermicro|gpu server|server|chassis\/motherboard)\b/i);
  if (serverRatio > .35 || (/\bprocessor\b/i.test(headers) && /\b(gpu|ram|memory)\b/i.test(headers)))
    return ratio(/\b(a100|h100|h200|l40s?|a10|a40|gpu|nvidia ga\d+)\b/i) > .15 ? "GPU Servers" : "Servers";
  if (ratio(/\b(transceiver(?: module)?s?|optical modules?|osfp|qsfp(?:28|56|112)?|sfp\+?|cfp\d*|dr4|dr8|sr4|sr8|vr4|vr8|MMA[0-9A-Z-]+|MMS[0-9A-Z-]+)\b/i) > .3)
    return "Transceivers";
  if (ratio(/\b(antenna|beamwidth|frequency range|dBi|polarization)\b/i) > .5) return "Networking / Antennas";
  if (ratio(/\b(macbook|macbook air|macbook pro)\b/i) > .5) return "Apple Laptops";
  if (ratio(/\b(lcd|commercial display|monitor|4k\/uhd)\b/i) > .5) return "Commercial Displays";
  const ram = ratio(/\b(ddr[2-5]|pc[2-5][l]?-?\d|dimm|sodimm|rdimm|lrdimm|udimm|memory module)\b/i);
  if (ram > .5 || (/\b(capacity|dimm size|gb)\b/i.test(headers) && /\b(memory type|dram speed|form factor|rank)\b/i.test(headers))) return "RAM";
  const ssd = weightedMatches(lines, /\b(ssd|solid state|nvme)\b/i);
  const hdd = weightedMatches(lines, /\b(hdd|hard disk|hard drive)\b/i);
  if (ssd && hdd) return "SSDs & HDDs";
  if (ssd) return "SSD";
  if (hdd) return "HDD";
  if (ratio(/\b(a100|a800|h100|h200|h800|l4|l40s?|a10|a16|a30|a40|rtx|quadro|tesla|graphics card|gpu accelerator)\b/i) > .5) return "GPUs";
  if (ratio(/\b(xeon|epyc|processor|cpu)\b/i) > .5) return "CPUs";
  return fallback;
}

export function inventoryDescription(lines: InventoryLine[], category: string) {
  const capacities = valuesFor(lines, /^(capacity|dimm size|gb|ram)$/i).filter((value) => /^\d+(?:\.\d+)?\s*(?:gb|tb)/i.test(value));
  const memoryTypes = unique([...valuesFor(lines, /^(memory type|type|ram_type)$/i), ...lines.flatMap((line) => joinedLine(line).match(/\bDDR[2-5]\b/gi) || [])]);
  const speeds = valuesFor(lines, /^(speed|dram speed)$/i).map((value) => value.replace(/^PC\d[- ]?/i, "").replace(/(?:MHz|MT\/s)$/i, "").trim()).filter((value) => /^\d{4}/.test(value));
  const forms = unique([...valuesFor(lines, /^(form factor|memory dram type)$/i), ...lines.flatMap((line) => joinedLine(line).match(/\b(?:SO-?DIMM|LRDIMM|RDIMM|UDIMM)\b/gi) || [])]);
  const makers = valuesFor(lines, /^(mfg|manufacturer|brand|make|vendor)$/i).slice(0, 4);

  if (category === "RAM") {
    const spec = [natural(capacities.slice(0, 5)), natural(memoryTypes.slice(0, 3)), natural(forms.slice(0, 4))].filter(Boolean).join(" ");
    const speed = speeds.length ? `, ${natural(unique(speeds).slice(0, 4))}MHz` : "";
    const maker = makers.length ? `; ${natural(makers)}` : "";
    return `${spec || "RAM modules"}${speed}${maker}`;
  }
  if (category === "CPUs") {
    const models = valuesFor(lines, /^(model(?:\/pn)?|model\/pn|processor|sku)$/i).filter((value) => !/^SR[A-Z0-9]+$/i.test(value));
    const cores = valuesFor(lines, /^cores?$/i);
    const clocks = valuesFor(lines, /^(base clock|max turbo)$/i);
    return `${natural(makers.slice(0, 2))} ${natural(models.slice(0, 3))} CPUs${cores.length ? `; ${natural(cores)}` : ""}${clocks.length ? `, ${natural(clocks)}` : ""}`.replace(/\s+/g, " ");
  }
  if (category === "GPU Servers" || category === "Servers") {
    const models = valuesFor(lines, /^(model|class)$/i).slice(0, 5);
    const processors = valuesFor(lines, /^processor$/i).slice(0, 4);
    const gpus = valuesFor(lines, /^gpu$/i).slice(0, 4);
    const ram = valuesFor(lines, /^ram$/i).slice(0, 4);
    return `${natural(makers)} ${category.toLowerCase()}; ${natural(models)}${gpus.length ? `; ${natural(gpus)}` : ""}${processors.length ? `; ${natural(processors)}` : ""}${ram.length ? `; ${natural(ram)} RAM` : ""}`;
  }
  if (category === "Transceivers") {
    const standards = unique(lines.flatMap((line) => joinedLine(line).match(/\b(?:1|10|16|25|32|40|100|200|400|800|1600)G(?:b\/s|bps|BASE)?\b/gi) || [])).slice(0, 8);
    const formsFound = unique(lines.flatMap((line) => joinedLine(line).match(/\b(?:OSFP|QSFP112|QSFP28|QSFP|SFP28|SFP\+|SFP)\b/gi) || [])).slice(0, 6);
    return `${natural(makers)} ${natural(standards)} ${natural(formsFound)} optical transceivers`.replace(/\s+/g, " ");
  }
  if (category === "Apple Laptops") {
    const models = valuesFor(lines, /^(model|model#)$/i).slice(0, 8);
    const processors = valuesFor(lines, /^processor$/i).slice(0, 6);
    const ram = valuesFor(lines, /^ram$/i).slice(0, 5);
    const storage = valuesFor(lines, /^(hdd|ssd|storage)$/i).slice(0, 5);
    return `Apple MacBook Air/Pro systems; ${natural(models)}; ${natural(processors)}; ${natural(ram)} RAM${storage.length ? `; ${natural(storage)} storage` : ""}`;
  }
  if (category === "Commercial Displays") {
    const sizes = unique(lines.flatMap((line) => joinedLine(line).match(/\b(?:43|49|55|65|75|86|98)[\" ]/g) || []).map((value) => value.trim())).slice(0, 8);
    return `${natural(makers)} ${natural(sizes.map((size) => `${size}″`))} 4K commercial displays`;
  }
  if (category === "Networking / Antennas") {
    const models = valuesFor(lines, /^model$/i).slice(0, 4);
    const frequency = valuesFor(lines, /^frequency range$/i).slice(0, 3);
    const condition = valuesFor(lines, /^condition$/i).slice(0, 3);
    return `${natural(condition)} ${natural(makers)} ${natural(frequency)} outdoor sector antennas; ${natural(models)}`;
  }
  if (category === "POS Systems") {
    const models = valuesFor(lines, /^(model|model number|part number|pn|sku)$/i).slice(0, 6);
    const descriptions = valuesFor(lines, /^(description|product|configuration)$/i).slice(0, 4);
    return `${natural(makers)} POS systems${models.length ? `; ${natural(models)}` : ""}${descriptions.length ? `; ${natural(descriptions)}` : ""}`.replace(/^\s+|\s+$/g, "");
  }
  if (category === "SSDs & HDDs") return `Buying NVMe and SATA SSDs 128GB and larger, plus HDDs 1TB and larger, in any condition`;
  const descriptions = valuesFor(lines, /^(description|product|configuration)$/i).slice(0, 3);
  return descriptions.length ? natural(descriptions) : category;
}
