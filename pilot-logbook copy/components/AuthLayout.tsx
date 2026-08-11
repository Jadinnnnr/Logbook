const FEATURES: [string, string][] = [
  ["Currency you can trust", "61.57 passenger and instrument currency, flight review, and every privilege level of your medical — each with the regulation it comes from."],
  ["Routes as you actually flew them", "Enter fixes, VORs, or an airway and the map draws the real path, not a straight line between airports."],
  ["Your logbook stays yours", "Everything lives in a file on your own machine. Import from ForeFlight, export to CSV whenever you like."],
  ["An honest proficiency check", "A plain-English estimate of where you're sharp and where you're rusty, with the maths shown."],
];

/** Split screen shared by sign-in and sign-up: product on the left, form on the right. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-hero">
        <div className="auth-brand">✈ Pilot Logbook</div>
        <h1 className="auth-headline">Every hour logged. Every deadline in view.</h1>
        <p className="auth-lede">
          A digital logbook that does the regulatory arithmetic for you, so the only question left
          is where you&rsquo;re flying next.
        </p>
        <ul className="auth-features">
          {FEATURES.map(([title, body]) => (
            <li key={title}>
              <strong>{title}</strong>
              <span>{body}</span>
            </li>
          ))}
        </ul>
        <p className="auth-disclaimer">
          A planning aid, not a legal record — always verify against the regulations and your
          official logbook.
        </p>
      </section>

      <section className="auth-form-col">{children}</section>
    </main>
  );
}
