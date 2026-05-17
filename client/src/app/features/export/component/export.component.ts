import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { ExportService, PreviewRequest } from '../../../core/services/export.service';
import { AuthService } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';


@Component({
  selector: 'app-export',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './export.component.html',
  styleUrls: ['./export.component.css']
})
export class ExportComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private exportSvc = inject(ExportService);
  private sanitizer = inject(DomSanitizer);

  public auth = inject(AuthService);
  public layout = inject(LayoutService);

  showBudget = false;

  id?: string;
  type: string = 'income-statement';
  period: string = 'current-month';
  format: 'pdf' | 'csv' | 'xlsx' = 'pdf';

  loading = true;
  errorMsg = '';

  previewUrl?: SafeResourceUrl;
  previewFilename = 'report.pdf';
  previewable = true;

  constructor() { }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      this.id = params.get('id') || undefined;
      this.type = (params.get('type') || 'income-statement');
      this.period = (params.get('period') || 'current-month');
      this.format = (params.get('format') as any) || 'pdf';
      this.loadPreview();
    });
  }

  openBudget() { this.showBudget = true; }
  closeBudget() { this.showBudget = false; }

  onClose() {
    if (history.length > 1) this.location.back();
    else this.router.navigate(['/financial-reports']);
  }

  loadPreview() {
    this.loading = true;
    const req: PreviewRequest = {
      id: this.id,
      reportType: this.type as any,
      period: this.period as any,
      format: this.format
    };
    this.exportSvc.preview(req).subscribe({
      next: (res) => {
        this.previewFilename = res.filename;
        if (res.mimeType === 'application/pdf' && res.base64) {
          const url = `data:${res.mimeType};base64,${res.base64}`;
          this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
          this.previewable = true;
        } else {
          this.previewUrl = undefined;
          this.previewable = false;
        }
        this.loading = false;
      },
      error: (e) => {
        this.errorMsg = e?.error?.message || 'Failed to build preview';
        this.loading = false;
      }
    });
  }

  print() {
    if (!this.previewUrl) return;
    window.open((this.previewUrl as any).changingThisBreaksApplicationSecurity, '_blank');
  }

  download() {
    this.exportSvc.download({
      id: this.id,
      reportType: this.type as any,
      period: this.period as any,
      format: this.format
    }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.previewFilename || `report.${this.format}`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => this.errorMsg = e?.error?.message || 'Download failed'
    });
  }
}

