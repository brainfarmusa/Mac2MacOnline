export const gpuProductPattern =
  /\b(gpu|graphics card|amd instinct|quadro|tesla|rtx|a10|a16|a30|a40|a100|a800|h100|h200|h800|l4|l40|l40s|t4|p4|p40|p100|v100)\b/i;

export const transceiverProductPattern =
  /\b(transceiver(?: module)?s?|optical modules?|osfp|qsfp(?:28|56|112)?|sfp\+?|cfp\d*|dr4|dr8|sr4|sr8|vr4|vr8|MMA[0-9A-Z-]+|MMS[0-9A-Z-]+)\b/i;

export function detectProductCategory(text: string, fallback = "Accessories") {
  if (transceiverProductPattern.test(text)) return "Transceivers";
  if (gpuProductPattern.test(text)) return "GPUs";
  if (/\b(ram|memory|dimm|sodimm|rdimm|udimm|ddr[2-5])\b/i.test(text))
    return "RAM";
  if (/\b(ssd|solid state|nvme)\b/i.test(text)) return "SSD";
  if (/\b(hdd|hard disk|hard drive)\b/i.test(text)) return "HDD";
  if (/\b(apple|macbook|imac|mac mini|mac studio)\b/i.test(text))
    return "Apple";
  if (/\b(cpu|processor|xeon|epyc)\b/i.test(text)) return "CPUs";
  if (/\b(laptop|notebook|chromebook)\b/i.test(text)) return "Laptops";
  if (/\b(workstation)\b/i.test(text)) return "Workstations";
  if (/\b(desktop|mini pc|all-in-one|aio)\b/i.test(text)) return "Desktops";
  if (/\b(server component|server part|raid controller|backplane|server motherboard)\b/i.test(text))
    return "Server Components";
  if (/\b(server|poweredge|proliant)\b/i.test(text)) return "Servers";
  if (/\b(monitor|display|lcd)\b/i.test(text)) return "Monitors";
  if (/\b(network|switch|router|firewall|access point)\b/i.test(text))
    return "Networking";
  if (/\b(phone|smartphone|iphone)\b/i.test(text)) return "Phones";
  if (/\b(point[ -]of[ -]sale|pos system|pos terminal|cash register)\b/i.test(text))
    return "POS Systems";
  if (/\b(tablet|ipad)\b/i.test(text)) return "Tablets";
  if (/\b(storage|san|nas|disk shelf)\b/i.test(text)) return "Storage";
  return fallback;
}
