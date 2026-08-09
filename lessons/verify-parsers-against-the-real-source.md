# Verify parsers against the real source, never against your own fixture

Summary: the SEC EDGAR adapter passed every test it had and was broken on live
data. The tests used a fixture written from the same assumptions as the parser,
so they could only ever confirm those assumptions back. One request to the real
feed found two defects in under a minute.

## What the fixture could not know

**Form types carry separators.** The invented fixture had `C - COMPANY NAME
(0001234567) (Filer)`. The live feed carries `C/A`, `C-U`, `C-AR`, `C-W`. The
parser's character class was `[A-Z0-9-]+`, which excludes the slash, so every
amendment failed to match and fell through to a fallback that reported the entire
title string as the company name. Roughly half of live filings are amendments.

**Not every Form C is a raise.** `C` is a new offering and `C/A` amends one, but
`C-U` is a progress update on an offering already under way and `C-AR` is an
annual report from an issuer that raised years ago. A page headed "live raises"
listing annual reports is not a formatting problem, it is wrong. The fixture had
no variants, so the distinction was invisible and the code had no concept of it.

Both defects would have shipped. Neither was a coding mistake: the parser did
exactly what its author believed the data looked like. The fixture inherited that
belief and validated it.

## The rule

A fixture tests that the parser matches the fixture. Only the live source tests
that the parser matches reality. Before writing a fixture, fetch the real thing
once, read it, and build the fixture from the bytes that came back. Keep the
variants that surprised you in it: the fixture is now carrying information rather
than reflecting an assumption.

This is cheap. One request, one look at the first record. The cost of skipping it
is a feature that passes CI and is broken for every user.

## Related discipline already in the codebase

The unparsed-versus-undisclosed split from AngelScope belongs here too. When the
proxy is absent in local development, the dev server answers every path with the
app shell, and the XML parser reported that as "parser degraded" — blaming the
data for a missing endpoint. Detecting an HTML body and raising
`DiscoveryUnavailableError` keeps the two diagnoses apart. Our bug, their
non-disclosure, and our missing infrastructure are three different findings and
must never be rendered as one.

Related: [[a-gate-that-never-binds-is-decoration]],
[[authored-inputs-masquerading-as-signal]]
