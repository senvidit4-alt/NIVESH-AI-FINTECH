export const formatINR = (val: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(val);

export const formatPct = (val: number) =>
  `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;

export const formatNum = (val: number) =>
  new Intl.NumberFormat("en-IN").format(Math.round(val));

export const pctColor = (val: number) =>
  val >= 0 ? "text-emerald-400" : "text-red-400";

export const pctBg = (val: number) =>
  val >= 0 ? "bg-emerald-400/10 text-emerald-400" : "bg-red-400/10 text-red-400";
