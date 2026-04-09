interface TableProps {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export function Table({ headers, rows }: TableProps): React.JSX.Element {
  return (
    <div className="overflow-x-auto my-6 rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-800/50 border-b border-white/10">
            {headers.map((header) => (
              <th key={header} className="text-left px-4 py-3 text-blue-200/60 font-medium uppercase tracking-wider text-xs">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-white/5 hover:bg-white/5 transition-colors">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 text-blue-100/70">
                  {cell.startsWith("`") && cell.endsWith("`") ? (
                    <code className="text-cyan-300 font-mono text-xs bg-cyan-500/10 px-1.5 py-0.5 rounded">
                      {cell.slice(1, -1)}
                    </code>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
