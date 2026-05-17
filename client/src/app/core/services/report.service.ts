import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface FinancialReportData {
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  taxPaid: number;
  transactions: any[];
}

export interface MonthlyBreakdown {
  labels: string[];
  datasets: {
    data: number[];
    label: string;
    backgroundColor: string;
    borderColor: string;
    fill: boolean;
  }[];
}

export interface InsightRequest {
  income: number;
  expenses: number;
  transactions: any[];
  regime?: string;
}

export interface InsightResponse {
  insights: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private http = inject(HttpClient);
  private apiUrl = '/api/v1/financial-reports';

  getFinancialReport(): Observable<FinancialReportData> {
    return this.http.get<FinancialReportData>(`${this.apiUrl}/dashboard/summary`);
  }

  getMonthlyBreakdown(): Observable<MonthlyBreakdown> {
    return this.http.get<MonthlyBreakdown>(`${this.apiUrl}/dashboard/monthly`);
  }

  getAIInsights(data: InsightRequest): Observable<InsightResponse> {
    return this.http.post<InsightResponse>(`${this.apiUrl}/insights`, data);
  }

  downloadPDF(data: FinancialReportData, userName: string = 'User') {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.text('Financial Report', 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Generated for: ${userName}`, 14, 32);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 38);

    // Summary Section
    doc.setFontSize(14);
    doc.text('Summary', 14, 50);
    
    autoTable(doc, {
      startY: 55,
      head: [['Metric', 'Amount']],
      body: [
        ['Total Income', `$${data.totalIncome.toFixed(2)}`],
        ['Total Expenses', `$${data.totalExpense.toFixed(2)}`],
        ['Net Profit', `$${data.netProfit.toFixed(2)}`],
        ['Tax Paid', `$${data.taxPaid.toFixed(2)}`]
      ],
      theme: 'grid',
      headStyles: { fillColor: [101, 110, 211] }
    });

    // Transactions Section
    const finalY = (doc as any).lastAutoTable.finalY || 55;
    
    doc.setFontSize(14);
    doc.text('Recent Transactions', 14, finalY + 15);

    const tableData = data.transactions.map(t => [
      new Date(t.date).toLocaleDateString(),
      t.description || t.title || t.source || t.category || 'N/A',
      t.type || (t.amount > 0 ? 'Income' : 'Expense'),
      `$${Math.abs(t.amount).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: finalY + 20,
      head: [['Date', 'Description', 'Type', 'Amount']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [40, 40, 40] }
    });

    doc.save('Financial_Report.pdf');
  }

  exportExcel(data: FinancialReportData) {
    // Summary Sheet
    const summaryData = [
      ['Metric', 'Amount'],
      ['Total Income', data.totalIncome],
      ['Total Expenses', data.totalExpense],
      ['Net Profit', data.netProfit],
      ['Tax Paid', data.taxPaid]
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

    // Transactions Sheet
    const txData = data.transactions.map(t => ({
      Date: new Date(t.date).toLocaleDateString(),
      Description: t.description || t.title || t.source || t.category || 'N/A',
      Type: t.type || (t.amount > 0 ? 'Income' : 'Expense'),
      Amount: Math.abs(t.amount)
    }));
    const txSheet = XLSX.utils.json_to_sheet(txData);

    // Create Workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
    XLSX.utils.book_append_sheet(wb, txSheet, 'Transactions');

    // Save
    XLSX.writeFile(wb, 'Financial_Report.xlsx');
  }
}
