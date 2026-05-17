import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ca-topbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ca-topbar.component.html',
  styleUrls: ['./ca-topbar.component.css'],
})
export class CaTopbarComponent {
  @Output() menuToggle = new EventEmitter<void>();
  @Output() logoutClick = new EventEmitter<void>();
}
