// Pins the timezone for tests so the local-vs-UTC date assertions are meaningful
// on any machine. In UTC the two are identical, which would let the rollover bug
// in toDateString pass unnoticed. US Eastern is 4-5 hours west of UTC, so any
// accidental return to toISOString() fails loudly.
process.env.TZ = "America/New_York";
