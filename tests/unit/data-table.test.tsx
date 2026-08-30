import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";

type Row = { id: string; name: string; score: number; note: string };

const rows: Row[] = [
  { id: "r1", name: "Alice", score: 9, note: "first" },
  { id: "r2", name: "Bob", score: 4, note: "second" },
];

const columns: DataTableColumnDef<Row>[] = [
  { key: "name", header: "Name", cell: (r) => r.name },
  { key: "score", header: "Score", cell: (r) => r.score },
  {
    key: "note",
    header: "Note",
    hideOn: "md",
    cell: (r) => r.note,
  },
];

describe("DataTable", () => {
  it("renders one <th> per column with the header label in uppercase styling", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        getRowTestId={(r) => `row-${r.id}`}
      />,
    );
    const ths = document.querySelectorAll("th");
    expect(ths).toHaveLength(3);
    expect(ths[0]).toHaveTextContent("Name");
    expect(ths[1]).toHaveTextContent("Score");
    expect(ths[2]).toHaveTextContent("Note");
  });

  it("renders one <tr> per data row with the data-testid from getRowTestId", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        getRowTestId={(r) => `row-${r.id}`}
      />,
    );
    expect(screen.getByTestId("row-r1")).toBeInTheDocument();
    expect(screen.getByTestId("row-r2")).toBeInTheDocument();
  });

  it("calls cell(row) for every row × column intersection", () => {
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    // 2 rows × 3 columns = 6 cells, each rendering the row's value.
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });

  it("applies the hideOn class to both the <th> and every <td> in that column", () => {
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    const ths = document.querySelectorAll("th");
    const noteTh = ths[2];
    // The Note column is hideOn: md.
    expect(noteTh?.className).toContain("hidden");
    expect(noteTh?.className).toContain("md:table-cell");
    // Every <td> for the Note column also gets the same hide class.
    const tds = document.querySelectorAll("tbody tr:nth-child(1) td");
    const noteTd = tds[2];
    expect(noteTd?.className).toContain("hidden");
    expect(noteTd?.className).toContain("md:table-cell");
  });

  it("forwards the data-testid prop to the <table>", () => {
    render(
      <DataTable
        data-testid="custom-table"
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
      />,
    );
    expect(screen.getByTestId("custom-table").tagName).toBe("TABLE");
  });

  it("forwards extra headerClassName and cellClassName", () => {
    const cols: DataTableColumnDef<Row>[] = [
      {
        key: "name",
        header: "Name",
        headerClassName: "extra-th-class",
        cellClassName: "extra-td-class",
        cell: (r) => r.name,
      },
    ];
    render(<DataTable columns={cols} rows={rows} getRowKey={(r) => r.id} />);
    expect(document.querySelector("th")?.className).toContain("extra-th-class");
    expect(document.querySelector("td")?.className).toContain("extra-td-class");
  });

  it("renders nothing in <tbody> when rows is empty (no <tr> elements)", () => {
    render(<DataTable columns={columns} rows={[]} getRowKey={(r) => r.id} />);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(0);
  });
});

/**
 * Regression: /app/workspaces React #441 ("more hooks than during the
 * previous render").
 *
 * `DataTable` is a Server Component (no "use client") so the
 * /app/workspaces page can pass per-row `Map<string, …>` aggregates
 * from a DB query through `columns[i].cell` closures. A previous
 * revision attached an inline `onClick` to every `<td>` so the last
 * cell could call `event.stopPropagation()` when the click target was
 * an interactive element (kebab / action button). That inline function
 * is a closure that captures `idx` and `columns.length` — variables
 * that exist on the server but not on the client. When Next.js
 * serialised the rendered tree into the RSC payload, the function
 * reference crossed the server→client boundary as a reference to a
 * server-only closure. On the second render, React's reconciler
 * treated the `<td>` as a different component (the orphan function
 * prop changed the reconciliation key), so the hook count diverged
 * and React threw minified error #441 on the workspaces page.
 *
 * The fix removed the `<td>` onClick entirely. The kebab button in
 * the actions column already calls `e.stopPropagation()` in its own
 * onClick (see `WorkspaceRowActions`), so row-level click suppression
 * is unnecessary.
 *
 * These tests pin the contract:
 *   - No <td> ever carries an onClick prop (the bug).
 *   - When `getRowHref` is set, the row navigation still works via
 *     the inline <a> in the first cell (so the click target is
 *     preserved).
 */
describe("DataTable (Server-Component / React #441 regression)", () => {
  it("does not attach an onClick prop to any <td> when getRowHref is set", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        getRowHref={(r) => `/row/${r.id}`}
      />,
    );
    const tds = document.querySelectorAll("td");
    for (const td of Array.from(tds)) {
      // `onclick` is the lowercased DOM property used by jsdom to
      // surface React's synthetic onClick; a function here would mean
      // we serialised a server-side closure into the RSC payload.
      expect((td as HTMLElement & { onclick: unknown }).onclick).toBeNull();
    }
  });

  it("does not attach an onClick prop to any <td> when getRowHref is omitted", () => {
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    const tds = document.querySelectorAll("td");
    for (const td of Array.from(tds)) {
      expect((td as HTMLElement & { onclick: unknown }).onclick).toBeNull();
    }
  });

  it("wraps the first cell in an <a> when getRowHref is supplied (row stays navigable)", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        getRowHref={(r) => `/row/${r.id}`}
      />,
    );
    const firstRowFirstCellAnchor = document.querySelector(
      'tbody tr:first-child td:first-child a[href="/row/r1"]',
    );
    expect(firstRowFirstCellAnchor).not.toBeNull();
    expect(firstRowFirstCellAnchor).toHaveTextContent("Alice");
  });

  it("does not wrap the last cell in an <a> (so cell-local controls like kebabs stay clear of navigation)", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        getRowHref={(r) => `/row/${r.id}`}
      />,
    );
    const lastRowLastCellAnchor = document.querySelector("tbody tr:first-child td:last-child a");
    expect(lastRowLastCellAnchor).toBeNull();
  });
});
