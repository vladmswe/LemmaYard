"use client";

export interface StateTableData {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}

/** "Show as table": the current state as a real data table. */
export function StateTable({ data }: { data: StateTableData }) {
  return (
    <div className="max-w-full overflow-x-auto" data-player-table="">
      <table className="w-full border-collapse text-sm">
        <caption className="pb-2 text-left font-medium">{data.caption}</caption>
        <thead>
          <tr>
            {data.columns.map((c) => (
              <th key={c} scope="col" className="border-b border-border px-2 py-1 text-left font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, r) => (
            // Table rows are text of one frame, not animated drawables: position keys are fine.
            <tr key={r}>
              {row.map((cell, k) => (
                <td key={data.columns[k] ?? k} className="border-b border-border px-2 py-1 font-mono">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
