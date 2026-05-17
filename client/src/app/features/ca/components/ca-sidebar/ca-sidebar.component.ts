import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-ca-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './ca-sidebar.component.html',
  styleUrls: ['./ca-sidebar.component.css'],
})
export class CaSidebarComponent {
  @Input() user: any;
  @Output() navigate = new EventEmitter<void>();
}
