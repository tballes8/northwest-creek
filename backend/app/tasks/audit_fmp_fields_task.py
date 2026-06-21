"""
Weekly FMP /stable/ field-name audit job.

Runs the shared audit (app/services/fmp_field_audit.py) against live FMP responses
and emails an alert ONLY when a documented field is MISSING — i.e. a field name
drifted out from under us (the class of bug that silently returned None, e.g.
`mktCap`/`estimatedEpsAvg`). Registered as a weekly AsyncIOScheduler job in main.py;
also runnable manually: `python -m app.tasks.audit_fmp_fields_task`.

Alert policy: email on MISSING only. ERROR alone is usually transient
(rate-limit / network), so it's logged but not emailed to avoid false alarms.
"""
import asyncio
import logging

from app.config import get_settings
from app.services.fmp_field_audit import (
    run_audit,
    summarize,
    format_text_report,
    format_html_report,
)
from app.services.email_service import email_service

logger = logging.getLogger(__name__)


async def fmp_field_audit_job() -> None:
    """APScheduler entrypoint: audit FMP fields, alert on drift."""
    settings = get_settings()
    api_key = settings.MASSIVE_API_KEY
    if not api_key:
        logger.warning("FMP field audit skipped: MASSIVE_API_KEY not configured")
        return

    try:
        results = await run_audit(api_key)
    except Exception as e:  # noqa: BLE001
        logger.error(f"FMP field audit run failed: {e}")
        return

    s = summarize(results)
    logger.info(
        f"FMP field audit: {len(s['missing'])} MISSING | {len(s['errors'])} ERROR | "
        f"{len(s['no_data'])} NO_DATA | {len(s['ok'])} OK / {s['total']}"
    )
    # Always emit the full report to logs (visible in Railway).
    print(format_text_report(results), flush=True)

    if not s["missing"]:
        return  # all clean — stay silent

    recipient = settings.AUDIT_ALERT_EMAIL or settings.SUPPORT_EMAIL
    if not recipient:
        logger.warning(
            "FMP field audit found drift but no AUDIT_ALERT_EMAIL / SUPPORT_EMAIL is set — not emailing"
        )
        return

    subject = f"[NWC] FMP field audit: {len(s['missing'])} endpoint(s) with stale field names"
    html = format_html_report(results)
    # email_service.send_email is synchronous; offload so we don't block the loop.
    sent = await asyncio.to_thread(email_service.send_email, recipient, subject, html)
    if sent:
        logger.info(f"FMP field audit alert emailed to {recipient}")
    else:
        logger.error("FMP field audit alert email failed to send")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(fmp_field_audit_job())
