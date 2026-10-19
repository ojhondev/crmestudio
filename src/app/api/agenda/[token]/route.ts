import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resolvePermissions } from "@/lib/permissions";

/** Feed iCalendar (RFC 5545) — assinatura no Google Agenda / Apple / Outlook. */
export async function GET(_: Request, ctx: RouteContext<"/api/agenda/[token]">) {
  const { token } = await ctx.params;
  const clean = token.replace(/\.ics$/, "");
  const [user] = await db
    .select({ id: schema.users.id, role: schema.users.role, active: schema.users.active, profile: schema.users.profile, permissions: schema.users.permissions, ownOnly: schema.users.ownOnly })
    .from(schema.users)
    .where(eq(schema.users.calendarToken, clean))
    .limit(1);
  if (!user || !user.active || resolvePermissions(user).agenda === "none") return new Response("Not found", { status: 404 });

  const since = new Date(Date.now() - 90 * 864e5);
  const rows = await db
    .select()
    .from(schema.events)
    .where(and(gte(schema.events.endsAt, since), user.ownOnly && user.role !== "admin" ? eq(schema.events.userId, user.id) : undefined));

  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d).replace(/-/g, "");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Estudio Restaura//Restaura App//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Estúdio Restaura",
    "X-WR-TIMEZONE:America/Sao_Paulo",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const e of rows) {
    lines.push("BEGIN:VEVENT", `UID:${e.id}@restaura`, `DTSTAMP:${stamp(e.createdAt)}`);
    if (e.allDay) {
      const endExclusive = new Date(e.endsAt.getTime() + 1000);
      lines.push(`DTSTART;VALUE=DATE:${day(e.startsAt)}`, `DTEND;VALUE=DATE:${day(endExclusive)}`);
    } else {
      lines.push(`DTSTART:${stamp(e.startsAt)}`, `DTEND:${stamp(e.endsAt)}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  // dobra linhas >75 octetos conforme a RFC
  const folded = lines
    .map((l) => {
      const out: string[] = [];
      let rest = l;
      while (Buffer.byteLength(rest) > 74) {
        let cut = 74;
        while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--;
        out.push(rest.slice(0, cut));
        rest = " " + rest.slice(cut);
      }
      out.push(rest);
      return out.join("\r\n");
    })
    .join("\r\n");

  return new Response(folded + "\r\n", {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="estudio-restaura.ics"',
      "cache-control": "no-store",
    },
  });
}
