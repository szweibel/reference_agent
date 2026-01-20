import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export const HOURS_TOOL_NAME = 'GetHours';

const inputSchema = z
  .object({
    weeks: z.number().int().min(1).max(4).optional()
  })
  .shape;

interface LibCalTimes {
  status: string;
  hours?: Array<{ from: string; to: string }>;
  note?: string;
  currently_open: boolean;
}

interface LibCalDay {
  date: string;
  times: LibCalTimes;
  rendered: string;
}

interface LibCalWeek {
  Sunday: LibCalDay;
  Monday: LibCalDay;
  Tuesday: LibCalDay;
  Wednesday: LibCalDay;
  Thursday: LibCalDay;
  Friday: LibCalDay;
  Saturday: LibCalDay;
}

interface LibCalLocation {
  lid: number;
  name: string;
  category: string;
  url: string;
  weeks: LibCalWeek[];
}

interface LibCalResponse {
  locations: LibCalLocation[];
}

interface FormattedHours {
  name: string;
  url: string;
  today: {
    date: string;
    dayOfWeek: string;
    status: string;
    hours: string | null;
    note: string | null;
    currentlyOpen: boolean;
  };
  week: Array<{
    dayOfWeek: string;
    date: string;
    status: string;
    hours: string | null;
    note: string | null;
  }>;
}

const LIBCAL_HOURS_URL = 'https://gc-cuny.libcal.com/widget/hours/grid';
const INSTITUTION_ID = '3710';

function getDayOfWeek(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

function formatDay(day: LibCalDay): { status: string; hours: string | null; note: string | null } {
  const hours = day.times.hours
    ? day.times.hours.map((h) => `${h.from} - ${h.to}`).join(', ')
    : null;

  return {
    status: day.times.status,
    hours,
    note: day.times.note ?? null
  };
}

async function fetchHours(weeks = 1): Promise<FormattedHours[]> {
  const params = new URLSearchParams();
  params.set('iid', INSTITUTION_ID);
  params.set('format', 'json');
  params.set('weeks', String(weeks));
  params.set('systemTime', '0');

  const url = `${LIBCAL_HOURS_URL}?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`LibCal API request failed with status ${response.status}`);
  }

  const data = (await response.json()) as LibCalResponse;
  const todayStr = new Date().toISOString().split('T')[0] ?? '';

  return data.locations.map((location): FormattedHours => {
    const week = location.weeks[0];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

    let todayData: FormattedHours['today'] | null = null;
    const weekData: FormattedHours['week'] = [];

    if (week) {
      for (const dayName of days) {
        const day = week[dayName];
        const formatted = formatDay(day);

        weekData.push({
          dayOfWeek: dayName,
          date: day.date,
          status: formatted.status,
          hours: formatted.hours,
          note: formatted.note
        });

        if (day.date === todayStr) {
          todayData = {
            date: day.date,
            dayOfWeek: dayName,
            status: formatted.status,
            hours: formatted.hours,
            note: formatted.note,
            currentlyOpen: day.times.currently_open
          };
        }
      }
    }

    // Fallback if today not found in week data
    if (!todayData) {
      todayData = {
        date: todayStr,
        dayOfWeek: getDayOfWeek(todayStr),
        status: 'unknown',
        hours: null,
        note: null,
        currentlyOpen: false
      };
    }

    return {
      name: location.name,
      url: location.url ?? '',
      today: todayData,
      week: weekData
    };
  });
}

export const hoursTool = tool(
  HOURS_TOOL_NAME,
  `Get current library hours from LibCal.

Returns structured hours data for all library locations:
- Mina Rees Library (main library)
- Reference Desk
- Interlibrary Loan Office
- Archives and Special Collections

The response includes:
- Today's hours with "currentlyOpen" status (true/false)
- Full week schedule
- Holiday notes (e.g., "Martin Luther King Jr. Day")

Parameters:
- weeks: Number of weeks to return (1-4, default: 1)

Use this tool for ALL hours-related questions. It returns accurate, machine-readable data directly from LibCal - no HTML parsing required.

Examples:
- "Is the library open today?" → Check today.currentlyOpen and today.hours
- "What are the library hours this week?" → Check the week array
- "When is the Reference Desk open?" → Find location with name "Reference Desk"`,
  inputSchema,
  async ({ weeks = 1 }) => {
    try {
      const hours = await fetchHours(weeks);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                source: 'LibCal API',
                sourceUrl: 'https://gc-cuny.libcal.com/hours',
                locations: hours
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'hours_fetch_failed',
                message
              },
              null,
              2
            )
          }
        ]
      };
    }
  }
);

export type HoursToolHandler = typeof hoursTool.handler;
