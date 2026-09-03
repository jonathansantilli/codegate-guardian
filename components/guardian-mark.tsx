/**
 * The Guardian mark.
 *
 * A solid dot set between two square brackets: an agent, in frame, accounted
 * for. Brackets are the developer's own punctuation; the dot inside is a thing
 * seen and in its place. That is what the product does — makes the invisible
 * inventory visible — and it is deliberately not a shield, a lock or an eye:
 * every security tool has one of those, and this one does not protect, it
 * reports.
 *
 * One solid path, no strokes, so it survives 16px in a browser tab. It carries
 * no colour of its own — it takes currentColor, which is what lets the same
 * shape serve the header, the footer, the sign-in screen and the favicon.
 */
export function GuardianMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9 3H4.5A1.5 1.5 0 0 0 3 4.5v15A1.5 1.5 0 0 0 4.5 21H9v-3H6V6h3V3Zm6 0h4.5A1.5 1.5 0 0 1 21 4.5v15a1.5 1.5 0 0 1-1.5 1.5H15v-3h3V6h-3V3ZM12 8.625a3.375 3.375 0 1 1 0 6.75 3.375 3.375 0 0 1 0-6.75Z"
        fill="currentColor"
      />
    </svg>
  );
}
