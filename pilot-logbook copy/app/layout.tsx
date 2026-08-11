import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import SessionTimeout from "@/components/SessionTimeout";
import { getSessionUser } from "@/lib/auth";
import { CUSTOM_ACCENT } from "@/lib/theme";
import { deriveAccent, isHexColor } from "@/lib/color";

export const metadata: Metadata = {
  title: "Pilot Logbook",
  description: "Digital logbook for pilots — flights, totals, and FAA currency",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Rendered server-side from the signed-in user's saved preference, so the
  // chosen theme paints on first frame with no flash.
  const user = await getSessionUser();
  // A custom accent overrides the stylesheet's palette variables inline; the
  // rest of the CSS reads these the same way it reads a preset.
  const custom =
    user?.accent === CUSTOM_ACCENT && user.accent_custom && isHexColor(user.accent_custom)
      ? deriveAccent(user.accent_custom)
      : null;
  const style = custom
    ? ({
        "--a-light": custom.light,
        "--a-light-hover": custom.lightHover,
        "--a-dark": custom.dark,
        "--a-dark-hover": custom.darkHover,
      } as React.CSSProperties)
    : undefined;

  // Signed-out pages (login, register) always render dark.
  return (
    <html
      lang="en"
      data-theme={user?.theme ?? "dark"}
      data-accent={user?.accent ?? "blue"}
      style={style}
    >
      <body>
        <Nav />
        {children}
        {/* Only signed-in pages have a session to lose. */}
        {user && <SessionTimeout />}
      </body>
    </html>
  );
}
