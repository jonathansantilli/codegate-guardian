/**
 * The Guardian mark.
 *
 * A shield with three bars cut out of it, bottom-aligned at differing
 * heights. The bars are the product's two ideas in one shape: a gate, and a
 * digest — identity here is the hash of an artifact's bytes, not its name.
 *
 * Drawn as a single even-odd path so the bars are knocked out of the solid
 * rather than stroked over it. Solid shapes survive being rendered at 16px in
 * a browser tab; hairlines do not. It carries no colour of its own — it takes
 * currentColor, which is what lets the same file serve the header, the
 * footer, the sign-in screen and the favicon.
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
        clipRule="evenodd"
        d="M12 2 L20.5 5.1 V12.3 C20.5 17 16.9 20.8 12 22.2 C7.1 20.8 3.5 17 3.5 12.3 V5.1 Z M7.6 11.2 h2.2 v5.2 h-2.2 Z M10.9 8.6 h2.2 v7.8 h-2.2 Z M14.2 12.6 h2.2 v3.8 h-2.2 Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}
