import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { JournalActivity, JournalActivityKind, JournalCategory } from './journal.model';
import { journalTime } from './journal.util';
import {
  journalDragRange,
  journalSelection,
  journalSlot,
  layoutJournalCalendar,
} from './journal-calendar.util';
import { T } from '../../t.const';

export interface JournalCalendarSelection {
  start: number;
  end: number;
  kind: JournalActivityKind;
}

interface CalendarGesture {
  pointerId: number;
  anchor: number;
  current: number;
  kind: JournalActivityKind;
  mode: 'select' | 'move' | 'start' | 'end';
  activity?: JournalActivity;
  moved: boolean;
}

@Component({
  selector: 'journal-calendar',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './journal-calendar.component.html',
  styleUrl: './journal-calendar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JournalCalendarComponent {
  readonly T = T;
  readonly activities = input.required<JournalActivity[]>();
  readonly categories = input.required<JournalCategory[]>();
  readonly kind = input<JournalActivityKind>('actual');
  readonly comparing = input(false);
  readonly selected = output<JournalCalendarSelection>();
  readonly edited = output<JournalActivity>();
  readonly changed = output<{ activity: JournalActivity; start: number; end: number }>();
  private readonly _grid = viewChild.required<ElementRef<HTMLElement>>('grid');
  private readonly _scroll = viewChild.required<ElementRef<HTMLElement>>('scroll');
  readonly gesture = signal<CalendarGesture | null>(null);
  readonly lanes = computed(() =>
    this.comparing() ? (['plan', 'actual'] as const) : [this.kind()],
  );
  readonly slots = Array.from({ length: 96 }, (_, index) => ({
    minute: index * 15,
    label: journalTime(index * 15),
    end: journalTime((index + 1) * 15),
    hour: index % 4 === 0,
  }));
  readonly preview = computed(() => {
    const gesture = this.gesture();
    if (!gesture) return null;
    const range =
      gesture.mode === 'select'
        ? journalSelection(gesture.anchor, gesture.current)
        : journalDragRange(
            gesture.activity!,
            gesture.current - gesture.anchor,
            gesture.mode,
          );
    return {
      ...range,
      kind: gesture.kind,
      label: `${journalTime(range.start)}—${journalTime(range.end)}`,
    };
  });
  readonly blocks = computed(() => {
    const layout = layoutJournalCalendar(this.activities());
    return this.activities().map((activity) => ({
      ...activity,
      left: (layout.get(activity.id)!.column / layout.get(activity.id)!.columns) * 100,
      right:
        ((layout.get(activity.id)!.columns - layout.get(activity.id)!.column - 1) /
          layout.get(activity.id)!.columns) *
        100,
      color:
        this.categories().find((c) => c.id === activity.categoryId)?.color ??
        'var(--c-primary)',
      time: `${journalTime(activity.start)}—${journalTime(activity.end)}`,
      top: (activity.start / 15) * 24,
      height: ((activity.end - activity.start) / 15) * 24,
    }));
  });

  constructor() {
    afterNextRender(() => this._scroll().nativeElement.scrollTo({ top: 8 * 96 }));
  }

  beginSelection(event: PointerEvent, minute: number, kind: JournalActivityKind): void {
    this._begin(event, {
      anchor: minute,
      current: minute,
      kind,
      mode: 'select',
      moved: false,
    });
  }

  beginActivity(
    event: PointerEvent,
    activity: JournalActivity,
    mode: 'move' | 'start' | 'end',
  ): void {
    this._begin(event, {
      anchor: this._minute(event),
      current: this._minute(event),
      kind: activity.kind,
      mode,
      activity,
      moved: false,
    });
  }

  move(event: PointerEvent): void {
    const gesture = this.gesture();
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const current = this._minute(event);
    this.gesture.set({
      ...gesture,
      current,
      moved: gesture.moved || Math.abs(current - gesture.anchor) >= 8,
    });
  }

  finish(event: PointerEvent): void {
    const gesture = this.gesture();
    const preview = this.preview();
    if (!gesture || !preview || gesture.pointerId !== event.pointerId) return;
    this.gesture.set(null);
    if (gesture.mode === 'select') this.selected.emit(preview);
    else if (!gesture.moved && gesture.mode === 'move')
      this.edited.emit(gesture.activity!);
    else if (gesture.moved)
      this.changed.emit({
        activity: gesture.activity!,
        start: preview.start,
        end: preview.end,
      });
  }

  cancel(): void {
    this.gesture.set(null);
  }

  keyboardSelect(event: MouseEvent, minute: number, kind: JournalActivityKind): void {
    if (event.detail === 0) this.selected.emit({ start: minute, end: minute + 15, kind });
  }

  keyboardEdit(event: MouseEvent, activity: JournalActivity): void {
    if (event.detail === 0) this.edited.emit(activity);
  }

  keyboardAdjust(
    event: KeyboardEvent,
    activity: JournalActivity,
    mode: 'move' | 'start' | 'end',
  ): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    event.stopPropagation();
    const range = journalDragRange(activity, event.key === 'ArrowUp' ? -15 : 15, mode);
    this.changed.emit({ activity, ...range });
  }

  private _begin(event: PointerEvent, gesture: Omit<CalendarGesture, 'pointerId'>): void {
    if (!event.isPrimary || event.button !== 0) return;
    if (event.pointerType !== 'touch' || gesture.mode !== 'select')
      event.preventDefault();
    event.stopPropagation();
    // Pointer capture and geometry are needed to finish drags outside a slot/block.
    this._grid().nativeElement.setPointerCapture(event.pointerId);
    this.gesture.set({ ...gesture, pointerId: event.pointerId });
  }

  private _minute(event: PointerEvent): number {
    const bounds = this._grid().nativeElement.getBoundingClientRect();
    const minute = ((event.clientY - bounds.top) / bounds.height) * 1440;
    return this.gesture()?.mode === 'select'
      ? journalSlot(minute)
      : Math.max(0, Math.min(1440, minute));
  }
}
