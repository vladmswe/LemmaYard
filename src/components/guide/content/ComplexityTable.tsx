import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ComplexityCell, ComplexityTableData } from "@/lib/guide/content/types";

/** "O(1) average" or "O(n) worst (if unbalanced)". */
export function formatCell(cell: ComplexityCell): string {
  return `${cell.bound} ${cell.q}${cell.cond ? ` (${cell.cond})` : ""}`;
}

/** "O(1) average · O(n) worst". */
export function formatCells(cells: readonly ComplexityCell[]): string {
  return cells.map(formatCell).join(" · ");
}

/** `<ComplexityTable id="heap-ops" />`, bound to the current lesson's complexity.ts. */
export function ComplexityTable({ table }: { table: ComplexityTableData }) {
  return (
    <div className="guide-complexity" data-complexity={table.id}>
      <Table containerClassName="guide-complexity-scroll">
        <TableCaption className="guide-complexity-caption">{table.caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Operation</TableHead>
            <TableHead scope="col">Cost</TableHead>
            <TableHead scope="col">Why</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row) => (
            <TableRow key={row.op}>
              <TableHead scope="row" className="guide-complexity-op" data-label="Operation">
                {row.op}
              </TableHead>
              <TableCell data-label="Cost" className="guide-complexity-cost">
                {row.cells.map((cell, i) => (
                  <span key={i} className="guide-complexity-cell">
                    {i > 0 && (
                      <span aria-hidden className="guide-complexity-sep">
                        {" · "}
                      </span>
                    )}
                    <span className="guide-complexity-bound">
                      <code>{cell.bound}</code> <span className="guide-complexity-q">{cell.q}</span>
                    </span>
                    {cell.cond && <span className="text-muted-foreground"> ({cell.cond})</span>}
                  </span>
                ))}
              </TableCell>
              <TableCell data-label="Why" className="guide-complexity-why">
                {row.why}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {(Boolean(table.space) || (table.notes?.length ?? 0) > 0) && (
        <ul className="guide-complexity-notes">
          {table.space && (
            <li>
              Space: <code>{table.space}</code>
            </li>
          )}
          {table.notes?.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}
