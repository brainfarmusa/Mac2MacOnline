export type SpreadsheetRows = {
  name: string;
  rows: string[][];
};

const DEFAULT_EXTENSIONS = [".xls", ".xlsx", ".csv"];

function extension(fileName: string) {
  return fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
}

export async function readSpreadsheetFile(
  file: File,
  options: {
    label?: string;
    maxBytes?: number;
    extensions?: string[];
  } = {},
): Promise<SpreadsheetRows[]> {
  const label = options.label || "spreadsheet",
    maxBytes = options.maxBytes ?? 10 * 1024 * 1024,
    extensions = options.extensions || DEFAULT_EXTENSIONS,
    fileExtension = extension(file.name);

  if (!file.size) throw new Error(`The selected ${label} is empty.`);
  if (file.size > maxBytes)
    throw new Error(`The ${label} must be 10 MB or smaller.`);
  if (!extensions.includes(fileExtension))
    throw new Error(`Please choose a ${extensions.join(", ")} ${label}.`);

  try {
    const XLSX = await import("@e965/xlsx"),
      workbook = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        raw: false,
        cellText: true,
      });
    const sheets = workbook.SheetNames.flatMap((name) => {
      const worksheet = workbook.Sheets[name];
      if (!worksheet) return [];
      const rows = XLSX.utils
        .sheet_to_json<unknown[]>(worksheet, {
          header: 1,
          raw: false,
          defval: "",
          blankrows: true,
        })
        .map((row) => row.map((value) => String(value ?? "").trim()));
      return [{ name, rows }];
    });
    if (!sheets.length)
      throw new Error(`No worksheet was found in the ${label}.`);
    return sheets;
  } catch (error) {
    if (
      error instanceof Error &&
      /^(The selected|The .* must|Please choose|No worksheet)/.test(error.message)
    )
      throw error;
    throw new Error(
      `This ${label} could not be opened. Please use a valid ${extensions.join(", ")} file.`,
    );
  }
}

export async function responseErrorMessage(
  response: Response,
  fallback: string,
) {
  const detail = (await response
    .json()
    .catch(() => ({}))) as { error?: string; message?: string; details?: string };
  return detail.error || detail.message || detail.details || fallback;
}
