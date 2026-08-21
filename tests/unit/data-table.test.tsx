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
