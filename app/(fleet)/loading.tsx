/**
 * Shown while a console screen resolves.
 *
 * Its presence also gives every route below a Suspense boundary, which is
 * what lets a screen read its own route parameters without blocking the
 * whole document from rendering.
 */
/** One per nav item, so the rail does not jump when the real nav arrives. */
const NAV_PLACEHOLDERS = [
  "overview",
  "machines",
  "inventory",
  "findings",
  "policies",
  "activity",
  "access",
];

export default function Loading() {
  return (
    <div className="gd">
      <aside className="side">
        <div className="brand">
          <div
            className="skel"
            style={{ width: "24px", height: "24px", borderRadius: "7px" }}
          />
          <div className="skel" style={{ width: "96px", height: "22px" }} />
        </div>
        <div className="nav">
          {NAV_PLACEHOLDERS.map((slot) => (
            <div
              className="skel"
              key={slot}
              style={{ height: "32px", margin: "1px 0" }}
            />
          ))}
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <div className="skel" style={{ width: "140px", height: "20px" }} />
        </header>
        <div className="body">
          <div className="skel" style={{ height: "72px" }} />
          <div className="skel" style={{ flex: 1, minHeight: "200px" }} />
        </div>
      </div>
    </div>
  );
}
