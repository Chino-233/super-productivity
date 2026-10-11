import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { DateService } from '../../core/date/date.service';
import { JournalComponent } from './journal.component';
import { JournalService } from './journal.service';
import { JournalActivityTemplate, JournalCategory } from './journal.model';

describe('Journal closing persistence', () => {
  let component: JournalComponent;
  let service: {
    categories: ReturnType<typeof signal<JournalCategory[]>>;
    templates: ReturnType<typeof signal<JournalActivityTemplate[]>>;
    byDay: ReturnType<typeof signal<Record<string, never>>>;
    weekPlans: ReturnType<typeof signal<never[]>>;
    monthPlans: ReturnType<typeof signal<never[]>>;
    newId: jasmine.Spy;
    saveJournal: jasmine.Spy;
    saveCategories: jasmine.Spy;
    saveTemplates: jasmine.Spy;
    saveActivity: jasmine.Spy;
  };

  beforeEach(() => {
    service = {
      categories: signal([{ id: 'study', name: 'Study', color: '#123456' }]),
      templates: signal([{ id: 'reading', name: 'Reading' }]),
      byDay: signal({}),
      weekPlans: signal([]),
      monthPlans: signal([]),
      newId: jasmine.createSpy('newId').and.returnValue('new-activity'),
      saveJournal: jasmine.createSpy('saveJournal'),
      saveCategories: jasmine.createSpy('saveCategories'),
      saveTemplates: jasmine.createSpy('saveTemplates'),
      saveActivity: jasmine.createSpy('saveActivity').and.returnValue(null),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: JournalService, useValue: service },
        { provide: DateService, useValue: { todayStr: () => '2026-10-11' } },
        {
          provide: TranslateService,
          useValue: {
            onLangChange: new Subject(),
            instant: (key: string) => key,
          },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new JournalComponent());
    TestBed.flushEffects();
  });

  it('saves every dirty section and closes them even when clicking the current period', () => {
    component.text = 'Daily notes';
    component.plan = 'Daily plan';
    component.dirty.set(true);
    component.editCategories();
    component.categoryDraft![0].name = 'Research';
    component.editTemplates();
    component.templateDraft![0].note = 'Read slowly';
    component.toggleTemplateDetails('reading');
    component.editActivity();
    component.editor()!.title = 'Reading session';
    component.setPeriod('day');
    expect(service.saveJournal).toHaveBeenCalledWith(
      '2026-10-11',
      'day',
      'Daily notes',
      'Daily plan',
    );
    expect(service.saveCategories).toHaveBeenCalled();
    expect(service.saveTemplates).toHaveBeenCalled();
    expect(service.saveActivity).toHaveBeenCalledTimes(1);
    expect(component.editor()).toBeNull();
    expect(component.categoryDraft).toBeNull();
    expect(component.templateDraft).toBeNull();
    expect(component.expandedTemplates()).toEqual([]);
  });

  it('does not write unchanged editors or create an untouched blank activity', () => {
    component.editCategories();
    component.editTemplates();
    component.editActivity();
    expect(component.closeExpandedViews()).toBeTrue();
    expect(service.saveCategories).not.toHaveBeenCalled();
    expect(service.saveTemplates).not.toHaveBeenCalled();
    expect(service.saveActivity).not.toHaveBeenCalled();
  });

  it('keeps invalid activity edits and the date while saving valid journal content', () => {
    component.text = 'Keep this';
    component.dirty.set(true);
    component.editActivity();
    component.editor()!.title = 'Overlapping';
    service.saveActivity.and.returnValue({ code: 'OVERLAP', title: 'Existing entry' });
    component.changeDay('2026-10-12');
    expect(component.day()).toBe('2026-10-11');
    expect(component.editor()!.title).toBe('Overlapping');
    expect(component.error()).toContain('OVERLAP');
    expect(service.saveJournal).toHaveBeenCalled();
    service.saveActivity.and.returnValue(null);
    component.changeDay('2026-10-12');
    expect(component.day()).toBe('2026-10-12');
    expect(component.editor()).toBeNull();
    expect(service.saveJournal).toHaveBeenCalledTimes(1);
  });

  it('keeps a template saved from an activity when another template editor is open', () => {
    component.editTemplates();
    component.templateDraft![0].note = 'Changed preset';
    component.editActivity();
    component.editor()!.title = 'New preset';
    component.saveEditorTemplate();
    expect(service.saveTemplates).toHaveBeenCalledTimes(1);
    expect(service.saveTemplates.calls.mostRecent().args[0]).toEqual([
      { id: 'reading', name: 'Reading', note: 'Changed preset' },
      jasmine.objectContaining({ name: 'New preset', title: 'New preset' }),
    ]);
    component.closeExpandedViews();
    expect(service.saveTemplates).toHaveBeenCalledTimes(1);
  });

  it('does not replace an invalid activity draft when selecting another calendar slot', () => {
    component.editActivity();
    component.editor()!.title = 'Unfinished';
    component.editor()!.end = 'invalid time';
    service.saveActivity.and.returnValue({ code: 'INVALID_TIME' });
    component.selectCalendar({ start: 720, end: 735, kind: 'actual' });
    expect(component.editor()!.title).toBe('Unfinished');
    expect(component.editor()!.end).toBe('invalid time');
    expect(component.editor()!.start).toBe('09:00');
  });

  it('saves on template collapse and retains incomplete fields until corrected', () => {
    component.editTemplates();
    component.toggleTemplateDetails('reading');
    component.templateDraft![0].duration = 20;
    component.toggleTemplateDetails('reading');
    expect(component.expandedTemplates()).toEqual(['reading']);
    expect(service.saveTemplates).not.toHaveBeenCalled();
    component.templateDraft![0].duration = 30;
    component.toggleTemplateDetails('reading');
    expect(component.expandedTemplates()).toEqual([]);
    expect(service.saveTemplates).toHaveBeenCalledTimes(1);
    expect(component.templateDraft).not.toBeNull();
    component.closeExpandedViews();
    expect(service.saveTemplates).toHaveBeenCalledTimes(1);
  });

  it('prevents leaving with unnamed categories and preserves other valid sections', () => {
    component.editCategories();
    component.categoryDraft![0].name = '';
    component.editTemplates();
    component.templateDraft![0].name = 'New shortcut';
    expect(component.closeExpandedViews()).toBeFalse();
    expect(component.categoryError()).toContain('CATEGORY_NAME_REQUIRED');
    expect(component.templateDraft).not.toBeNull();
    expect(service.saveTemplates).toHaveBeenCalledTimes(1);
    component.categoryDraft![0].name = 'Research';
    expect(component.closeExpandedViews()).toBeTrue();
    expect(service.saveTemplates).toHaveBeenCalledTimes(1);
  });

  it('blocks browser dismissal for invalid edits and saves valid edits on dismissal', () => {
    component.editTemplates();
    component.templateDraft![0].name = '';
    const invalidEvent = {
      preventDefault: jasmine.createSpy('preventDefault'),
      returnValue: 'initial',
    };
    component.onBeforeUnload(invalidEvent as unknown as BeforeUnloadEvent);
    expect(invalidEvent.preventDefault).toHaveBeenCalled();
    component.templateDraft![0].name = 'Valid shortcut';
    const validEvent = {
      preventDefault: jasmine.createSpy('preventDefault'),
      returnValue: 'initial',
    };
    component.onBeforeUnload(validEvent as unknown as BeforeUnloadEvent);
    expect(validEvent.preventDefault).not.toHaveBeenCalled();
    expect(service.saveTemplates).toHaveBeenCalledTimes(1);
  });
});
