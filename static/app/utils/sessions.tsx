import compact from 'lodash/compact';
import mean from 'lodash/mean';
import moment from 'moment';

import {
  DateTimeObject,
  getDiffInMinutes,
  SIX_HOURS,
  SIXTY_DAYS,
  THIRTY_DAYS,
} from 'sentry/components/charts/utils';
import {IconCheckmark, IconFire, IconWarning} from 'sentry/icons';
import {SessionApiResponse, SessionField, SessionStatus} from 'sentry/types';
import {SeriesDataUnit} from 'sentry/types/echarts';
import {defined, percent} from 'sentry/utils';
import {IconSize, Theme} from 'sentry/utils/theme';
import {getCrashFreePercent, getSessionStatusPercent} from 'sentry/views/releases/utils';
import {sessionTerm} from 'sentry/views/releases/utils/sessionTerm';

/**
 * If the time window is less than or equal 10, seconds will be displayed on the graphs
 */
export const MINUTES_THRESHOLD_TO_DISPLAY_SECONDS = 10;

const CRASH_FREE_DANGER_THRESHOLD = 98;
const CRASH_FREE_WARNING_THRESHOLD = 99.5;

export function getCount(groups: SessionApiResponse['groups'] = [], field: SessionField) {
  return groups.reduce((acc, group) => acc + group.totals[field], 0);
}

export function getCountAtIndex(
  groups: SessionApiResponse['groups'] = [],
  field: SessionField,
  index: number
) {
  return groups.reduce((acc, group) => acc + group.series[field][index], 0);
}

export function getCrashFreeRate(
  groups: SessionApiResponse['groups'] = [],
  field: SessionField
) {
  const crashedRate = getSessionStatusRate(groups, field, SessionStatus.CRASHED);

  return defined(crashedRate) ? getCrashFreePercent(100 - crashedRate) : null;
}

export function getSeriesAverage(
  groups: SessionApiResponse['groups'] = [],
  field: SessionField
) {
  const totalCount = getCount(groups, field);

  const dataPoints = groups.filter(group => !!group.totals[field]).length;

  return !defined(totalCount) || dataPoints === null || totalCount === 0
    ? null
    : totalCount / dataPoints;
}

export function getSessionStatusRate(
  groups: SessionApiResponse['groups'] = [],
  field: SessionField,
  status: SessionStatus
) {
  const totalCount = getCount(groups, field);

  const crashedCount = getCount(
    groups.filter(({by}) => by['session.status'] === status),
    field
  );

  return !defined(totalCount) || totalCount === 0
    ? null
    : percent(crashedCount ?? 0, totalCount ?? 0);
}

export function getCrashFreeRateSeries(
  groups: SessionApiResponse['groups'] = [],
  intervals: SessionApiResponse['intervals'] = [],
  field: SessionField
): SeriesDataUnit[] {
  return compact(
    intervals.map((interval, i) => {
      const intervalTotalSessions = groups.reduce(
        (acc, group) => acc + group.series[field][i],
        0
      );

      const intervalCrashedSessions =
        groups.find(group => group.by['session.status'] === SessionStatus.CRASHED)
          ?.series[field][i] ?? 0;

      const crashedSessionsPercent = percent(
        intervalCrashedSessions,
        intervalTotalSessions
      );

      if (intervalTotalSessions === 0) {
        return null;
      }

      return {
        name: interval,
        value: getCrashFreePercent(100 - crashedSessionsPercent),
      };
    })
  );
}

export function getSessionStatusRateSeries(
  groups: SessionApiResponse['groups'] = [],
  intervals: SessionApiResponse['intervals'] = [],
  field: SessionField,
  status: SessionStatus
): SeriesDataUnit[] {
  return compact(
    intervals.map((interval, i) => {
      const intervalTotalSessions = groups.reduce(
        (acc, group) => acc + group.series[field][i],
        0
      );

      const intervalStatusSessions =
        groups.find(group => group.by['session.status'] === status)?.series[field][i] ??
        0;

      const statusSessionsPercent = percent(
        intervalStatusSessions,
        intervalTotalSessions
      );

      if (intervalTotalSessions === 0) {
        return null;
      }

      return {
        name: interval,
        value: getSessionStatusPercent(statusSessionsPercent),
      };
    })
  );
}

export function getSessionP50Series(
  groups: SessionApiResponse['groups'] = [],
  intervals: SessionApiResponse['intervals'] = [],
  field: SessionField,
  valueFormatter?: (value: number) => number
): SeriesDataUnit[] {
  return compact(
    intervals.map((interval, i) => {
      const meanValue = mean(
        groups.map(group => group.series[field][i]).filter(v => !!v)
      );

      if (!meanValue) {
        return null;
      }

      return {
        name: interval,
        value:
          typeof valueFormatter === 'function' ? valueFormatter(meanValue) : meanValue,
      };
    })
  );
}

export function getAdoptionSeries(
  releaseGroups: SessionApiResponse['groups'] = [],
  allGroups: SessionApiResponse['groups'] = [],
  intervals: SessionApiResponse['intervals'] = [],
  field: SessionField
): SeriesDataUnit[] {
  return intervals.map((interval, i) => {
    const intervalReleaseSessions = releaseGroups.reduce(
      (acc, group) => acc + (group.series[field]?.[i] ?? 0),
      0
    );
    const intervalTotalSessions = allGroups.reduce(
      (acc, group) => acc + (group.series[field]?.[i] ?? 0),
      0
    );

    const intervalAdoption = percent(intervalReleaseSessions, intervalTotalSessions);

    return {
      name: interval,
      value: Math.round(intervalAdoption),
    };
  });
}

export function getCountSeries(
  field: SessionField,
  group?: SessionApiResponse['groups'][0],
  intervals: SessionApiResponse['intervals'] = []
): SeriesDataUnit[] {
  return intervals.map((interval, index) => ({
    name: interval,
    value: group?.series[field][index] ?? 0,
  }));
}

export function initSessionsChart(theme: Theme) {
  const colors = theme.charts.getColorPalette(14);
  return {
    [SessionStatus.HEALTHY]: {
      seriesName: sessionTerm.healthy,
      data: [],
      color: theme.green300,
      areaStyle: {
        color: theme.green300,
        opacity: 1,
      },
      lineStyle: {
        opacity: 0,
        width: 0.4,
      },
    },
    [SessionStatus.ERRORED]: {
      seriesName: sessionTerm.errored,
      data: [],
      color: colors[12],
      areaStyle: {
        color: colors[12],
        opacity: 1,
      },
      lineStyle: {
        opacity: 0,
        width: 0.4,
      },
    },
    [SessionStatus.ABNORMAL]: {
      seriesName: sessionTerm.abnormal,
      data: [],
      color: colors[15],
      areaStyle: {
        color: colors[15],
        opacity: 1,
      },
      lineStyle: {
        opacity: 0,
        width: 0.4,
      },
    },
    [SessionStatus.CRASHED]: {
      seriesName: sessionTerm.crashed,
      data: [],
      color: theme.red300,
      areaStyle: {
        color: theme.red300,
        opacity: 1,
      },
      lineStyle: {
        opacity: 0,
        width: 0.4,
      },
    },
  };
}

type GetSessionsIntervalOptions = {
  highFidelity?: boolean;
};

export function getSessionsInterval(
  datetimeObj: DateTimeObject,
  {highFidelity}: GetSessionsIntervalOptions = {}
) {
  const diffInMinutes = getDiffInMinutes(datetimeObj);

  if (moment(datetimeObj.start).isSameOrBefore(moment().subtract(30, 'days'))) {
    // we cannot use sub-hour session resolution on buckets older than 30 days
    highFidelity = false;
  }

  if (diffInMinutes >= SIXTY_DAYS) {
    return '1d';
  }

  if (diffInMinutes >= THIRTY_DAYS) {
    return '4h';
  }

  if (diffInMinutes >= SIX_HOURS) {
    return '1h';
  }

  // limit on backend for sub-hour session resolution is set to six hours
  if (highFidelity) {
    if (diffInMinutes <= MINUTES_THRESHOLD_TO_DISPLAY_SECONDS) {
      // This only works for metrics-based session stats.
      // Backend will silently replace with '1m' for session-based stats.
      return '10s';
    }

    if (diffInMinutes <= 30) {
      return '1m';
    }

    return '5m';
  }

  return '1h';
}

// Sessions API can only round intervals to the closest hour - this is especially problematic when using sub-hour resolution.
// We filter out results that are out of bounds on frontend and recalculate totals.
export function filterSessionsInTimeWindow(
  sessions: SessionApiResponse,
  start?: string,
  end?: string
) {
  if (!start || !end) {
    return sessions;
  }

  const filteredIndexes: number[] = [];

  const intervals = sessions.intervals.filter((interval, index) => {
    const isBetween = moment
      .utc(interval)
      .isBetween(moment.utc(start), moment.utc(end), undefined, '[]');
    if (isBetween) {
      filteredIndexes.push(index);
    }

    return isBetween;
  });

  const groups = sessions.groups.map(group => {
    const series = {};
    const totals = {};
    Object.keys(group.series).forEach(field => {
      totals[field] = 0;
      series[field] = group.series[field].filter((value, index) => {
        const isBetween = filteredIndexes.includes(index);
        if (isBetween) {
          totals[field] = (totals[field] ?? 0) + value;
        }

        return isBetween;
      });
      if (field.startsWith('p50')) {
        totals[field] = mean(series[field]);
      }
      if (field.startsWith('count_unique')) {
        /* E.g. users
        We cannot sum here because users would not be unique anymore.
        User can be repeated and part of multiple buckets in series but it's still that one user so totals would be wrong.
        This operation is not 100% correct, because we are filtering series in time window but the total is for unfiltered series (it's the closest thing we can do right now) */
        totals[field] = group.totals[field];
      }
    });
    return {...group, series, totals};
  });

  return {
    start: intervals[0],
    end: intervals[intervals.length - 1],
    query: sessions.query,
    intervals,
    groups,
  };
}

export function getCrashFreeIcon(crashFreePercent: number, iconSize: IconSize = 'sm') {
  if (crashFreePercent < CRASH_FREE_DANGER_THRESHOLD) {
    return <IconFire color="red300" size={iconSize} />;
  }

  if (crashFreePercent < CRASH_FREE_WARNING_THRESHOLD) {
    return <IconWarning color="yellow300" size={iconSize} />;
  }

  return <IconCheckmark isCircled color="green300" size={iconSize} />;
}
