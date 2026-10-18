// A small strict RFC 5545 reader for tests (no dependency): checks CRLF line
// ends, the 75-octet fold limit, BEGIN/END nesting, the required properties
// of VCALENDAR / VEVENT / VTIMEZONE and that every TZID parameter has its
// VTIMEZONE. Throws on the first problem; returns the component tree.

export type IcsProperty = { name: string; params: Record<string, string>; value: string };
export type IcsComponent = { name: string; props: IcsProperty[]; children: IcsComponent[] };

export function prop(c: IcsComponent, name: string): IcsProperty | undefined {
  return c.props.find((p) => p.name === name);
}

function parseLine(line: string): IcsProperty {
  // name *(";" param) ":" value — params may be quoted.
  let i = 0;
  let inQuote = false;
  for (; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    if (ch === ":" && !inQuote) break;
  }
  if (i >= line.length) throw new Error(`content line without ":": ${line}`);
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const [name, ...rawParams] = head.split(";");
  if (!/^[A-Z0-9-]+$/.test(name)) throw new Error(`bad property name: ${name}`);
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq < 1) throw new Error(`bad parameter: ${p}`);
    params[p.slice(0, eq)] = p.slice(eq + 1);
  }
  return { name, params, value };
}

export function parseIcs(text: string): IcsComponent {
  if (!text.endsWith("\r\n")) throw new Error("the file must end with CRLF");
  const physical = text.slice(0, -2).split("\r\n");
  const enc = new TextEncoder();
  for (const l of physical) {
    if (l.includes("\n") || l.includes("\r")) throw new Error("bare LF/CR inside a line");
    if (enc.encode(l).length > 75) throw new Error(`line longer than 75 octets: ${l}`);
  }
  const logical: string[] = [];
  for (const l of physical) {
    if (l.startsWith(" ") || l.startsWith("\t")) {
      if (logical.length === 0) throw new Error("continuation line first");
      logical[logical.length - 1] += l.slice(1);
    } else logical.push(l);
  }
  const stack: IcsComponent[] = [];
  let root: IcsComponent | null = null;
  for (const l of logical) {
    const p = parseLine(l);
    if (p.name === "BEGIN") {
      const c: IcsComponent = { name: p.value, props: [], children: [] };
      if (stack.length === 0) {
        if (root) throw new Error("more than one top-level component");
        root = c;
      } else stack[stack.length - 1].children.push(c);
      stack.push(c);
    } else if (p.name === "END") {
      const top = stack.pop();
      if (!top || top.name !== p.value) throw new Error(`END:${p.value} does not close ${top?.name}`);
    } else {
      if (stack.length === 0) throw new Error(`property outside a component: ${l}`);
      stack[stack.length - 1].props.push(p);
    }
  }
  if (stack.length > 0 || !root) throw new Error("unclosed component");
  validate(root);
  return root;
}

function need(c: IcsComponent, ...names: string[]) {
  for (const n of names) {
    const count = c.props.filter((p) => p.name === n).length;
    if (count !== 1) throw new Error(`${c.name} needs exactly one ${n} (has ${count})`);
  }
}

const DATE_TIME = /^\d{8}T\d{6}Z?$/;

function validate(cal: IcsComponent) {
  if (cal.name !== "VCALENDAR") throw new Error("top level must be VCALENDAR");
  need(cal, "VERSION", "PRODID");
  if (prop(cal, "VERSION")!.value !== "2.0") throw new Error("VERSION must be 2.0");
  const zones = new Set<string>();
  for (const c of cal.children) {
    if (c.name === "VTIMEZONE") {
      need(c, "TZID");
      zones.add(prop(c, "TZID")!.value);
      if (c.children.length === 0) throw new Error("VTIMEZONE needs STANDARD or DAYLIGHT");
      for (const sub of c.children) {
        if (sub.name !== "STANDARD" && sub.name !== "DAYLIGHT") throw new Error(`bad VTIMEZONE child ${sub.name}`);
        need(sub, "DTSTART", "TZOFFSETFROM", "TZOFFSETTO");
        if (!/^\d{8}T\d{6}$/.test(prop(sub, "DTSTART")!.value)) throw new Error("VTIMEZONE DTSTART must be local time");
        for (const k of ["TZOFFSETFROM", "TZOFFSETTO"]) {
          if (!/^[+-]\d{4}$/.test(prop(sub, k)!.value)) throw new Error(`bad ${k}`);
        }
      }
    }
  }
  const events = cal.children.filter((c) => c.name === "VEVENT");
  if (events.length === 0) throw new Error("no VEVENT");
  for (const e of events) {
    need(e, "UID", "DTSTAMP", "DTSTART");
    if (!/Z$/.test(prop(e, "DTSTAMP")!.value)) throw new Error("DTSTAMP must be UTC");
    if (e.props.some((p) => p.name === "DTEND") && e.props.some((p) => p.name === "DURATION")) {
      throw new Error("DTEND and DURATION together");
    }
    for (const p of e.props) {
      if (p.params.TZID && !zones.has(p.params.TZID)) throw new Error(`TZID ${p.params.TZID} has no VTIMEZONE`);
      if ((p.name === "DTSTART" || p.name === "DTEND") && !DATE_TIME.test(p.value)) throw new Error(`bad ${p.name} ${p.value}`);
    }
  }
}

/** UTC offset (minutes) that the VTIMEZONE gives for a local time "YYYYMMDDTHHMMSS". */
export function offsetFromVtimezone(tz: IcsComponent, local: string): number {
  const toMin = (s: string) => (s.startsWith("-") ? -1 : 1) * (Number(s.slice(1, 3)) * 60 + Number(s.slice(3, 5)));
  const subs = [...tz.children].sort((a, b) => prop(a, "DTSTART")!.value.localeCompare(prop(b, "DTSTART")!.value));
  let current = subs[0];
  for (const s of subs) if (prop(s, "DTSTART")!.value <= local) current = s;
  return toMin(prop(current, "TZOFFSETTO")!.value);
}
