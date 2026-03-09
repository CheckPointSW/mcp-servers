export function getCurrentDateStr(): string {
  const now = new Date();
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = now.toISOString().slice(0, 19).replace('T', ' ');
  return `${dayOfWeek} ${dateStr}`;
}

export function convertStringToDateTime(dateStr: string): Date {
  return new Date(dateStr);
}

export function checkDataInTimeFrame(date: Date, fromDate: Date | null, toDate: Date | null): boolean {
  if (fromDate && date < fromDate) {
    return false;
  }
  if (toDate && date > toDate) {
    return false;
  }
  return true;
}

export async function generateDates(kwargs: Record<string, any>): Promise<[Date | null, Date | null]> {
  let fromDate: Date | null = null;
  let toDate: Date | null = null;

  if (kwargs['from_date']) {
    fromDate = convertStringToDateTime(kwargs['from_date']);
  }

  if (kwargs['to_date']) {
    toDate = convertStringToDateTime(kwargs['to_date']);
  }

  return [fromDate, toDate];
}

export function checkSessionUser(session: any, user: string): boolean {
  return !user || session['user-name'] === user;
}

export function checkSessionInTimeFrame(session: any, fromDate: Date | null, toDate: Date | null): boolean {
  const publishTimeStr = session['publish-time']?.['iso-8601'];
  if (!publishTimeStr) {
    return false;
  }
  const publishTime = new Date(publishTimeStr);
  return checkDataInTimeFrame(publishTime, fromDate, toDate);
}
