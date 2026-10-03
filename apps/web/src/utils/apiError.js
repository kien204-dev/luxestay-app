import i18n from "../i18n";

// The API sends { code, message, params? } for every error and most
// successes (see apps/api/src/utils/apiMessages.js). These turn that into
// text in the visitor's language, from the "errors" namespace.

function translateCode(data) {
  if (!data?.code || !i18n.exists(`errors:${data.code}`)) return null;
  const params = { ...(data.params || {}) };
  if (params.field) params.fieldLabel = i18n.t(`errors:fields.${params.field}`, { defaultValue: params.field });
  if (typeof params.amount === "number") params.amount = params.amount.toLocaleString(i18n.language === "en" ? "en-US" : "vi-VN");
  return i18n.t(`errors:${data.code}`, params);
}

// Text for a failed request. `fallbackKey` (any "ns:key") is used when the
// response carries no known code.
export function apiErrorText(error, fallbackKey = "errors:unknown") {
  if (!error?.response) return i18n.t(error?.code === "ERR_CANCELED" ? fallbackKey : "errors:network");
  return translateCode(error.response.data) || i18n.t(fallbackKey);
}

// Text for a successful response's message (a toast, say).
export function apiSuccessText(data, fallbackKey) {
  return translateCode(data) || (fallbackKey ? i18n.t(fallbackKey) : "");
}
