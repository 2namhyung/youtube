export type NormalizedChartRow = {label: string; value: number};

const preferredLabels = ['label', 'name', 'category', 'stage', 'date', 'year'];
const preferredValues = ['value', 'count', 'amount', 'total', 'score', 'percent'];

export const normalizeChartRows = (data: Array<Record<string, string | number>>): NormalizedChartRow[] => data.map((row, index) => {
  const labelKey = preferredLabels.find((key) => typeof row[key] === 'string') ?? Object.keys(row).find((key) => typeof row[key] === 'string');
  const valueKey = preferredValues.find((key) => typeof row[key] === 'number') ?? Object.keys(row).find((key) => typeof row[key] === 'number');
  const value = valueKey ? Number(row[valueKey]) : index + 1;
  if (!Number.isFinite(value)) throw new Error(`chart row ${index} does not contain a finite numeric value`);
  return {label: labelKey ? String(row[labelKey]) : String(index + 1), value};
});

