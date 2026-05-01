// src/lib/calendarSync.ts
/**
 * Google Calendar Integration (Optional, Non-blocking)
 * Uses simple API approach - no complex OAuth UI
 * Syncs repayment schedules with Google Calendar
 */

interface CalendarEvent {
  summary: string;
  description: string;
  start: { date: string };
  end: { date: string };
}

interface SyncResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

/**
 * Get Google Calendar API key from environment
 * User needs to set VITE_GOOGLE_CALENDAR_API_KEY in .env
 */
function getApiKey(): string | undefined {
  return import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY;
}

/**
 * Get calendar ID from environment
 * User needs to set VITE_GOOGLE_CALENDAR_ID in .env
 */
function getCalendarId(): string | undefined {
  return import.meta.env.VITE_GOOGLE_CALENDAR_ID;
}

/**
 * Check if calendar integration is configured
 */
export function isCalendarConfigured(): boolean {
  return !!(getApiKey() && getCalendarId());
}

/**
 * Create a calendar event for a repayment due date
 * This is optional and non-blocking - errors are silently handled
 */
export async function syncRepaymentToCalendar(
  loanId: string,
  dueDate: string,
  amount: number,
  officerName: string
): Promise<SyncResult> {
  const apiKey = getApiKey();
  const calendarId = getCalendarId();

  // Silently skip if not configured
  if (!apiKey || !calendarId) {
    console.log('Google Calendar not configured - skipping sync');
    return { success: false, error: 'Calendar not configured' };
  }

  const event: CalendarEvent = {
    summary: `Loan Repayment Due - ₦${amount.toLocaleString()}`,
    description: `Loan ID: ${loanId}\nOfficer: ${officerName}\nAmount Due: ₦${amount.toLocaleString()}\n\nThis is an automated reminder from Aiders Loan Hub.\n\nNote: This is a WORKING DAY (Mon-Fri) repayment schedule.`,
    start: { date: dueDate },
    end: { date: dueDate },
  };

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Calendar sync failed:', errorData);
      
      // Log failure to database (optional, for tracking)
      await logCalendarSync(loanId, '', 'failed', errorData.error?.message || 'Unknown error');
      
      return { success: false, error: errorData.error?.message || 'Failed to sync' };
    }

    const data = await response.json();
    
    // Log successful sync
    await logCalendarSync(loanId, data.id, 'success', null);
    
    return { success: true, eventId: data.id };
  } catch (error) {
    console.error('Calendar sync error:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  const apiKey = getApiKey();
  const calendarId = getCalendarId();

  if (!apiKey || !calendarId) {
    return false;
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?key=${apiKey}`,
      { method: 'DELETE' }
    );

    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

/**
 * Log calendar sync attempts (optional database tracking)
 */
async function logCalendarSync(
  loanId: string,
  eventId: string,
  status: 'success' | 'failed',
  errorMessage: string | null
): Promise<void> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('calendar_sync_log').insert({
      loan_id: loanId,
      event_id: eventId,
      status,
      error_message: errorMessage,
    });
  } catch {
    // Silently fail - logging is not critical
    console.log('Could not log calendar sync status');
  }
}

/**
 * Sync all pending repayments to calendar (batch operation)
 * Can be called from dashboard or reports page
 * This syncs the actual repayment_schedules table (working days only)
 */
export async function syncAllPendingRepayments(): Promise<{
  synced: number;
  failed: number;
}> {
  let synced = 0;
  let failed = 0;

  if (!isCalendarConfigured()) {
    console.log('Calendar not configured');
    return { synced, failed };
  }

  try {
    const { supabase } = await import('@/integrations/supabase/client');

    // Get pending/overdue schedules with loan and officer info
    // These are already filtered to working days by the database function
    const { data: schedules } = await supabase
      .from('repayment_schedules')
      .select(`
        id,
        due_date,
        expected_amount,
        status,
        loan_id,
        loans(
          id,
          loan_officers(name)
        )
      `)
      .in('status', ['pending', 'overdue'])
      .lte('due_date', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);


    if (!schedules) {
      return { synced, failed };
    }

    for (const schedule of schedules as any[]) {
      const result = await syncRepaymentToCalendar(
        schedule.loan_id,
        schedule.due_date,
        schedule.expected_amount,
        schedule.loans?.loan_officers?.name || 'Unknown'
      );

      if (result.success) {
        synced++;
      } else {
        failed++;
      }

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (error) {
    console.error('Batch sync error:', error);
  }

  return { synced, failed };
}

/**
 * Check and mark overdue schedules (called on dashboard load)
 */
export async function checkAndMarkOverdue(): Promise<{
  marked: number;
}> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    // First check using the database function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: overdueResult } = await (supabase as any).rpc('mark_schedules_overdue');
    
    // Also get count of newly marked overdue schedules
    const today = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from('repayment_schedules')
      .select('id', { count: 'exact' })
      .eq('status', 'overdue')
      .lt('due_date', today);
    
    return { marked: count || 0 };
  } catch (error) {
    console.error('Overdue check error:', error);
    return { marked: 0 };
  }
}

/**
 * Get configuration instructions for user
 */
export function getCalendarSetupInstructions(): string {
  return `
To enable Google Calendar integration:

1. Go to Google Cloud Console (https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Google Calendar API
4. Create API credentials (API Key)
5. Add to your .env file:
   VITE_GOOGLE_CALENDAR_API_KEY=your_api_key
   VITE_GOOGLE_CALENDAR_ID=your_calendar_id

Note: This uses a simple API key approach. For production,
consider using OAuth 2.0 for better security.

IMPORTANT: Repayments are scheduled on WORKING DAYS only (Mon-Fri).
The calendar will show repayment due dates for each working day.
  `.trim();
}
