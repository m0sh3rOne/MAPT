from datetime import datetime, timezone, timedelta, time
from zoneinfo import ZoneInfo
from typing import Optional, List
import calendar
from app.core.config import settings


def get_local_zone(tz_name: Optional[str] = None) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name or settings.TIMEZONE)
    except Exception:
        return ZoneInfo("Europe/Paris")


def parse_time_str(time_str: Optional[str]) -> time:
    """Parses 'HH:MM' or 'HH:MM:SS' string into a time object."""
    if not time_str:
        return time(8, 0, 0)
    parts = time_str.strip().split(":")
    h = int(parts[0]) if len(parts) > 0 else 8
    m = int(parts[1]) if len(parts) > 1 else 0
    s = int(parts[2]) if len(parts) > 2 else 0
    return time(h, m, s)


def compute_next_run(
    schedule_type: str,
    scheduled_at: Optional[datetime] = None,
    scheduled_time: Optional[str] = None,
    scheduled_days_of_week: Optional[str] = None,  # "1,2,3,4,5" (1=Mon, 7=Sun)
    interval_value: Optional[int] = None,
    interval_unit: Optional[str] = None,  # "hours", "days", "weeks", "months", "years"
    cron_expression: Optional[str] = None,
    from_time: Optional[datetime] = None,
    timezone_name: Optional[str] = None
) -> Optional[datetime]:
    """
    Calcule la prochaine date et heure d'exécution UTC en tenant compte du fuseau horaire local.
    """
    tz = get_local_zone(timezone_name)
    now_utc = from_time or datetime.now(timezone.utc)
    if not now_utc.tzinfo:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    
    now_local = now_utc.astimezone(tz)
    target_time = parse_time_str(scheduled_time)

    if schedule_type == "on_login":
        # Event-triggered upon user logon; not scheduled via clock
        return None

    if schedule_type == "immediate":
        return now_utc

    elif schedule_type == "once":
        if scheduled_at:
            if not scheduled_at.tzinfo:
                return scheduled_at.replace(tzinfo=timezone.utc)
            return scheduled_at.astimezone(timezone.utc)
        return now_utc

    elif schedule_type == "hourly":
        hours = interval_value if (interval_value and interval_value > 0) else 1
        return now_utc + timedelta(hours=hours)

    elif schedule_type == "daily":
        days_step = interval_value if (interval_value and interval_value > 0) else 1
        candidate_local = datetime(
            now_local.year, now_local.month, now_local.day,
            target_time.hour, target_time.minute, target_time.second,
            tzinfo=tz
        )
        if candidate_local <= now_local:
            candidate_local += timedelta(days=days_step)
        return candidate_local.astimezone(timezone.utc)

    elif schedule_type == "weekly":
        active_days = set()
        if scheduled_days_of_week:
            for part in scheduled_days_of_week.split(","):
                part = part.strip()
                if part.isdigit():
                    active_days.add(int(part))
        if not active_days:
            active_days = {1, 2, 3, 4, 5}

        for offset in range(0, 15):
            day_candidate = now_local + timedelta(days=offset)
            iso_weekday = day_candidate.isoweekday()
            if iso_weekday in active_days:
                candidate_local = datetime(
                    day_candidate.year, day_candidate.month, day_candidate.day,
                    target_time.hour, target_time.minute, target_time.second,
                    tzinfo=tz
                )
                if candidate_local > now_local:
                    return candidate_local.astimezone(timezone.utc)

        return (now_local + timedelta(days=7)).astimezone(timezone.utc)

    elif schedule_type == "monthly":
        months_step = interval_value if (interval_value and interval_value > 0) else 1
        year = now_local.year
        month = now_local.month
        candidate_local = datetime(
            year, month, min(now_local.day, calendar.monthrange(year, month)[1]),
            target_time.hour, target_time.minute, target_time.second,
            tzinfo=tz
        )
        if candidate_local <= now_local:
            month += months_step
            while month > 12:
                month -= 12
                year += 1
            day = min(now_local.day, calendar.monthrange(year, month)[1])
            candidate_local = datetime(
                year, month, day,
                target_time.hour, target_time.minute, target_time.second,
                tzinfo=tz
            )
        return candidate_local.astimezone(timezone.utc)

    elif schedule_type == "yearly":
        year = now_local.year
        candidate_local = datetime(
            year, now_local.month, min(now_local.day, calendar.monthrange(year, now_local.month)[1]),
            target_time.hour, target_time.minute, target_time.second,
            tzinfo=tz
        )
        if candidate_local <= now_local:
            year += (interval_value if interval_value and interval_value > 0 else 1)
            day = min(now_local.day, calendar.monthrange(year, now_local.month)[1])
            candidate_local = datetime(
                year, now_local.month, day,
                target_time.hour, target_time.minute, target_time.second,
                tzinfo=tz
            )
        return candidate_local.astimezone(timezone.utc)

    elif schedule_type == "cron" and cron_expression:
        try:
            import croniter
            cron = croniter.croniter(cron_expression, now_local)
            next_dt = cron.get_next(datetime)
            if not next_dt.tzinfo:
                next_dt = next_dt.replace(tzinfo=tz)
            return next_dt.astimezone(timezone.utc)
        except Exception:
            return now_utc + timedelta(hours=1)

    return now_utc + timedelta(hours=1)
