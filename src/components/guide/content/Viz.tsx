import type { VizDefinition } from "@/lib/guide/contracts";
import { loadCodeBundle } from "@/server/guide/code";

/**
 * `<Viz def={heapInsert} id="heap-insert" code="heaps/min_heap" hint="..." />`
 * Server component: builds the default trace and the code bundle on the
 * server, then renders the structure's client player with them.
 */
export async function Viz<S, I>({
  def,
  id,
  code,
  hint,
}: {
  def: VizDefinition<S, I>;
  id: string;
  code?: string;
  hint?: string;
}) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`<Viz id="${id}">: use [a-z0-9-]+`);
  const input = def.model.defaultInput;
  const trace = def.model.generate(input);
  const bundle = code ? await loadCodeBundle(code) : undefined;
  const Client = def.Client;
  return (
    <div className="guide-wide" data-viz={def.model.id}>
      <Client playerId={id} vizId={def.model.id} initialInput={input} initialTrace={trace} code={bundle} hint={hint} />
    </div>
  );
}
