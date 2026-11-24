// Lightweight stub for exceljs inside the single-file MCP App iframe bundle.
// Keeps ui://tinypivot/app.html ~1.2 MB lighter for strict MCP Apps hosts (Claude Desktop, Cursor).
export class Workbook {
  addWorksheet(): never {
    throw new Error('Excel (.xlsx) export is available in the TinyPivot React/Vue library; use CSV or MD export inside the MCP widget.')
  }
}

export default { Workbook }
