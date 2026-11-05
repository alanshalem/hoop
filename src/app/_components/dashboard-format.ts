/** "60,3": dashboard averages and percentages (es-AR, one decimal). */
export const formatOneDecimal = (value: number): string =>
  value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "+2,5" / "-7,4": signed differentials. */
export const formatSigned = (value: number): string => `${value > 0 ? '+' : ''}${formatOneDecimal(value)}`;
