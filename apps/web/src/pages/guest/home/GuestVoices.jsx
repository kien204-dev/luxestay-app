import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatRating, initialsOf } from "../../../components/RoomReviews";
import StarRating from "../../../components/StarRating";
import GuestIcon from "../../../components/guest/icons";

// What guests wrote: the score across every visible review, and the best
// ones with a comment, one at a time. `reviews` is the API's
// /reviews/featured answer, or null while there are too few reviews (see
// Home.jsx); with nothing to quote the section is left out.
export default function GuestVoices({ reviews }) {
  const { t, i18n } = useTranslation("site");
  const [index, setIndex] = useState(0);
  const quotes = reviews?.data || [];
  if (quotes.length === 0) return null;

  const current = Math.min(index, quotes.length - 1);
  const review = quotes[current];
  const step = (by) => setIndex((current + by + quotes.length) % quotes.length);
  const stayed = new Date(review.created_at).toLocaleDateString(i18n.language === "en" ? "en-US" : "vi-VN", {
    month: "long",
    year: "numeric",
  });

  return (
    <section className="guest-section home-voices" data-testid="guest-voices">
      <div className="guest-container home-voices-grid">
        <div className="home-voices-summary">
          <p className="guest-eyebrow">{t("home.voices.eyebrow")}</p>
          <h2 className="sr-only">{t("home.voices.title")}</h2>
          <p className="home-voices-score">
            <b>{formatRating(reviews.averageRating, i18n.language)}</b>
            <span>/ 5</span>
          </p>
          <StarRating value={reviews.averageRating} size={18} />
          <p className="guest-muted">{t("reviews.count", { count: reviews.totalReviews })}</p>
        </div>

        <div className="home-voices-main">
          <div aria-live="polite" style={{ display: "contents" }}>
            <blockquote>{review.comment}</blockquote>
            <div className="home-voices-guest">
              <span aria-hidden="true">{initialsOf(review.reviewer_name)}</span>
              <div>
                <b>{review.reviewer_name}</b>
                <small>{[review.room_name, stayed].filter(Boolean).join(" · ")}</small>
              </div>
            </div>
          </div>

          {quotes.length > 1 && (
            <div className="home-voices-nav">
              <div className="home-voices-dots" aria-hidden="true">
                {quotes.map((quote, i) => (
                  <i key={quote.id} className={i === current ? "is-on" : ""} />
                ))}
              </div>
              <span className="sr-only">{t("home.voices.position", { current: current + 1, total: quotes.length })}</span>
              <div className="home-voices-buttons">
                <button type="button" aria-label={t("home.voices.previous")} onClick={() => step(-1)}>
                  <GuestIcon.Previous />
                </button>
                <button type="button" aria-label={t("home.voices.next")} onClick={() => step(1)}>
                  <GuestIcon.Next />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
