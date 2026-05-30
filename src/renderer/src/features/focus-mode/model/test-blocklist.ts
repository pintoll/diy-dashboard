// Phase 1 hardcoded test domains for validating the hosts engine. The real
// blocklist config UI lands in a later phase. youtube.com / www.youtube.com are
// blocked while music.youtube.com is deliberately left out to confirm the
// surgical (subdomain-level) blocking works.
export const TEST_BLOCKLIST: string[] = ["www.youtube.com", "youtube.com"];
