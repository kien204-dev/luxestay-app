import { useTranslation } from "react-i18next";
import { FieldError } from "../../../components/auth/fields";
import { getRoomTypes } from "../../../services/roomService";
import { useAsyncData } from "../../../utils/useAsyncData";

export const NEW_TYPE = "__new__";

// "  phòng   deluxe " and "Phòng Deluxe" are the same type (the API matches
// the same way).
export const sameType = (a, b) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

// The room's type, picked from those in use so one type is not spelled two
// ways; a new one is typed only when asked for. `adding`/`onAdding` say
// whether the new-type box is shown; `onMatch` hears the existing type a
// typed name turns out to be.
export function useRoomTypes() {
  const types = useAsyncData("room-types", getRoomTypes);
  return { list: (types.data || []).map((item) => item.type), ready: Boolean(types.data || types.error) };
}

export default function RoomTypeField({ value, onChange, adding, onAdding, types, error, describedBy }) {
  const { t } = useTranslation("rooms");
  const typing = adding || (types.ready && types.list.length === 0);
  const match = typing && value.trim() ? types.list.find((type) => sameType(type, value)) : null;

  return (
    <div className="g-field">
      <label className="g-label" htmlFor={typing ? "room-type-new" : "room-type"}>{t("form.type")}</label>
      {!typing ? (
        <select
          id="room-type"
          className={`ax-select${error ? " is-invalid" : ""}`}
          value={types.list.includes(value) ? value : ""}
          onChange={(event) => {
            if (event.target.value === NEW_TYPE) {
              onAdding(true);
              onChange("");
            } else onChange(event.target.value);
          }}
          disabled={!types.ready}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          data-testid="room-type-select"
        >
          <option value="">{types.ready ? t("form.typeChoose") : t("form.typeLoading")}</option>
          {types.list.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
          <option value={NEW_TYPE}>{t("form.typeAdd")}</option>
        </select>
      ) : (
        <div className="ax-inline">
          <div className={`fx-control${error ? " is-invalid" : ""}`}>
            <input
              id="room-type-new"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              maxLength={100}
              placeholder={t("form.typePlaceholder")}
              autoFocus={adding}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              data-testid="room-type-new"
            />
          </div>
          {types.list.length > 0 && (
            <button
              type="button"
              className="g-btn g-btn--outline g-btn--small"
              onClick={() => {
                onAdding(false);
                onChange(match || "");
              }}
            >
              {t("form.typeBack")}
            </button>
          )}
        </div>
      )}
      <FieldError id="room-type-error">{error}</FieldError>
      {match ? <p className="fx-help">{t("form.typeExists", { type: match })}</p> : typing ? <p className="fx-help">{t("form.typeNewHint")}</p> : null}
    </div>
  );
}
