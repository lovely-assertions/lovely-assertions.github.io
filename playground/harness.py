"""Run documentation snippets the way the documentation itself runs them.

This file is the playground and the parity gate, both. The gate replays every
documented example through exactly this code and compares the result against the
output committed beside that example -- which only proves something about the
playground because it is the same harness, not a second one that resembles it.

Two things here are load-bearing.

**Priming linecache.** ``lovely_assertions`` names the reader's own variable in
its messages -- "Expected server_name to start with ..." -- by reading back the
source line the assertion was written on, through ``linecache``. When that comes
up empty it falls back to the words "the value". Under ``exec`` there is no file
on disk, so *every* message silently degrades: no crash, no warning, just a
weaker sentence. That is the library's headline feature quietly switched off in
front of the people the playground exists to convince. The ``None`` in the cache
tuple is the mtime, and it is what stops ``linecache.checkcache`` deciding the
entry is stale and dropping it.

**Blocks share a namespace.** A page's examples are one session: the first block
imports ``expect`` and the fifth one uses it. The library's own docs harness runs
each page as a single program for exactly this reason, so this does too --
otherwise a quarter of the corpus fails with ``NameError`` and the gate is
measuring the harness rather than the library.
"""

from __future__ import annotations

import contextlib
import io
import linecache
import sys
import traceback


def _readable_traceback(error: BaseException, filename: str) -> str:
    """The traceback, minus the machinery the reader did not write.

    Frames for this harness and for the library's internals are noise to
    somebody evaluating the library: they came to see their own line and the
    sentence it produced. The docs quote the message alone, so this does too.
    """
    frames = [
        frame for frame in traceback.extract_tb(error.__traceback__) if frame.filename == filename
    ]

    lines = ["Traceback (most recent call last):\n"] if frames else []
    lines.extend(traceback.format_list(frames))
    lines.extend(traceback.format_exception_only(type(error), error))
    return "".join(lines)


def _execute(source: str, namespace: dict, filename: str) -> str:
    """Run one block in ``namespace``; return what it printed, or its failure.

    The two outcomes mirror the library's own harness exactly: a raised
    ``AssertionFailure`` is reported as its message, because that is what the
    docs quote, and anything else is captured output.
    """
    linecache.cache[filename] = (len(source), None, source.splitlines(keepends=True), filename)
    captured = io.StringIO()

    try:
        with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
            exec(compile(source, filename, "exec"), namespace)  # noqa: S102
    except BaseException as error:  # noqa: BLE001 - a playground reports, it does not judge
        failure = type(error).__name__ == "AssertionFailure"
        # A failure message is the documented output. Any other exception is a
        # real error, and the reader wants to see where it came from.
        return str(error) if failure else captured.getvalue() + _readable_traceback(error, filename)
    finally:
        linecache.cache.pop(filename, None)

    return captured.getvalue()


def run(source: str) -> str:
    """Execute one self-contained snippet. The playground's entry point."""
    return _execute(source, {"__name__": "__main__"}, "<playground>")


def forget() -> None:
    """Drop ``lovely_assertions`` from ``sys.modules`` so the next import is fresh.

    A new namespace per run is not isolation. ``sys.modules`` belongs to the
    interpreter, so a reader who rebinds something on the module -- one line,
    ``la.expect = lambda *a, **k: None`` -- changes what every later run prints,
    including runs of blocks they never touched, while the page still labels
    those blocks as verified in CI. Measured on the reference page: 21 of its
    23 quoted blocks then disagree with what is printed beside them.

    Only worth paying once a session has been edited: it forces a re-import
    from the wheel, which is the difference between a run in milliseconds and
    one in a fraction of a second.
    """
    for name in [key for key in sys.modules if key.split(".")[0] == "lovely_assertions"]:
        del sys.modules[name]


def run_page(sources: list[str]) -> list[str]:
    """Execute a page's blocks in order, sharing one namespace.

    Each block gets its own filename so that ``linecache`` resolves subject
    names against the block the reader is looking at, rather than against an
    assembled script whose line numbers would not match anything on the page.
    """
    namespace: dict = {"__name__": "__main__"}
    return [
        _execute(source, namespace, f"<playground:{index}>")
        for index, source in enumerate(sources)
    ]
