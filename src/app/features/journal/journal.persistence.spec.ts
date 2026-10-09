import { initialMetricState, metricReducer } from '../metric/store/metric.reducer';
import { updateMetric } from '../metric/store/metric.actions';
import { DEFAULT_METRIC_FOR_DAY } from '../metric/metric.const';
import { validateAppDataProperty } from '../../op-log/validation/validation-fn';

describe('Journal metric persistence', () => {
  it('preserves daily evaluation when adding a journal and preserves the journal on later evaluation updates', () => {
    const first = metricReducer(
      initialMetricState,
      updateMetric({
        metric: { id: '2026-10-09', changes: { impactOfWork: 3, focusSessions: [1000] } },
      }),
    );
    const journal = metricReducer(
      first,
      updateMetric({
        metric: {
          id: '2026-10-09',
          changes: {
            notes: 'Daily diary',
            journalPlan: 'Next day',
            journalWeekly: { text: 'Week', plan: 'Next week' },
          },
        },
      }),
    );
    const result = metricReducer(
      journal,
      updateMetric({ metric: { id: '2026-10-09', changes: { impactOfWork: 4 } } }),
    );
    expect(result.entities['2026-10-09']?.focusSessions).toEqual([1000]);
    expect(result.entities['2026-10-09']?.journalWeekly?.text).toBe('Week');
    expect(result.entities['2026-10-09']?.notes).toBe('Daily diary');
  });

  it('replays the existing metric action and validates both legacy and extended persisted metrics', () => {
    const legacy = {
      ids: ['2026-10-09'],
      entities: { ['2026-10-09']: { id: '2026-10-09', ...DEFAULT_METRIC_FOR_DAY } },
    };
    expect(validateAppDataProperty('metric', legacy).success).toBeTrue();
    const action = updateMetric({
      metric: {
        id: '2026-10-09',
        changes: {
          journalActivities: [
            {
              id: 'a',
              title: 'Study',
              start: 540,
              end: 600,
              categoryId: 'study',
              kind: 'actual',
            },
          ],
        },
      },
    });
    const extended = metricReducer(legacy, action);
    expect(validateAppDataProperty('metric', extended).success).toBeTrue();
    expect(metricReducer(legacy, action)).toEqual(extended);
    expect(action.meta.entityType).toBe('METRIC');
    expect(action.meta.entityId).toBe('2026-10-09');
  });
});
