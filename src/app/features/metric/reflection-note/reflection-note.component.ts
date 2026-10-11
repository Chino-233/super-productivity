import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  signal,
} from '@angular/core';
import { toObservable, toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, take } from 'rxjs/operators';
import { MetricCopy } from '../metric.model';
import { MetricService } from '../metric.service';
import { GlobalTrackingIntervalService } from '../../../core/global-tracking-interval/global-tracking-interval.service';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import {
  ReflectionHistoryDialogComponent,
  ReflectionHistoryItem,
} from './reflection-history-dialog.component';
import { DEFAULT_METRIC_FOR_DAY } from '../metric.const';
import { T } from '../../../t.const';

@Component({
  selector: 'reflection-note',
  templateUrl: './reflection-note.component.html',
  styleUrls: ['./reflection-note.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    CdkTextareaAutosize,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslatePipe,
  ],
})
export class ReflectionNoteComponent implements OnDestroy {
  private readonly _metricService = inject(MetricService);
  private readonly _globalTrackingIntervalService = inject(GlobalTrackingIntervalService);
  private readonly _translate = inject(TranslateService);
  private readonly _matDialog = inject(MatDialog);

  readonly dayStr = input<string | null>(null);
  readonly T = T;

  private readonly _placeholderKeys: string[] = [
    T.F.METRIC.REFLECTION.PLACEHOLDER_1,
    T.F.METRIC.REFLECTION.PLACEHOLDER_2,
    T.F.METRIC.REFLECTION.PLACEHOLDER_3,
    T.F.METRIC.REFLECTION.PLACEHOLDER_4,
    T.F.METRIC.REFLECTION.PLACEHOLDER_5,
  ];
  readonly placeholder = signal<string>(this._pickRandomPlaceholder());

  private readonly _resolvedDay = computed(
    () => this.dayStr() ?? this._globalTrackingIntervalService.todayDateStr(),
  );

  private readonly _day$ = toObservable(this._resolvedDay).pipe(distinctUntilChanged());
  private readonly _metricForDay = toSignal(
    this._day$.pipe(
      switchMap((day) => {
        this.flushPendingChanges();
        return this._metricService.getMetricForDay$(day);
      }),
    ),
    { initialValue: { id: '', ...DEFAULT_METRIC_FOR_DAY } as MetricCopy },
  );

  private readonly _storedText = computed(() => {
    return this._metricForDay()?.reflections?.[0]?.text ?? '';
  });

  // Local input text for textarea binding - prevents trimmed store value from overwriting user input
  readonly inputText = signal('');

  private readonly _reflectionChanges$ = new Subject<string>();
  private _lastUserInput = '';
  private _pending: { day: string; value: string } | null = null;
  private _historyDialog: MatDialogRef<ReflectionHistoryDialogComponent> | null = null;

  constructor() {
    this._reflectionChanges$
      .pipe(debounceTime(500), takeUntilDestroyed())
      .subscribe(() => this.flushPendingChanges());

    this._translate.onLangChange
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.placeholder.set(this._pickRandomPlaceholder()));

    // Sync inputText from store only when:
    // 1. Day changes (navigation)
    // 2. External update that differs from user's input (e.g., sync)
    effect(() => {
      const storedText = this._storedText();
      if (this._pending) return;
      const userInputTrimmed = this._lastUserInput.trim();

      // Only update if stored text differs from what user typed (after trim comparison)
      // This prevents the store's trimmed value from overwriting user's trailing spaces
      if (storedText !== userInputTrimmed) {
        this.inputText.set(storedText);
        this._lastUserInput = storedText;
      }
    });
  }

  onReflectionChange(value: string): void {
    const v = value ?? '';
    this._lastUserInput = v;
    this.inputText.set(v);
    this._pending = { day: this._resolvedDay(), value: v };
    this._reflectionChanges$.next(v);
  }

  ngOnDestroy(): void {
    this.closeExpandedViews();
  }

  closeExpandedViews(): void {
    this.flushPendingChanges();
    this._historyDialog?.close();
    this._historyDialog = null;
  }

  flushPendingChanges(): void {
    const pending = this._pending;
    if (!pending) return;
    this._pending = null;
    // Read the current day's metric so a delayed reflection cannot revert newer notes.
    this._metricService
      .getMetricForDay$(pending.day)
      .pipe(take(1))
      .subscribe((metric) => {
        const trimmed = pending.value.trim();
        const existing = metric.reflections?.[0];
        if ((existing?.text ?? '') === trimmed) return;
        this._metricService.upsertMetric({
          ...metric,
          reflections: trimmed
            ? [{ text: trimmed, created: existing?.created ?? Date.now() }]
            : [],
        });
      });
  }

  async openHistory(): Promise<void> {
    this.flushPendingChanges();
    const metrics =
      (await this._metricService.getAllMetrics$().pipe(take(1)).toPromise()) ?? [];
    const entries = metrics
      .map((metric) => {
        const reflection = metric.reflections?.[0];
        const text = reflection?.text?.trim();
        if (!text) {
          return null;
        }
        return {
          day: metric.id,
          text,
          created: reflection?.created ?? this._dayToTimestamp(metric.id),
        } as ReflectionHistoryItem;
      })
      .filter((entry): entry is ReflectionHistoryItem => !!entry);

    const sortedEntries = entries.sort((a, b) => b.created - a.created);

    this._historyDialog = this._matDialog.open(ReflectionHistoryDialogComponent, {
      data: { entries: sortedEntries },
      width: '520px',
    });
  }

  private _dayToTimestamp(dayStr: string): number {
    return this._createLocalDateFromDay(dayStr).getTime();
  }

  private _createLocalDateFromDay(dayStr: string): Date {
    const [year, month, day] = dayStr
      .split('-')
      .map((value) => Number.parseInt(value, 10));
    return new Date(year, (month || 1) - 1, day || 1);
  }

  private _pickRandomPlaceholder(): string {
    const key =
      this._placeholderKeys[
        Math.floor(Math.random() * Math.max(this._placeholderKeys.length, 1))
      ];
    return this._translate.instant(key);
  }
}
