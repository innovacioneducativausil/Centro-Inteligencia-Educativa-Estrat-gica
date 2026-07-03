import ExcelJS from 'exceljs';

export interface ExcelColumnSpec {
  header: string;
  key: string;
  width?: number;
}

export interface ExcelSheetSpec {
  name: string;
  columns: ExcelColumnSpec[];
  rows: Record<string, unknown>[];
}

export async function downloadExcel(filename: string, sheets: ExcelSheetSpec[]): Promise<void> {
  const wb = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));
    ws.columns = sheet.columns;
    ws.addRows(sheet.rows);
    ws.getRow(1).font = { bold: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
