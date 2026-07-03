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

//----------------TI-44 / TI-59----------------
export async function downloadExcel(filename: string, sheets: ExcelSheetSpec[]): Promise<void> {
  const wb = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));
    ws.columns = sheet.columns;
    ws.addRows(sheet.rows);
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: 'middle', wrapText: true };
    ws.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true };
      });
      if (rowNumber > 1) {
        const values = Array.isArray(row.values) ? row.values.slice(1) : Object.values(row.values || {});
        const maxLength = Math.max(
          1,
          ...values.map(value => String(value ?? '').length)
        );
        row.height = Math.min(120, Math.max(18, Math.ceil(maxLength / 80) * 16));
      }
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
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
