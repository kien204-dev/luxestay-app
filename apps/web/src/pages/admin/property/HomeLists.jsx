import { useTranslation } from "react-i18next";
import AxIcon from "../../../components/admin/AxIcon";
import { FieldError } from "../../../components/auth/fields";

// The two lists of the home page and the texts of each row, in the order
// they are typed. Limits match the API's (settingsController.js).
const LISTS = [
  {
    key: "amenities",
    maxRows: 12,
    columns: [
      { key: "name", label: "amenityName", maxLength: 80 },
      { key: "description", label: "amenityDescription", maxLength: 160 },
    ],
  },
  {
    key: "nearbyPlaces",
    maxRows: 8,
    columns: [
      { key: "name", label: "placeName", maxLength: 80 },
      { key: "note", label: "placeNote", maxLength: 120 },
      { key: "distance", label: "placeDistance", maxLength: 30, narrow: true },
    ],
  },
];

const hasText = (row) => Object.values(row).some((value) => String(value || "").trim());

// Rows of short texts with add, remove and move up/down. Every box carries
// its own label for screen readers; the column names sit above the rows.
function ListEditor({ list, rows, error, onChange }) {
  const { t } = useTranslation("property");
  const setCell = (index, key, value) => onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  const move = (index, by) => {
    const next = [...rows];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  };
  const emptyRow = Object.fromEntries(list.columns.map((column) => [column.key, ""]));
  const firstWrong = error ? rows.findIndex((row) => hasText(row) && !String(row.name || "").trim()) : -1;
  const errorId = `property-${list.key}-error`;

  return (
    <fieldset className="ax-hlist" data-testid={`home-${list.key}`}>
      <legend className="g-label">{t(`home.${list.key}`)}</legend>
      <p className="fx-help">{t(`home.${list.key}Hint`, { count: rows.length, max: list.maxRows })}</p>
      {rows.length > 0 && (
        <ol className="ax-hlist__rows">
          {rows.map((row, index) => (
            <li key={index} className="ax-hlist__row">
              <span className="ax-hlist__n" aria-hidden="true">{index + 1}</span>
              {list.columns.map((column) => {
                const wrong = index === firstWrong && column.key === "name";
                return (
                  <div key={column.key} className={`fx-control${column.narrow ? " is-narrow" : ""}${wrong ? " is-invalid" : ""}`}>
                    <input
                      id={wrong ? `property-${list.key}` : undefined}
                      aria-label={t("home.rowField", { label: t(`home.${column.label}`), index: index + 1 })}
                      aria-invalid={wrong || undefined}
                      aria-describedby={wrong ? errorId : undefined}
                      placeholder={t(`home.${column.label}`)}
                      maxLength={column.maxLength}
                      value={row[column.key] ?? ""}
                      onChange={(event) => setCell(index, column.key, event.target.value)}
                    />
                  </div>
                );
              })}
              <span className="ax-hlist__tools">
                <button type="button" className="ax-iconbtn" aria-label={t("home.moveUp", { index: index + 1 })} disabled={index === 0} onClick={() => move(index, -1)}>
                  <AxIcon name="chevronUp" small />
                </button>
                <button type="button" className="ax-iconbtn" aria-label={t("home.moveDown", { index: index + 1 })} disabled={index === rows.length - 1} onClick={() => move(index, 1)}>
                  <AxIcon name="chevronDown" small />
                </button>
                <button type="button" className="ax-iconbtn is-danger" aria-label={t("home.removeRow", { index: index + 1 })} onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                  <AxIcon name="trash" small />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <FieldError id={errorId}>{error}</FieldError>
      <div>
        <button type="button" className="g-btn g-btn--outline g-btn--small" disabled={rows.length >= list.maxRows} onClick={() => onChange([...rows, emptyRow])}>
          <AxIcon name="plus" small />
          {t("home.addRow")}
        </button>
      </div>
    </fieldset>
  );
}

// What the home page's Amenities and Location sections list. An empty
// list hides its section on the guest site.
export default function HomeLists({ form, errors, onChange }) {
  return LISTS.map((list) => <ListEditor key={list.key} list={list} rows={form[list.key]} error={errors[list.key]} onChange={(rows) => onChange(list.key, rows)} />);
}
