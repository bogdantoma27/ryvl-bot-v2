import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';

export interface MultiSelectOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-multi-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="multi-select">
      <button type="button" class="multi-select-toggle" (click)="toggleOpen()">
        <span class="truncate text-left">{{ summary() }}</span>
        <span>{{ open() ? 'Hide' : 'Select' }}</span>
      </button>
      @if (open()) {
        <div class="multi-select-list">
          @for (option of options; track option.value) {
            <label class="multi-select-item">
              <input type="checkbox" [checked]="selected.includes(option.value)" (change)="toggle(option.value, $any($event.target).checked)" />
              <span class="truncate">{{ option.label }}</span>
            </label>
          } @empty {
            <p class="lineup-empty-hint">{{ emptyText }}</p>
          }
        </div>
      }
    </div>
  `,
})
export class MultiSelectComponent {
  @Input() options: MultiSelectOption[] = [];
  @Input() selected: string[] = [];
  @Input() placeholder = 'Nothing selected';
  @Input() emptyText = 'No options available.';
  @Output() readonly selectedChange = new EventEmitter<string[]>();

  protected readonly open = signal(false);

  protected toggleOpen(): void {
    this.open.update(value => !value);
  }

  protected summary(): string {
    if (!this.selected.length) return this.placeholder;
    const labels = this.options.filter(option => this.selected.includes(option.value)).map(option => option.label);
    return labels.length ? labels.join(', ') : `${this.selected.length} selected`;
  }

  protected toggle(value: string, checked: boolean): void {
    const next = checked ? [...new Set([...this.selected, value])] : this.selected.filter(item => item !== value);
    this.selectedChange.emit(next);
  }
}
