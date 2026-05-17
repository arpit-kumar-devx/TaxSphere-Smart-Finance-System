import { Component, Input, Output, EventEmitter, OnInit, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  CdkDragDrop, 
  CdkDropList, 
  CdkDrag, 
  moveItemInArray, 
  transferArrayItem,
  DragDropModule
} from '@angular/cdk/drag-drop';
import { ItrRecord } from '../../../core/services/itr-api.service';
import { ItrStatus } from '../../../core/types/itr-status';

@Component({
  selector: 'app-ca-kanban',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  template: `
    <div class="kanban-board">
      <div class="kanban-column" *ngFor="let col of columns">
         <div class="col-header">
            <h3>{{ col.name }} <span class="count">{{ col.items.length }}</span></h3>
         </div>
         
         <div 
           cdkDropList 
           #colList="cdkDropList"
           [id]="col.status"
           [cdkDropListData]="col.items"
           [cdkDropListConnectedTo]="connectedTo"
           class="item-list"
           (cdkDropListDropped)="drop($event)">
           
           <div class="kanban-item card" *ngFor="let item of col.items" cdkDrag [cdkDragData]="item">
              <div class="item-header">
                 <span class="ref">#{{ item._id.substring(item._id.length-6) }}</span>
                 <span class="type-tag">{{ item.status.replace('_', ' ') }}</span>
              </div>
              <p class="summary">
                <strong>{{ item.personalInfo.firstName }} {{ item.personalInfo.lastName }}</strong><br>
                AY: {{ item.assessmentYear }} — ₹{{ item.income.totalIncome | number }}
              </p>
              <div class="item-footer">
                 <span class="time">Updated: {{ item.updatedAt | date:'shortTime' }}</span>
                 <div class="avatar-mini">{{ (item.personalInfo.firstName || 'C')[0] }}</div>
              </div>
              
              <!-- Drag Handle Mock -->
              <div class="drag-placeholder" *cdkDragPlaceholder></div>
           </div>
           
           <div class="empty-col" *ngIf="col.items.length === 0">No cases here.</div>
         </div>
      </div>
    </div>
  `,
  styles: [`
    .kanban-board { 
        display: flex; gap: 1.5rem; overflow-x: auto; padding: 1rem 0; height: calc(100vh - 250px);
        min-height: 500px;
    }
    
    .kanban-column { 
        flex: 1; min-width: 320px; max-width: 380px; background: rgba(30, 41, 59, 0.4); 
        border: 1px solid rgba(255,255,255,0.05); border-radius: 20px; display: flex; flex-direction: column;
        backdrop-filter: blur(10px);
    }
    
    .col-header { padding: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .col-header h3 { font-size: 1rem; font-weight: 700; margin: 0; display: flex; align-items: center; justify-content: space-between; }
    .count { background: rgba(99, 102, 241, 0.2); color: #818cf8; padding: 2px 10px; border-radius: 20px; font-size: 0.75rem; }

    .item-list { flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; min-height: 100px; }
    
    .kanban-item { 
        background: #1e293b; border: 1px solid rgba(255,255,255,0.05); padding: 1.25rem; 
        border-radius: 16px; transition: 0.2s; cursor: grab; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .kanban-item:active { cursor: grabbing; transform: scale(1.02); }
    .kanban-item:hover { border-color: #6366f1; }

    .item-header { display: flex; justify-content: space-between; margin-bottom: 0.75rem; }
    .ref { font-size: 0.7rem; color: #64748b; font-family: monospace; }
    .type-tag { font-size: 0.75rem; font-weight: 700; color: #10b981; text-transform: uppercase; }

    .summary { font-size: 0.85rem; color: #e2e8f0; margin-bottom: 1rem; line-height: 1.4; }
    
    .item-footer { display: flex; justify-content: space-between; align-items: center; }
    .time { font-size: 0.7rem; color: #475569; }
    
    .avatar-mini { width: 24px; height: 24px; border-radius: 50%; background: #334155; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 800; color: white; }

    .empty-col { text-align: center; color: #475569; font-size: 0.85rem; padding-top: 2rem; }
    .drag-placeholder { background: rgba(99, 102, 241, 0.1); border: 2px dashed #6366f1; height: 100px; border-radius: 16px; margin-bottom: 1rem; }
    
    .cdk-drag-preview { 
        box-shadow: 0 10px 40px rgba(0,0,0,0.5); border-radius: 16px; opacity: 1; 
        background-color: #334155 !important;
    }
  `]
})
export class KanbanBoardComponent implements OnInit, OnChanges {
  @Input() items: ItrRecord[] = [];
  @Output() statusChange = new EventEmitter<{ id: string, status: ItrStatus }>();

  columns: Array<{ name: string, status: ItrStatus, items: ItrRecord[] }> = [
    { name: 'Assigned', status: 'assigned', items: [] },
    { name: 'Under Review', status: 'under_review', items: [] },
    { name: 'Approved', status: 'approved', items: [] },
    { name: 'Filed', status: 'filed', items: [] }
  ];

  connectedTo = ['assigned', 'under_review', 'approved', 'filed'];

  ngOnInit() {
    this.distributeItems();
  }

  ngOnChanges() {
     this.distributeItems();
  }

  distributeItems() {
    this.columns.forEach(c => c.items = []);
    this.items.forEach(it => {
        const col = this.columns.find(c => c.status === it.status);
        if (col) col.items.push(it);
        else {
           // Handle logical mapping if status isn't exactly in columns
           if (['payment_pending', 'payment_completed'].includes(it.status)) {
              const approvedCol = this.columns.find(c => c.status === 'approved');
              if (approvedCol) approvedCol.items.push(it);
           } else if (it.status === 'submitted') {
              const assignedCol = this.columns.find(c => c.status === 'assigned');
              if (assignedCol) assignedCol.items.push(it);
           }
        }
    });
  }

  drop(event: CdkDragDrop<ItrRecord[]>) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      const item = event.item.data as ItrRecord;
      const newStatus = event.container.id as ItrStatus;
      this.statusChange.emit({ id: item._id, status: newStatus });
    }
  }
}
