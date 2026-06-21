# FMP API drift — how we catch it

NWC reads dozens of fields off Financial Modeling Prep's `/stable/` API. When FMP
renames or drops a field, our code reads `None` **silently** — no error, just wrong
or blank data downstream (this is what blanked the Relative Valuation forward
estimates and mis-bucketed DCF `size_category`). There is no `/api/v3/` left to
migrate; everything is already on `/stable/`. The recurring risk is **field-name
drift**, and we have two tools plus one automated job to catch it.

## 1. `audit_fmp_fields.py` — active drift detector (primary)

Probes each registered endpoint against a live `/stable/` response and flags any
field the registry documents that the response no longer returns. Needs no
changelog — it checks reality.

```bash
cd backend
python scripts/audit_fmp_fields.py                # full report
python scripts/audit_fmp_fields.py --json         # machine-readable
python scripts/audit_fmp_fields.py profile quote  # only these endpoints
```

Requires `MASSIVE_API_KEY` — export it or put it in `backend/.env` (gitignored).
**Never commit the key in the script.** Exit code is non-zero if anything is
`[MISSING]`, so it can gate CI.

Statuses: `[OK]` (all documented fields present) · `[MISSING]` (documented field
absent from live → a real drift to fix) · `[NO_DATA]`/`[ERROR]` (usually a sample
param tweak or transient rate-limit, not a field bug).

## 2. Weekly automated audit (`app/tasks/audit_fmp_fields_task.py`)

An `AsyncIOScheduler` job (registered in `main.py`, **Mon 13:00 UTC**) runs the same
audit and **emails only when something is `MISSING`** — silent when clean. Errors
alone aren't emailed (often transient). Recipient = `AUDIT_ALERT_EMAIL`, falling
back to `SUPPORT_EMAIL`. The full report is always written to the logs.

Run it on demand: `python -m app.tasks.audit_fmp_fields_task`.

## 3. `changelog_review.py` — reactive, all vendors (Admin → Maintenance)

When you get a vendor change email (FMP, Stripe, Twilio, SendGrid, …), paste it
into Admin → Maintenance → Vendor Changelog Review. Claude maps it to NWC's
registered dependencies and returns a report. Use this for vendors where we can't
probe live (Stripe/Twilio/etc.); for FMP, the audit above is the stronger signal.

## When the audit reports `[MISSING]`

1. Get the real field name: `python scripts/audit_fmp_fields.py <endpoint> --json`
   and read `live_keys`.
2. Fix the **code** read with a defensive fallback, e.g.
   `item.get("newName") or item.get("oldName")`. Use a key-present check (not `or`)
   when `0`/negative is a valid value (see `_pick` in `relative_valuation.py`).
3. Update the endpoint's `key_fields` in `app/services/fmp_endpoint_registry.py`
   to the live name.
4. Re-run the audit → expect zero `[MISSING]`.

## Important limitation

The audit validates the **registry** against live responses — it does **not** know
what field names the *code* actually reads. If the registry is right but the code
reads a stale name, the audit shows `[OK]` while the code is broken (this is how the
`company-screener` `exchangeShortName` bug hid). So: keep `key_fields` in lockstep
with the actual `.get(...)` calls, and when touching an FMP consumer, confirm the
names against the live `--json` output.
```
audit_fmp_fields.py  →  guards the registry
you                  →  keep the code's reads matching the registry
```
