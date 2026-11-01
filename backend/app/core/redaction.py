"""
Credential redaction for error text and logs.

Pure: stdlib only, no app.config, so the crons and scripts can import it without the
web app's settings.

httpx quotes the request URL in its error text ("Client error '403 Forbidden' for url
'https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=...'"), and FMP and
FRED take their keys as query parameters, so any exception from an HTTP call can carry
a credential. Two ways in, and nothing else should redact on its own:

- safe_error(exc) for any message built from an exception: an HTTP error detail, a
  print line, a log line.
- install_log_redaction(), called once per process at startup (app/main.py and each
  task's __main__), which redacts every LogRecord: the httpx logger's own
  "HTTP Request: GET <url>" lines, tracebacks from logger.exception, and any log line
  that missed safe_error. It also covers the interpreter's report of an uncaught
  exception. print() bypasses logging, so print lines still need safe_error, and a
  traceback is printed with print_redacted_exc(), never traceback.print_exc().

    python -m app.core.redaction --selftest
"""
import logging
import re
import sys
import traceback
from collections.abc import Mapping

# Credentials passed as query values. The broader of the two patterns this replaced
# (services/changelog_review.py's), with no leading word boundary so prefixed names
# (client_secret=, refresh_token=, x_api_key=) are caught too. Over-matching costs a
# blanked value in a message; under-matching costs a key in the logs.
SECRET_PARAM = re.compile(r"(?i)(apikey|api_key|access_token|token|secret|key)=([^&\s\"'<>]+)")

MASK = "***"


def redact(text: str, mask: str = MASK) -> str:
    """`text` with every credential query value replaced by `mask`."""
    return SECRET_PARAM.sub(lambda m: f"{m.group(1)}={mask}", text)


def safe_error(exc: BaseException) -> str:
    """An exception's message with credentials blanked: what may be shown or logged."""
    return redact(str(exc))


def print_redacted_exc() -> None:
    """traceback.print_exc() with credentials blanked."""
    sys.stderr.write(redact(traceback.format_exc()))


# ── Log-record net ────────────────────────────────────────────────────────────
#
# A record factory rather than a handler filter: a filter on a logger never sees
# records propagated from its children, and handlers come and go (uvicorn installs its
# own), while every record in the process is made by the factory.
#
# It must never break formatting. uvicorn's access formatter unpacks record.args
# itself, so a record is redacted argument by argument when that suffices, keeping the
# args' shape; only a secret split across the template and an argument
# ("apikey=%s", key) collapses the record to its redacted message. Any failure leaves
# the record as it was.

_traceback_formatter = logging.Formatter()


def _redact_arg(arg):
    if arg is None or isinstance(arg, (int, float)):
        return arg
    text = arg if isinstance(arg, str) else str(arg)
    clean = redact(text)
    return arg if clean == text else clean


def _has_secret(text: str) -> bool:
    # Not SECRET_PARAM.search: an already-masked "apikey=***" matches the pattern too.
    return redact(text) != text


def _redact_record(record: logging.LogRecord) -> None:
    message = record.getMessage()
    if _has_secret(message):
        if isinstance(record.args, Mapping):
            record.args = {k: _redact_arg(v) for k, v in record.args.items()}
        elif isinstance(record.args, tuple):
            record.args = tuple(_redact_arg(a) for a in record.args)
        try:
            leaked = _has_secret(record.getMessage())
        except Exception:
            leaked = True
        if leaked:
            record.msg, record.args = redact(message), None
    # A traceback is rendered by the handler's formatter, which keeps exc_text when it
    # is already set; set it only when there is something to hide.
    if record.exc_info and not record.exc_text:
        text = _traceback_formatter.formatException(record.exc_info)
        if _has_secret(text):
            record.exc_text = redact(text)
    if record.stack_info and _has_secret(record.stack_info):
        record.stack_info = redact(record.stack_info)


def install_log_redaction() -> None:
    """Redact credentials from every LogRecord made in this process, and from the
    interpreter's report of an uncaught exception (where a cron that re-raises ends).
    Idempotent."""
    base = logging.getLogRecordFactory()
    if not getattr(base, "_nwc_redacting", False):
        def factory(*args, **kwargs):
            record = base(*args, **kwargs)
            try:
                _redact_record(record)
            except Exception:
                pass  # a malformed record is logging's to report, not ours to drop
            return record

        factory._nwc_redacting = True
        logging.setLogRecordFactory(factory)

    hook = sys.excepthook
    if not getattr(hook, "_nwc_redacting", False):
        def excepthook(exc_type, exc, tb):
            try:
                sys.stderr.write(redact("".join(traceback.format_exception(exc_type, exc, tb))))
            except Exception:
                hook(exc_type, exc, tb)

        excepthook._nwc_redacting = True
        sys.excepthook = excepthook


def _selftest() -> None:
    import io

    key = "s3cr3tK3y"
    url = f"https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey={key}"
    err = f"Client error '403 Forbidden' for url '{url}'"
    assert redact(err) == err.replace(key, MASK)
    for raw, want in [
        (f"?apiKey={key}&x=1", "?apiKey=***&x=1"),          # casing kept, value blanked
        (f"api_key={key}", "api_key=***"),
        (f"access_token={key}", "access_token=***"),
        (f"refresh_token={key}", "refresh_token=***"),
        (f"client_secret={key}", "client_secret=***"),
        (f"TOKEN={key} trailing", "TOKEN=*** trailing"),
        (f"URL('{url}')", f"URL('{url.replace(key, MASK)}')"),
        ("symbol=AAPL&limit=5", "symbol=AAPL&limit=5"),   # nothing to hide
    ]:
        assert redact(raw) == want, (raw, redact(raw))
    assert redact(f"apikey={key}", "[REDACTED]") == "apikey=[REDACTED]"
    assert safe_error(ValueError(err)) == err.replace(key, MASK)

    install_log_redaction()
    install_log_redaction()  # idempotent: one wrapper, not two
    assert getattr(logging.getLogRecordFactory(), "_nwc_redacting", False)
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(name)s %(message)s"))
    root = logging.getLogger()
    root.addHandler(handler)
    root.setLevel(logging.DEBUG)
    try:
        class URL:  # httpx.URL stand-in: an object, logged via %s
            def __init__(self, u): self.u = u
            def __str__(self): return self.u
        # httpx's own request line, emitted by a CHILD logger and propagated to root
        logging.getLogger("httpx").info('HTTP Request: %s %s "%s %d %s"', "GET", URL(url), "HTTP/1.1", 200, "OK")
        logging.getLogger("app.x").warning(f"Batch failed: {err}")            # f-string
        logging.getLogger("app.x").warning("apikey=%s", key)                   # split secret
        logging.getLogger("app.x").warning("fine %s %d", "AAPL", 3)            # untouched
        try:
            raise RuntimeError(err)
        except RuntimeError:
            logging.getLogger("app.x").exception("pass failed")
        # uvicorn's access formatter unpacks args itself: shape must survive
        rec = logging.getLogger("uvicorn.access").makeRecord(
            "uvicorn.access", logging.INFO, __file__, 1, '%s - "%s %s HTTP/%s" %d',
            ("1.2.3.4:5", "GET", f"/api/v1/auth/verify-email?token={key}", "1.1", 200), None)
        client, method, path, version, status = rec.args
        assert key not in path and status == 200 and isinstance(rec.args, tuple)
    finally:
        root.removeHandler(handler)
    out = stream.getvalue()
    real_stderr, sys.stderr = sys.stderr, io.StringIO()
    try:
        try:
            raise RuntimeError(err)
        except RuntimeError as exc:
            print_redacted_exc()
            sys.excepthook(RuntimeError, exc, exc.__traceback__)  # a cron's uncaught re-raise
        out += sys.stderr.getvalue()
    finally:
        sys.stderr = real_stderr
    assert out.count("Traceback") == 3, out
    assert key not in out, out
    assert 'HTTP Request: GET https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=*** "HTTP/1.1 200 OK"' in out, out
    assert "app.x apikey=***" in out and "fine AAPL 3" in out, out
    print("redaction selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv[1:]:
        _selftest()
    else:
        print("usage: python -m app.core.redaction --selftest")
