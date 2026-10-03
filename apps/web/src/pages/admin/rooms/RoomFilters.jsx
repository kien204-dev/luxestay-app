import { useTranslation } from "react-i18next";
import { ROOM_STATUSES } from "./roomStatus";

// Search, filter and sort controls; every value lives in the URL.
export default function RoomFilters({ query, onChange }) {
  const { t } = useTranslation("rooms");
  const input = (key, extra = {}) => ({
    className: "adm-input",
    value: query[key] || "",
    onChange: (event) => onChange({ [key]: event.target.value }),
    ...extra,
  });

  return (
    <div className="adm-toolbar" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", alignItems: "end" }}>
      <label className="adm-field" style={{ gridColumn: "span 2" }}>
        <span className="adm-label">{t("filters.search")}</span>
        <input type="search" placeholder={t("filters.searchPlaceholder")} {...input("q")} />
      </label>
      <label className="adm-field">
        <span className="adm-label">{t("filters.status")}</span>
        <select {...input("status")} className="adm-select">
          <option value="">{t("filters.anyStatus")}</option>
          {ROOM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="adm-field">
        <span className="adm-label">{t("filters.minPrice")}</span>
        <input type="number" min="0" {...input("minPrice")} />
      </label>
      <label className="adm-field">
        <span className="adm-label">{t("filters.maxPrice")}</span>
        <input type="number" min="0" {...input("maxPrice")} />
      </label>
      <label className="adm-field">
        <span className="adm-label">{t("filters.minGuests")}</span>
        <input type="number" min="1" {...input("minCapacity")} />
      </label>
      <label className="adm-field">
        <span className="adm-label">{t("filters.sortBy")}</span>
        <select {...input("sortBy")} value={query.sortBy || "created_at"} className="adm-select">
          <option value="created_at">{t("filters.sortNewest")}</option>
          <option value="name">{t("filters.sortName")}</option>
          <option value="price">{t("filters.sortPrice")}</option>
        </select>
      </label>
      <label className="adm-field">
        <span className="adm-label">{t("filters.order")}</span>
        <select {...input("sortOrder")} value={query.sortOrder || "desc"} className="adm-select">
          <option value="desc">{t("filters.desc")}</option>
          <option value="asc">{t("filters.asc")}</option>
        </select>
      </label>
      <label className="adm-field">
        <span className="adm-label">{t("filters.perPage")}</span>
        <select {...input("limit")} value={query.limit || "10"} className="adm-select">
          {["5", "10", "20", "50"].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
