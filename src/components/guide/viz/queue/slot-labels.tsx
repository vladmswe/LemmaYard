// Pointer names written under a row cell (below its index label). Each name
// has its own line ("head" / "front" first, "tail" / "back" second), so two
// names on the same or on neighbouring cells never overlap.
export const LABEL_SPACE = 16 * 2 + 4;

export function SlotLabels({ lines, x, y }: { lines: readonly [string | null, string | null]; x: number; y: number }) {
  return (
    <>
      {lines.map((name, k) =>
        name ? (
          <text key={name} className="viz-pointer" data-pointer={name} x={x} y={y + 13 + 16 * k} textAnchor="middle">
            {name}
          </text>
        ) : null,
      )}
    </>
  );
}
